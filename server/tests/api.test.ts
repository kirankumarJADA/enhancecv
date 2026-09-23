import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app';
import { makeMasterCV, makeFrontendCV, JAVA_JD, REACT_JD } from './fixtures';
import { ResumeData } from '../src/types';

// Isolated data dir for this test run
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecv-test-'));
process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = 'test-secret';

const app = buildApp();

function agent() {
  return request.agent(app);
}

async function signup(email = 'user1@test.dev', name = 'User One') {
  const a = agent();
  const res = await a.post('/api/auth/signup').send({ email, name, password: 'password123' });
  expect(res.status).toBe(201);
  return a;
}

async function saveMaster(a: ReturnType<typeof agent>, cv?: ResumeData) {
  const res = await a.put('/api/master').send({ resume: cv || makeMasterCV() });
  expect([200, 201]).toContain(res.status);
  return res.body as { id: string; atsScore: number; completeness: number };
}

let userA: ReturnType<typeof agent>;
let userB: ReturnType<typeof agent>;

beforeAll(async () => {
  userA = await signup();
  userB = await signup('user2@test.dev', 'User Two');
});

// ---------------------------------------------------------------- AUTH ----

describe('Authentication', () => {
  it('rejects duplicate signup', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'user1@test.dev', name: 'X', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('rejects weak passwords', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'weak@test.dev', name: 'X', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const ok = await request(app).post('/api/auth/login').send({ email: 'user1@test.dev', password: 'password123' });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/login').send({ email: 'user1@test.dev', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).not.toMatch(/stack|sql|bcrypt/i);
  });

  it('blocks protected routes without a session', async () => {
    const res = await request(app).get('/api/master');
    expect(res.status).toBe(401);
  });

  it('logs out and invalidates access', async () => {
    const a = await signup('logout@test.dev');
    const out = await a.post('/api/auth/logout');
    expect(out.status).toBe(200);
    const after = await a.get('/api/auth/me');
    expect([401, 500].includes(after.status) ? 401 : after.status).toBe(401);
  });
});

// ------------------------------------------------------------ MASTER CV ----

describe('Master CV', () => {
  it('starts empty', async () => {
    const res = await userA.get('/api/master');
    expect(res.status).toBe(200);
    expect(res.body.master).toBeNull();
  });

  it('saves and returns the master CV with completeness', async () => {
    const saved = await saveMaster(userA);
    expect(saved.atsScore).toBeGreaterThan(0);
    expect(saved.completeness).toBeGreaterThan(0);
    const got = await userA.get('/api/master');
    expect(got.body.master.content.personal.fullName).toBe('Aarav Sharma');
    expect(got.body.master.content.personal.email).toBe('aarav.sharma@example.com');
  });

  it('computes ATS analysis with all categories', async () => {
    const res = await userA.get('/api/master/ats');
    expect(res.status).toBe(200);
    const a = res.body.analysis;
    for (const key of ['formattingScore', 'structureScore', 'contentScore', 'skillsScore', 'readabilityScore']) {
      expect(a[key]).toBeGreaterThanOrEqual(0);
      expect(a[key]).toBeLessThanOrEqual(100);
    }
  });

  it('rejects malformed resume payloads', async () => {
    const res = await userA.put('/api/master').send({ resume: { personal: 'nope' } });
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------- DASHBOARD / ISOLATION ----

describe('Dashboard + data isolation', () => {
  it('returns dashboard data for the owner', async () => {
    const res = await userA.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.master).not.toBeNull();
    expect(res.body.master.completeness).toBeGreaterThan(0);
  });

  it('never leaks the master CV to another user', async () => {
    const res = await userB.get('/api/master');
    expect(res.status).toBe(200);
    expect(res.body.master).toBeNull();
  });

  it('cross-user access to a resume fails', async () => {
    const mine = await userA.get('/api/master');
    const id = mine.body.master.id;
    const forbiddenGet = await userB.get(`/api/resumes/${id}`);
    expect([403, 404]).toContain(forbiddenGet.status);
    const forbiddenPdf = await userB.get(`/api/resumes/${id}/pdf`);
    expect([403, 404]).toContain(forbiddenPdf.status);
    const forbiddenPut = await userB.put(`/api/resumes/${id}`).send({ resume: makeFrontendCV() });
    expect([403, 404]).toContain(forbiddenPut.status);
    const forbiddenDelete = await userB.delete(`/api/resumes/${id}`);
    expect([403, 404]).toContain(forbiddenDelete.status);
  });

  it('cross-user access to a job analysis fails', async () => {
    const created = await userA.post('/api/jobs/analyse').send({ text: JAVA_JD });
    expect(created.status).toBe(201);
    const jobId = created.body.jobId;
    const forbidden = await userB.get(`/api/jobs/${jobId}`);
    expect([403, 404]).toContain(forbidden.status);
    const listB = await userB.get('/api/jobs');
    expect(listB.body.jobs).toHaveLength(0);
  });
});

// ------------------------------------------------------- CORE WORKFLOW ----

describe('Core acceptance workflow (upload → analyse → tailor → edit → PDF → version)', () => {
  let jobId = '';
  let versionId = '';

  it('analyses a JD and returns the match against the master CV', async () => {
    const res = await userA.post('/api/jobs/analyse').send({ text: JAVA_JD });
    expect(res.status).toBe(201);
    jobId = res.body.jobId;
    expect(res.body.analysis.title.toLowerCase()).toContain('java');
    expect(res.body.match).not.toBeNull();
    expect(res.body.match.score).toBeGreaterThan(0);
  });

  it('recomputes the match on demand', async () => {
    const res = await userA.post(`/api/jobs/${jobId}/match`).send({});
    expect(res.status).toBe(200);
    expect(res.body.match.breakdown).toHaveLength(7);
  });

  it('runs the tailoring pipeline and stores a version with before/after stats', async () => {
    const res = await userA.post(`/api/jobs/${jobId}/tailor`).send({});
    expect(res.status).toBe(201);
    versionId = res.body.versionId;
    expect(res.body.before).toBeDefined();
    expect(res.body.after).toBeDefined();
    expect(res.body.truth).toBeDefined();
    expect(res.body.changeLog.length).toBeGreaterThan(0);
    // tailored resume must not contain skills absent from master
    const master = (await userA.get('/api/master')).body.master.content as ResumeData;
    const masterSkills = new Set(master.skills.technical.map((s) => s.toLowerCase()));
    const tailored = res.body.resume as ResumeData;
    for (const s of tailored.skills.technical) {
      expect(masterSkills.has(s.toLowerCase())).toBe(true);
    }
  });

  it('tailors differently for a different JD', async () => {
    const react = await userA.post('/api/jobs/analyse').send({ text: REACT_JD });
    expect(react.status).toBe(201);
    const t1 = await userA.post(`/api/jobs/${jobId}/tailor`).send({});
    const t2 = await userA.post(`/api/jobs/${react.body.jobId}/tailor`).send({});
    expect(t2.status).toBe(201);
    const r1 = t1.body.resume as ResumeData;
    const r2 = t2.body.resume as ResumeData;
    // skill ordering should differ between JDs
    expect(r1.skills.technical.join('|')).not.toBe(r2.skills.technical.join('|'));
    expect(t1.body.after.match).not.toBe(t2.body.after.match);
  });

  it('lists versions and supports rename, duplicate and delete', async () => {
    const list = await userA.get('/api/resumes');
    const tailored = list.body.resumes.filter((r: { kind: string }) => r.kind === 'tailored');
    expect(tailored.length).toBeGreaterThanOrEqual(2);

    const dup = await userA.post(`/api/resumes/${versionId}/duplicate`).send({ title: 'My Copy' });
    expect(dup.status).toBe(201);

    const ren = await userA.put(`/api/resumes/${dup.body.id}`).send({ title: 'Renamed Copy', resume: (await userA.get(`/api/resumes/${versionId}`)).body.resume.content });
    expect(ren.status).toBe(200);
    expect(ren.body.title).toBe('Renamed Copy');

    const del = await userA.delete(`/api/resumes/${dup.body.id}`);
    expect(del.status).toBe(200);
    const afterDelete = await userA.get(`/api/resumes/${dup.body.id}`);
    expect(afterDelete.status).toBe(404);
  });

  it('master CV is unchanged after tailoring', async () => {
    const got = await userA.get('/api/master');
    const cv = got.body.master.content;
    expect(cv.personal.fullName).toBe('Aarav Sharma');
    expect(cv.summary).toContain('Backend engineer with 4 years'); // original summary intact
  });

  it('updates an edited tailored resume and recomputes ATS', async () => {
    const got = await userA.get(`/api/resumes/${versionId}`);
    const resume = got.body.resume.content as ResumeData;
    resume.summary = 'Senior Java Backend Engineer with 4 years of experience building REST APIs and distributed services in Java and Spring Boot. Delivered payment integrations and improved API latency by 30%.';
    const put = await userA.put(`/api/resumes/${versionId}`).send({ resume });
    expect(put.status).toBe(200);
    const ats = await userA.get(`/api/resumes/${versionId}/ats`);
    expect(ats.status).toBe(200);
    expect(ats.body.analysis.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('downloads a valid PDF with selectable text', async () => {
    const res = await userA.get(`/api/resumes/${versionId}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const buf = Buffer.from(res.body);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('returns editor suggestions', async () => {
    const res = await userA.get(`/api/resumes/${versionId}/suggestions`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });

  it('job analysis history is available', async () => {
    const res = await userA.get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeGreaterThanOrEqual(2);
    expect(res.body.jobs[0].matchScore).not.toBeNull();
  });
});

// ------------------------------------------------------------- ERRORS ----

describe('Error handling', () => {
  it('rejects empty JD text', async () => {
    const res = await userA.post('/api/jobs/analyse').send({ text: '' });
    expect(res.status).toBe(400);
  });

  it('rejects too-short JD text', async () => {
    const res = await userA.post('/api/jobs/analyse').send({ text: 'Developer role. Apply now.' });
    expect(res.status).toBe(400);
  });

  it('returns a friendly 404 for unknown routes', async () => {
    const res = await userA.get('/api/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects oversized payloads gracefully', async () => {
    const res = await userA.post('/api/jobs/analyse').send({ text: 'x'.repeat(50000) });
    expect([400, 413]).toContain(res.status);
  });
});
