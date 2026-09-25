// Career OS expansion tests: interview agent, mock interviews, job discovery,
// URL import (SSRF), LinkedIn import, document import alias, grammar agent,
// translation agent, company research, application workflow + timeline,
// career analytics, health center, custom sections, extension tokens.
// Real PostgreSQL throughout; external providers are mocked via test seams.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app';
import { getDb } from '../src/db/db';
import { makeMasterCV, JAVA_JD } from './fixtures';
import { AiProvider, JsonCompletionRequest, parseStructured, __setAiProviderForTests } from '../src/ai/provider';
import { __setPageFetcherForTests } from '../src/lib/urlFetch';
import { __setJobSourceProviderForTests, type JobSourceProvider, type JobSearchPreferences, type DiscoveredJob } from '../src/lib/jobSource';
import { __setWebSearchProviderForTests, type WebSearchProvider } from '../src/lib/webSearch';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';
process.env.JWT_SECRET = 'test-secret';

let app: Express;

// --------------------------------------------------------- routing mock ----

class CareerMockAi implements AiProvider {
  readonly name = 'mock';
  readonly model = 'mock-1';

  async completeJson<T>(req: JsonCompletionRequest<T>): Promise<T> {
    const u = req.user;
    if (u.includes('interview preparation package')) {
      return parseStructured(
        JSON.stringify({
          questions: [
            {
              category: 'TECHNICAL',
              question: 'How do you design REST APIs in Spring Boot?',
              why_it_may_be_asked: 'Core requirement of the role.',
              evidence_from_cv: 'Master CV lists Spring Boot and REST APIs with 120k daily requests.',
              recommended_answer_structure: 'STAR with the Finlio payments project.',
              sample_truthful_answer: 'At Finlio I developed RESTful services in Java and Spring Boot serving 120k daily requests, using PostgreSQL for persistence.',
            },
            {
              category: 'BEHAVIOURAL',
              question: 'Tell me about improving performance under pressure.',
              why_it_may_be_asked: 'Reliability focus.',
              evidence_from_cv: '30% latency reduction bullet.',
              recommended_answer_structure: 'STAR.',
              sample_truthful_answer: 'I optimised PostgreSQL queries and indexes, reducing average API response time by 30% during a peak-load period.',
            },
            // fabricated sample answer to verify the Truth Guard
            {
              category: 'COMPANY',
              question: 'Why Nomos Bank?',
              why_it_may_be_asked: 'Motivation.',
              evidence_from_cv: '',
              recommended_answer_structure: 'Research-based answer.',
              sample_truthful_answer: 'I spent 12 years leading AWS platform teams at Nomos Bank itself before this.',
            },
            {
              category: 'HR',
              question: 'What are your salary expectations?',
              why_it_may_be_asked: 'Standard screening.',
              evidence_from_cv: 'Not on the CV — answer with market data.',
              recommended_answer_structure: 'Give a researched range.',
              sample_truthful_answer: 'Based on the market for this role, my expectation is in line with the advertised range.',
            },
          ],
          studyPlan: ['Re-read the JD and map each requirement to a CV bullet.', 'Prepare STAR stories from Finlio and Cloudline.'],
        }),
        req.schema,
      );
    }
    if (u.includes('INTERVIEW QUESTION')) {
      return parseStructured(
        JSON.stringify({
          relevance: { level: 'high', explanation: 'Directly addresses the question with concrete experience.' },
          evidenceUsage: 'References Spring Boot and the 120k daily requests figure from the CV.',
          structure: 'Clear STAR shape.',
          clarity: 'Concise.',
          completeness: 'Could name the concrete outcome metric.',
          improvements: ['Name the exact outcome metric.'],
          followUpQuestion: 'How did you validate the 120k figure?',
          overallFeedback: 'Strong answer grounded in real experience.',
        }),
        req.schema,
      );
    }
    if (u.includes('Proofread the resume content')) {
      const actualSummary = u.match(/Summary: (.{0,600})/)?.[1]?.trim() || 'not-found';
      return parseStructured(
        JSON.stringify({
          suggestions: [
            {
              section: 'Summary',
              original: actualSummary,
              updated: actualSummary.replace('. Delivered', ', delivering'),
              reason: 'More concise.',
            },
            {
              section: 'Hallucinated',
              original: 'This sentence does not exist anywhere in the resume at all.',
              updated: 'Architected Kubernetes on AWS across 3 regions.',
              reason: 'FABRICATED — must be rejected (original not found).',
            },
          ],
        }),
        req.schema,
      );
    }
    if (u.includes('Translate this resume')) {
      // Extract the resume JSON block (between its heading and the task text)
      // with a brace-walker — the prompt contains other braces.
      const start = u.indexOf('=== RESUME TO TRANSLATE ===');
      const jsonStart = u.indexOf('{', start);
      let depth = 0;
      let jsonEnd = jsonStart;
      for (let i = jsonStart; i < u.length; i++) {
        if (u[i] === '{') depth++;
        else if (u[i] === '}') {
          depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
      const src = JSON.parse(u.slice(jsonStart, jsonEnd)) as {
        experience?: { itemId: string; bullets?: string[] }[];
        summary?: string;
      };
      const firstExp = src.experience?.[0];
      const bullets = (firstExp?.bullets || []).map((b) => b.replace('30%', '35%').replace('120k', '120k'));
      return parseStructured(
        JSON.stringify({
          summary: 'Backend-Ingenieur mit 4 Jahren Erfahrung im Aufbau von REST APIs und verteilten Diensten mit Java und Spring Boot.',
          experience: [
            {
              itemId: firstExp?.itemId || 'exp_1',
              title: 'Software Engineer',
              bullets,
            },
          ],
          skills: [],
          notes: 'Formal German.',
        }),
        req.schema,
      );
    }
    if (u.includes('SEARCH RESULTS')) {
      return parseStructured(
        JSON.stringify({
          overview: 'Nomos Bank is a digital bank described in the search results.',
          productsServices: ['Digital payments platform'],
          industry: 'Fintech / banking',
          recentInformation: [
            { fact: 'The search results describe Nomos Bank as a digital banking platform.', sourceUrl: 'https://example-press.com/nomos' },
            { fact: 'This fact has no real source.', sourceUrl: 'https://fabricated.example.com/claim' },
          ],
          roleContext: 'The role focuses on payment services in Java and Spring Boot.',
          interviewTopics: ['Payments domain', 'System design'],
          cultureNotes: [],
        }),
        req.schema,
      );
    }
    throw new Error('mock: unrecognised prompt');
  }
}

const stubFetcher = async (url: string) => {
  if (url.includes('login-walled.example.com')) {
    const err = new Error('IMPORT_FAILED');
    throw err;
  }
  const html = `<!doctype html><html><head><title>Senior Java Backend Engineer - ExampleCorp</title>
  <script type="application/ld+json">{"@type":"JobPosting","title":"Senior Java Backend Engineer","hiringOrganization":{"name":"ExampleCorp"},"jobLocation":{"address":{"addressLocality":"Birmingham","addressCountry":"UK"}},"baseSalary":{"value":{"minValue":40000,"maxValue":55000},"currency":"GBP"},"description":"<p>You will design REST APIs and microservices in Java and Spring Boot with PostgreSQL, Docker and Kubernetes in production. 5+ years of backend engineering experience required.</p>"}</script>
  </head><body>Senior Java Backend Engineer job page</body></html>`;
  return { url, body: html, contentType: 'text/html' };
};

const stubJobSource: JobSourceProvider = {
  id: 'stub',
  async search(prefs: JobSearchPreferences, limit: number): Promise<DiscoveredJob[]> {
    void prefs;
    return [
      {
        company: 'Nomos Bank',
        title: 'Senior Java Backend Engineer',
        location: 'Manchester',
        salary: '£60k',
        employment_type: 'full-time',
        remote_type: 'hybrid',
        url: 'https://jobs.example.com/nomos-1',
        source: 'stub',
        posted_at: '2026-09-01',
        description: 'Design REST APIs and microservices in Java and Spring Boot with PostgreSQL, Docker and Kubernetes. 5+ years of backend experience.',
        requirements: 'Java, Spring Boot, PostgreSQL',
        technologies: ['Java', 'Spring Boot', 'PostgreSQL'],
      },
      {
        company: 'PixelWorks',
        title: 'Frontend Engineer (React)',
        location: 'London',
        salary: '£55k',
        employment_type: 'full-time',
        remote_type: 'remote',
        url: 'https://jobs.example.com/pw-1',
        source: 'stub',
        posted_at: '2026-09-02',
        description: 'Build accessible interfaces with React and TypeScript, state management with Redux, tests with Jest.',
        requirements: 'React, TypeScript, Redux',
        technologies: ['React', 'TypeScript'],
      },
    ].slice(0, limit);
  },
};

const stubSearch: WebSearchProvider = {
  id: 'stub',
  async search(query: string, limit: number) {
    void query;
    return [
      { title: 'Nomos Bank press release', url: 'https://example-press.com/nomos', snippet: 'Nomos Bank operates a digital banking platform with over 2 million customers.' },
      { title: 'Nomos Bank product page', url: 'https://example.com/nomos-products', snippet: 'Payments services and accounts.' },
    ].slice(0, limit);
  },
};

let userA: request.Agent;

beforeAll(async () => {
  app = await buildApp();
  await getDb().query(
    'TRUNCATE ai_runs, tailoring_runs, match_analyses, ats_analyses, job_analyses, job_descriptions, resumes, users, usage_records, subscriptions, billing_events, analytics_events, applications, cover_letters, linkedin_generations, email_verification_tokens, password_reset_tokens, error_events, saved_jobs, job_searches, interview_sessions, company_research, extension_tokens, application_events CASCADE',
  );

  userA = request.agent(app);
  await userA.post('/api/auth/signup').send({ email: 'career@test.dev', name: 'Career Tester', password: 'password123' });
  await userA.put('/api/master').send({ resume: makeMasterCV() });

  __setAiProviderForTests(new CareerMockAi());
});

afterAll(() => {
  __setAiProviderForTests(null);
  __setPageFetcherForTests(null);
  __setJobSourceProviderForTests(null);
  __setWebSearchProviderForTests(null);
});

// ------------------------------------------------------ extension tokens ----

describe('Extension tokens (Bearer auth)', () => {
  it('issues, uses, lists and revokes tokens — invalid tokens are rejected', async () => {
    const created = await userA.post('/api/auth/extension-token').send({ name: 'Chrome' });
    expect(created.status).toBe(201);
    const token: string = created.body.token;
    expect(token.startsWith('cvt_')).toBe(true);

    // Bearer access to a protected endpoint works without cookies.
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('career@test.dev');

    const bad = await request(app).get('/api/auth/me').set('Authorization', 'Bearer cvt_invalid');
    expect(bad.status).toBe(401);

    const list = await userA.get('/api/auth/extension-tokens');
    expect(list.body.tokens).toHaveLength(1);

    const revoke = await userA.delete(`/api/auth/extension-tokens/${list.body.tokens[0].id}`);
    expect(revoke.status).toBe(200);
    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });
});

// ------------------------------------------------------------ SSRF / URL ----

describe('Job URL import (SSRF-protected)', () => {
  it('blocks localhost, private ranges, cloud metadata and non-http protocols', async () => {
    for (const url of [
      'http://localhost:4000/api',
      'http://127.0.0.1/x',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.1/x',
      'http://192.168.1.1/x',
      'file:///etc/passwd',
      'ftp://example.com/x',
    ]) {
      const res = await userA.post('/api/jobs/import-url').send({ url });
      expect([400, 422]).toContain(res.status);
      expect(['BLOCKED_URL', 'INVALID_URL']).toContain(res.body.error.code);
    }
  });

  it('imports a job page via JSON-LD extraction and stores transparent fit fields', async () => {
    __setPageFetcherForTests(stubFetcher);
    const res = await userA.post('/api/jobs/import-url').send({ url: 'https://jobs.example.com/nomos-1' });
    expect(res.status).toBe(201);
    expect(res.body.job.title).toContain('Senior Java Backend Engineer');
    expect(res.body.job.company).toBe('ExampleCorp');
    expect(res.body.job.salary).toContain('40000');
    expect(res.body.fit.matchPercentage).toBeGreaterThanOrEqual(0);
    expect(res.body.fit.experienceGaps.length).toBeGreaterThan(0); // Kubernetes not on the CV

    const saved = await userA.get('/api/jobs/saved');
    expect(saved.body.savedJobs.some((j: { title: string }) => j.title.includes('Senior Java'))).toBe(true);
  });
});

// ------------------------------------------------------------ discovery ----

describe('Job discovery', () => {
  it('returns an honest configuration error without a provider', async () => {
    const res = await userA.post('/api/jobs/discover').send({ title: 'Java engineer' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('JOB_SOURCE_NOT_CONFIGURED');
  });

  it('normalises provider jobs, scores fit and persists saved jobs', async () => {
    __setJobSourceProviderForTests(stubJobSource);
    const res = await userA.post('/api/jobs/discover').send({ title: 'engineer', location: 'UK', limit: 5 });
    expect(res.status).toBe(201);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.note).toMatch(/informational/i);

    const java = res.body.results.find((r: { title: string }) => r.title.includes('Java'));
    expect(java.fit.matchedRequirements).toContain('Java');
    const react = res.body.results.find((r: { title: string }) => r.title.includes('React'));
    expect(react.fit.matchedRequirements).not.toContain('Java'); // different job, different fit // different profile fit per job

    const saved = await userA.get('/api/jobs/saved');
    expect(saved.body.savedJobs).toHaveLength(3); // 1 from URL import + 2 from search
  });
});

// ----------------------------------------------------- LinkedIn / resume import ----

describe('LinkedIn profile import (paste → preview → confirm)', () => {
  const PROFILE = `Aarav Sharma
Backend Engineer at Finlio

About
Backend engineer focused on payments.

Experience
Software Engineer at Finlio Technologies
Aug 2022 - Present
- Developed RESTful backend services using Java and Spring Boot serving 120k daily requests.
Junior Developer at Cloudline Systems
Jun 2021 - Jul 2022
- Implemented Kafka-based event streaming.

Education
BSc, University of Leeds 2017 - 2021

Skills
Java, Spring Boot, PostgreSQL, Docker, Kafka

Certifications
Oracle Certified Professional: Java SE 17 - Oracle - 2023`;

  it('parses the pasted profile into a preview without touching the Master CV', async () => {
    const before = await userA.get('/api/master');
    const expCount = before.body.master.content.experience.length;

    const res = await userA.post('/api/import/linkedin').send({ text: PROFILE });
    expect(res.status).toBe(200);
    expect(res.body.preview.name).toContain('Aarav');
    expect(res.body.preview.experience.length).toBeGreaterThanOrEqual(2);
    expect(res.body.preview.skills).toContain('Spring Boot');

    const after = await userA.get('/api/master');
    expect(after.body.master.content.experience.length).toBe(expCount); // unchanged until confirm
  });

  it('applies a confirmed import additively — never overwriting existing facts', async () => {
    const preview = await userA.post('/api/import/linkedin').send({ text: PROFILE });
    const apply = await userA.post('/api/import/linkedin/apply').send({ profile: preview.body.preview });
    expect(apply.status).toBe(200);
    expect(apply.body.merged).toBe(true);

    const master = await userA.get('/api/master');
    const companies = master.body.master.content.experience.map((e: { company: string }) => e.company);
    expect(companies).toContain('Finlio Technologies');
    // The original Finlio role was already there → no duplicate
    const finlioCount = companies.filter((c: string) => c === 'Finlio Technologies').length;
    expect(finlioCount).toBe(1);
    // LinkedIn-only company was added
    expect(companies).toContain('Cloudline Systems');
  });

  it('document import alias extracts sections from a TXT resume', async () => {
    const cvText = Buffer.from(
      'Tom Ellis\ntom@example.com\n\nSUMMARY\nGraduate developer.\n\nEXPERIENCE\nIntern, Acme 06/2025 - 08/2025\n- Built internal tools with Python.\n\nSKILLS\nPython, Git\n',
      'utf8',
    );
    const res = await userA.post('/api/import/resume').attach('file', cvText, 'cv.txt');
    expect(res.status).toBe(200);
    expect(res.body.detected.contact.email).toBe(true);
    expect(res.body.detected.counts.experience).toBeGreaterThanOrEqual(1);
    expect(res.body.detected.counts.skills).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------- interview ----

describe('Interview agent + mock interviews', () => {
  let jobId = '';

  beforeAll(async () => {
    const job = await userA.post('/api/jobs/analyse').send({ text: JAVA_JD });
    jobId = job.body.jobId;
  });

  it('preparation: truth-guarded questions with study plan; fabricated answers rejected', async () => {
    const res = await userA.post('/api/interview/prepare').send({ jobId });
    expect(res.status).toBe(201);
    expect(res.body.questions.length).toBeGreaterThanOrEqual(3);
    const companyQ = res.body.questions.find((q: { category: string }) => q.category === 'COMPANY');
    // The fabricated "12 years leading AWS platform teams at Nomos Bank" must be stripped
    expect(JSON.stringify(res.body.questions)).not.toMatch(/12 years|AWS platform teams/);
    expect(companyQ.sample_truthful_answer).not.toContain('12 years');
    expect(res.body.meta.rejectedClaims).toBeGreaterThanOrEqual(1);
    expect(res.body.studyPlan.length).toBeGreaterThanOrEqual(2);
  });

  it('mock interview: answer → explainable evaluation with deterministic unsupported-claim detection', async () => {
    const start = await userA.post('/api/interview/session').send({ jobId, mode: 'TEXT' });
    expect(start.status).toBe(201);
    expect(start.body.questions.length).toBeGreaterThan(0);
    const q = start.body.questions[0];

    const answer =
      'I designed REST APIs in Spring Boot at Finlio, serving 120k daily requests. I also ran Kubernetes production clusters on AWS with Terraform.';
    const res = await userA.post(`/api/interview/session/${start.body.sessionId}/answer`).send({ questionId: q.id, answer });
    expect(res.status).toBe(200);
    expect(res.body.evaluation.relevance.level).toBe('high');
    // deterministic Truth Guard detects the unsupported claims in the ANSWER
    expect(res.body.evaluation.unsupportedClaims).toContain('Kubernetes');
    expect(res.body.evaluation.unsupportedClaims).toContain('AWS');
    expect(res.body.next).not.toBeNull();
  });

  it('finish produces deterministic aggregate feedback (no invented score)', async () => {
    const start = await userA.post('/api/interview/session').send({ jobId, mode: 'TEXT' });
    const sessionId = start.body.sessionId;
    for (const q of start.body.questions) {
      await userA.post(`/api/interview/session/${sessionId}/answer`).send({
        questionId: q.id,
        answer: 'I built REST APIs with Java and Spring Boot at Finlio and improved PostgreSQL performance by 30%.',
      });
    }
    const finish = await userA.post(`/api/interview/session/${sessionId}/finish`);
    expect(finish.status).toBe(200);
    expect(finish.body.overallFeedback).toMatch(/answered/i);
    expect(finish.body.overallFeedback).not.toMatch(/score: \d+\/100/i);

    const history = await userA.get('/api/interview/history');
    expect(history.body.sessions.length).toBeGreaterThanOrEqual(3);
    const detail = await userA.get(`/api/interview/session/${sessionId}`);
    expect(detail.body.session.status).toBe('COMPLETED');
    expect(detail.body.questions[0].evaluation).toBeDefined();
  });
});

// ------------------------------------------------------- grammar / translate ----

describe('Grammar agent', () => {
  it('validates originals against the resume and rejects fabricated suggestions', async () => {
    const res = await userA.post('/api/ai/grammar').send({});
    expect(res.status).toBe(200);
    // Only the truthful, real-original suggestion survives
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0].current).toContain('Backend engineer with 4 years');
    expect(res.body.meta.rejectedClaims).toBeGreaterThanOrEqual(1);
  });
});

describe('Translation agent', () => {
  it('translates into a new version and restores drifted numbers deterministically', async () => {
    const master = await userA.get('/api/master');
    const masterId = master.body.master.id;

    const res = await userA.post('/api/ai/translate').send({ resumeId: masterId, language: 'German', market: 'Germany' });
    expect(res.status).toBe(201);
    expect(res.body.title).toContain('German');
    // The mock changed 30% -> 35%; the validator must restore the source bullet
    const bullets = res.body.resume.experience.flatMap((e: { bullets: string[] }) => e.bullets).join(' ');
    expect(bullets).toContain('30%');
    expect(bullets).not.toContain('35%');
    expect(res.body.warnings.length).toBeGreaterThanOrEqual(1);
    expect(res.body.warnings.join(' ')).toMatch(/Number mismatch|restored/i);
  });
});

describe('Company research', () => {
  it('is honest without a search provider', async () => {
    const res = await userA.post('/api/ai/company-research').send({ company: 'Nomos Bank' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('RESEARCH_NOT_CONFIGURED');
  });

  it('returns sourced facts with the provider configured; unsourced claims filtered', async () => {
    __setWebSearchProviderForTests(stubSearch);
    const res = await userA.post('/api/ai/company-research').send({ company: 'Nomos Bank' });
    expect(res.status).toBe(201);
    const recent = res.body.research.recentInformation;
    expect(recent.some((r: { sourceUrl: string }) => r.sourceUrl === 'https://example-press.com/nomos')).toBe(true);
    // The fabricated-source fact must have been dropped
    expect(recent.every((r: { sourceUrl: string }) => r.sourceUrl.startsWith('https://example-press.com') || r.sourceUrl.startsWith('https://example.com'))).toBe(true);
  });
});

// ------------------------------------------- smart application workflow ----

describe('Smart application workflow + timeline', () => {
  it('creates an application from a saved job with next steps', async () => {
    const saved = await userA.get('/api/jobs/saved');
    const job = saved.body.savedJobs[0];
    const res = await userA.post('/api/applications/from-job').send({ savedJobId: job.id });
    expect(res.status).toBe(201);
    expect(res.body.application.company).toBeTruthy();
    expect(res.body.nextSteps.some((s: { action: string }) => s.action === 'interview-prep')).toBe(true);
  });

  it('records status changes in the timeline', async () => {
    const list = await userA.get('/api/applications');
    const appId = list.body.applications[0].id;
    await userA.patch(`/api/applications/${appId}`).send({ status: 'SCREENING' });
    await userA.patch(`/api/applications/${appId}`).send({ status: 'INTERVIEW' });
    const events = await userA.get(`/api/applications/${appId}/events`);
    expect(events.status).toBe(200);
    const statuses = events.body.timeline.map((e: { to_status: string }) => e.to_status);
    expect(statuses).toContain('SCREENING');
    expect(statuses).toContain('INTERVIEW');
  });

  it('cross-user protection on from-job and timeline', async () => {
    const b = request.agent(app);
    await b.post('/api/auth/signup').send({ email: 'career2@test.dev', name: 'C2', password: 'password123' });
    const saved = await userA.get('/api/jobs/saved');
    const fromJob = await b.post('/api/applications/from-job').send({ savedJobId: saved.body.savedJobs[0].id });
    expect([403, 404]).toContain(fromJob.status);
  });
});

// --------------------------------------------------- analytics + health ----

describe('Career analytics + health center', () => {
  it('career analytics returns transparent descriptive stats', async () => {
    const res = await userA.get('/api/analytics/career');
    expect(res.status).toBe(200);
    expect(res.body.totalApplications).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.responseRate).toBe('number');
    expect(res.body.note).toMatch(/descriptive/i);
  });

  it('health center returns deterministic component scores', async () => {
    const res = await userA.get('/api/analytics/health');
    expect(res.status).toBe(200);
    expect(res.body.components.map((c: { key: string }) => c.key)).toEqual(
      expect.arrayContaining(['ats', 'completeness', 'contact', 'truth', 'quality']),
    );
    for (const c of res.body.components) {
      expect(c.engine).toBe('deterministic');
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });
});

// --------------------------------------------------------- custom sections ----

describe('Rich section system (custom sections)', () => {
  it('adds a custom section, renders it in ATS, and keeps the PDF ATS-safe', async () => {
    const master = await userA.get('/api/master');
    const resume = master.body.master.content;
    resume.customSections = [{ id: 'custom_publications', title: 'Publications', bullets: ['Co-authored "Event Streaming Patterns" (2024).'] }];
    resume.sectionOrder = [...resume.sectionOrder, 'custom_publications'];

    const saved = await userA.put('/api/master').send({ resume });
    expect(saved.status).toBe(200);

    const ats = await userA.get('/api/master/ats');
    expect(ats.status).toBe(200); // must not crash on unknown section ids

    const pdf = await userA.get(`/api/resumes/${saved.body.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe('%PDF');

    const check = await userA.get('/api/master');
    expect(check.body.master.content.customSections[0].title).toBe('Publications');
  });

  it('sanitises malformed custom sections and unknown section-order ids', async () => {
    const master = await userA.get('/api/master');
    const resume = master.body.master.content;
    resume.customSections = [{ id: 'bogus', title: 'OK', bullets: ['fine'] }];
    resume.sectionOrder = [...resume.sectionOrder, 'made_up_section'];
    const saved = await userA.put('/api/master').send({ resume });
    expect(saved.status).toBe(200);
    const check = await userA.get('/api/master');
    expect(check.body.master.content.customSections[0].id.startsWith('custom_')).toBe(true);
    expect(check.body.master.content.sectionOrder).not.toContain('made_up_section');
  });
});
