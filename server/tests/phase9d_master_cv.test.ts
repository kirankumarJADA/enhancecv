// Curevo AI — Phase 9D Integration & Verification Test Suite
//
// Tests persistent Master CV storage, optimistic concurrency (revision control),
// immutable version snapshots, version restoration, tailored resume isolation,
// PDF generation, cross-tenant RLS enforcement, and draft import.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { getDb, withUserContext, asQueryable, withTransaction } from '../src/db/db';
import { runPendingMigrations } from '../src/db/migrations';
import { MasterCvRepository } from '../src/db/masterCvRepository';
import { __resetRateLimitsForTests } from '../src/middleware/rateLimit';
import type { ResumeData } from '../src/types';
import type { Express } from 'express';

const SAMPLE_RESUME: ResumeData = {
  personal: {
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '+44 7700 900077',
    location: 'London, UK',
    linkedin: 'linkedin.com/in/janedoe',
    github: 'github.com/janedoe',
    portfolio: 'https://janedoe.dev',
    headline: 'Senior Full Stack Engineer',
    otherLinks: [],
  },
  summary: 'Senior software engineer with 8+ years building resilient distributed systems and modern web applications with TypeScript and PostgreSQL.',
  experience: [
    {
      id: 'exp_1',
      company: 'TechCorp UK',
      title: 'Senior Engineer',
      location: 'London, UK',
      startDate: '2021-01',
      endDate: 'Present',
      current: true,
      bullets: [
        'Architected high-throughput microservices processing 12M events daily with 99.99% uptime.',
        'Mentored 6 junior engineers and improved code review throughput by 35%.',
      ],
      dateDisplay: '2021 – Present',
    },
  ],
  projects: [
    {
      id: 'prj_1',
      name: 'Cloud Scale App',
      link: 'https://github.com/janedoe/cloud-scale',
      description: 'Distributed caching system in Node.js and Redis',
      bullets: ['Scaled from 1k to 100k requests/sec.'],
      tech: ['TypeScript', 'Redis', 'PostgreSQL'],
    },
  ],
  education: [
    {
      id: 'edu_1',
      institution: 'University of Edinburgh',
      degree: 'BSc Computer Science',
      field: 'Computer Science',
      startDate: '2014',
      endDate: '2018',
      grade: 'First Class Honours',
      dateDisplay: '2014 – 2018',
    },
  ],
  skills: {
    technical: ['TypeScript', 'Node.js', 'PostgreSQL', 'React', 'Docker', 'AWS'],
    soft: ['Team Leadership', 'Mentorship', 'Agile Methodologies'],
  },
  certifications: [
    {
      id: 'cert_1',
      name: 'AWS Certified Solutions Architect',
      issuer: 'Amazon Web Services',
      year: '2023',
    },
  ],
  languages: [
    {
      id: 'lang_1',
      name: 'English',
      proficiency: 'Native',
    },
  ],
  achievements: ['Won company-wide hackathon 2024'],
  customSections: [],
  sectionOrder: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'languages', 'achievements'],
  hiddenSections: [],
};

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';

describe('Phase 9D — Master CV, Cloud Autosave & Resume Version History', () => {
  let app: Express;

  beforeAll(async () => {
    delete process.env.NODE_ENV;
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_characters_long_curevo';

    const db = getDb();
    // Run all pending migrations including 004
    await runPendingMigrations(db);

    // Grant app role permissions if dedicated role exists
    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curevo_app_role') THEN
          GRANT USAGE ON SCHEMA public TO curevo_app_role;
          GRANT ALL ON ALL TABLES IN SCHEMA public TO curevo_app_role;
        END IF;
      END $$;
    `);

    app = await buildApp();
  });

  beforeEach(() => {
    __resetRateLimitsForTests();
  });

  // Helper to register a unique user and get session cookie + CSRF header
  async function createAuthenticatedUser(prefix: string) {
    const email = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}@test.dev`;
    const password = 'Password123!Secure';

    // 1. Get CSRF token
    const csrfRes = await request(app).get('/api/auth/csrf');
    const csrfRaw = csrfRes.headers['set-cookie'] as unknown;
    const csrfList = Array.isArray(csrfRaw) ? (csrfRaw as string[]) : csrfRaw ? [String(csrfRaw)] : [];
    const csrfItem = csrfList.find((c) => c.startsWith('ecv_csrf='));
    const initialCsrfCookie = csrfItem ? csrfItem.split(';')[0] : '';
    const initialCsrfToken = csrfRes.body.csrfToken || initialCsrfCookie.replace('ecv_csrf=', '');

    // 2. Sign up
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .set('Cookie', initialCsrfCookie)
      .set('X-CSRF-Token', initialCsrfToken)
      .send({ email, password, name: `${prefix} User` });

    expect(signupRes.status).toBe(201);
    const signupRaw = signupRes.headers['set-cookie'] as unknown;
    const signupList = Array.isArray(signupRaw) ? (signupRaw as string[]) : signupRaw ? [String(signupRaw)] : [];
    const sessionItem = signupList.find((c) => c.startsWith('ecv_session='));
    const sessionCookie = sessionItem ? sessionItem.split(';')[0] : '';

    const newCsrfItem = signupList.find((c) => c.startsWith('ecv_csrf='));
    const csrfCookie = newCsrfItem ? newCsrfItem.split(';')[0] : initialCsrfCookie;
    const activeCsrfToken = csrfCookie.replace('ecv_csrf=', '');

    const cookies = [sessionCookie, csrfCookie].filter(Boolean).join('; ');

    return {
      userId: signupRes.body.user.id,
      email,
      cookies,
      csrfToken: activeCsrfToken,
    };
  }

  // --------------------------------------------------------------------------
  // 1. Database Schema & Migration 004 Verification
  // --------------------------------------------------------------------------
  describe('1. Database Schema & Migration 004 Verification', () => {
    it('applies migration 004 and records it in schema_migrations', async () => {
      const db = getDb();
      const res = await db.query(
        "SELECT id, name FROM schema_migrations WHERE id = '004_master_cv_and_resume_versions'"
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].id).toBe('004_master_cv_and_resume_versions');
    });

    it('enforces FORCE ROW LEVEL SECURITY on master_cvs, master_cv_versions, and tailored_resume_versions', async () => {
      const db = getDb();
      const res = await db.query(`
        SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relname IN ('master_cvs', 'master_cv_versions', 'tailored_resume_versions')
      `);
      expect(res.rows.length).toBe(3);
      for (const row of res.rows) {
        expect(row.relrowsecurity).toBe(true);
        expect(row.relforcerowsecurity).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Master CV CRUD & Optimistic Concurrency Control
  // --------------------------------------------------------------------------
  describe('2. Master CV CRUD & Optimistic Concurrency Control', () => {
    it('returns master: null when no Master CV exists yet', async () => {
      const user = await createAuthenticatedUser('mcv_new');

      const res = await request(app)
        .get('/api/master')
        .set('Cookie', user.cookies);

      expect(res.status).toBe(200);
      expect(res.body.master).toBeNull();
    });

    it('creates Master CV with revision 1 and initial immutable version snapshot v1', async () => {
      const user = await createAuthenticatedUser('mcv_create');

      const putRes = await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({
          resume: SAMPLE_RESUME,
          title: 'My Master CV',
          targetRole: 'Senior Full Stack Engineer',
        });

      expect(putRes.status).toBe(201);
      expect(putRes.body.revision).toBe(1);
      expect(putRes.body.atsScore).toBeGreaterThan(0);
      expect(putRes.body.completeness).toBeGreaterThan(50);
      expect(putRes.body.version).toBeDefined();
      expect(putRes.body.version.versionNumber).toBe(1);

      // Verify GET returns the saved Master CV
      const getRes = await request(app)
        .get('/api/master')
        .set('Cookie', user.cookies);

      expect(getRes.status).toBe(200);
      expect(getRes.body.master).not.toBeNull();
      expect(getRes.body.master.title).toBe('My Master CV');
      expect(getRes.body.master.revision).toBe(1);
      expect(getRes.body.master.content.personal.fullName).toBe('Jane Doe');
    });

    it('updates Master CV with matching expectedRevision and increments revision', async () => {
      const user = await createAuthenticatedUser('mcv_update');

      // Create initial (rev 1)
      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: SAMPLE_RESUME });

      const updatedResume = {
        ...SAMPLE_RESUME,
        personal: { ...SAMPLE_RESUME.personal, headline: 'Lead Staff Engineer' },
      };

      // Update with expectedRevision = 1
      const updateRes = await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({
          resume: updatedResume,
          expectedRevision: 1,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.revision).toBe(2);

      // Check GET reflects rev 2
      const getRes = await request(app)
        .get('/api/master')
        .set('Cookie', user.cookies);

      expect(getRes.body.master.revision).toBe(2);
      expect(getRes.body.master.content.personal.headline).toBe('Lead Staff Engineer');
    });

    it('rejects stale update with HTTP 409 REVISION_CONFLICT when revision does not match', async () => {
      const user = await createAuthenticatedUser('mcv_conflict');

      // Create (rev 1)
      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: SAMPLE_RESUME });

      // Simulate Device 1 updating to rev 2
      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: SAMPLE_RESUME, expectedRevision: 1 });

      // Device 2 attempts update still thinking revision is 1
      const conflictRes = await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({
          resume: { ...SAMPLE_RESUME, summary: 'Stale device update' },
          expectedRevision: 1, // Stale! Current is 2
        });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error?.code).toBe('REVISION_CONFLICT');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Immutable Version Snapshots & Restoration
  // --------------------------------------------------------------------------
  describe('3. Immutable Version Snapshots & Restoration', () => {
    it('creates named snapshots and lists them in descending order', async () => {
      const user = await createAuthenticatedUser('mcv_snapshots');

      // Create initial CV (creates v1)
      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: SAMPLE_RESUME, versionLabel: 'Initial Draft' });

      // Create named snapshot v2
      const snapRes = await request(app)
        .post('/api/master/versions')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ label: 'Promotion 2026 Snapshot' });

      expect(snapRes.status).toBe(201);
      expect(snapRes.body.version.versionNumber).toBe(2);
      expect(snapRes.body.version.versionLabel).toBe('Promotion 2026 Snapshot');

      // List versions
      const listRes = await request(app)
        .get('/api/master/versions')
        .set('Cookie', user.cookies);

      expect(listRes.status).toBe(200);
      expect(listRes.body.versions.length).toBe(2);
      expect(listRes.body.versions[0].versionNumber).toBe(2);
      expect(listRes.body.versions[1].versionNumber).toBe(1);
    });

    it('restores historical snapshot as a new revision without destroying past snapshots', async () => {
      const user = await createAuthenticatedUser('mcv_restore');

      // 1. Version 1: Original name "Jane Doe"
      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: SAMPLE_RESUME, versionLabel: 'Original Jane Doe' });

      const list1 = await request(app).get('/api/master/versions').set('Cookie', user.cookies);
      const v1Id = list1.body.versions[0].id;

      // 2. Version 2: Modified name "Jane Smith"
      const modifiedResume = {
        ...SAMPLE_RESUME,
        personal: { ...SAMPLE_RESUME.personal, fullName: 'Jane Smith' },
      };
      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: modifiedResume, createSnapshot: true, versionLabel: 'Changed to Jane Smith' });

      // Verify current Master CV is Jane Smith (rev 2)
      const currentRes = await request(app).get('/api/master').set('Cookie', user.cookies);
      expect(currentRes.body.master.content.personal.fullName).toBe('Jane Smith');
      expect(currentRes.body.master.revision).toBe(2);

      // 3. Restore Version 1
      const restoreRes = await request(app)
        .post(`/api/master/versions/${v1Id}/restore`)
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({});

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.master.content.personal.fullName).toBe('Jane Doe');
      expect(restoreRes.body.master.revision).toBe(3); // New revision!
      expect(restoreRes.body.version.source).toBe('restore');

      // 4. Invariant: History is preserved (now 3 snapshots exist)
      const listAfter = await request(app).get('/api/master/versions').set('Cookie', user.cookies);
      expect(listAfter.body.versions.length).toBe(3);
      expect(listAfter.body.versions[0].versionNumber).toBe(3);
      expect(listAfter.body.versions[1].versionNumber).toBe(2);
      expect(listAfter.body.versions[2].versionNumber).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Central Invariant — AI Tailoring Separation
  // --------------------------------------------------------------------------
  describe('4. Central Invariant — AI Tailoring Separation', () => {
    it('saves tailored resume independently and GUARANTEES Master CV is not mutated', async () => {
      const user = await createAuthenticatedUser('tailor_sep');

      // 1. Establish Master CV
      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: SAMPLE_RESUME });

      const masterBefore = (await request(app).get('/api/master').set('Cookie', user.cookies)).body.master;

      // 2. Create AI-Tailored Output
      const tailoredResumeContent: ResumeData = {
        ...SAMPLE_RESUME,
        summary: 'Tailored summary strictly customized for Staff Cloud Architect role at FinTech Corp.',
        experience: [
          {
            ...SAMPLE_RESUME.experience[0],
            bullets: [
              'Targeted achievement: Cloud infrastructure scalability for financial services.',
            ],
          },
        ],
      };

      const saveTailoredRes = await request(app)
        .post('/api/resumes/tailored')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({
          title: 'FinTech Staff Architect',
          targetRole: 'Staff Cloud Architect',
          targetCompany: 'FinTech Corp',
          jobDescription: 'Seeking expert in cloud distributed systems...',
          resume: tailoredResumeContent,
          atsScore: 92,
          truthGuardResult: { passedAll: true, checks: [] },
        });

      expect(saveTailoredRes.status).toBe(201);
      expect(saveTailoredRes.body.ok).toBe(true);
      const tailoredId = saveTailoredRes.body.resume.id;

      // 3. Verify Master CV was NOT altered (Invariant Proof)
      const masterAfter = (await request(app).get('/api/master').set('Cookie', user.cookies)).body.master;
      expect(masterAfter.revision).toBe(masterBefore.revision);
      expect(masterAfter.updatedAt).toBe(masterBefore.updatedAt);
      expect(masterAfter.content.summary).toBe(SAMPLE_RESUME.summary);
      expect(masterAfter.content.experience[0].bullets[0]).toBe(SAMPLE_RESUME.experience[0].bullets[0]);

      // 4. Verify tailored resume can be retrieved independently
      const getTailoredRes = await request(app)
        .get(`/api/resumes/tailored/${tailoredId}`)
        .set('Cookie', user.cookies);

      expect(getTailoredRes.status).toBe(200);
      expect(getTailoredRes.body.resume.title).toBe('FinTech Staff Architect');
      expect(getTailoredRes.body.resume.resumeContent.summary).toContain('FinTech Corp');

      // 5. Verify /api/resumes lists both Master CV and tailored version
      const allResumesRes = await request(app)
        .get('/api/resumes')
        .set('Cookie', user.cookies);

      expect(allResumesRes.status).toBe(200);
      const masterItem = allResumesRes.body.resumes.find((r: any) => r.kind === 'master');
      const tailoredItem = allResumesRes.body.resumes.find((r: any) => r.kind === 'tailored');
      expect(masterItem).toBeDefined();
      expect(tailoredItem).toBeDefined();
      expect(tailoredItem.title).toBe('FinTech Staff Architect');
    });

    it('deletes tailored resume without affecting Master CV', async () => {
      const user = await createAuthenticatedUser('tailor_del');

      // Create Master CV
      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: SAMPLE_RESUME });

      // Create tailored resume
      const saveRes = await request(app)
        .post('/api/resumes/tailored')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({
          title: 'To Be Deleted',
          resume: SAMPLE_RESUME,
        });

      const tailoredId = saveRes.body.resume.id;

      // Delete tailored resume
      const delRes = await request(app)
        .delete(`/api/resumes/tailored/${tailoredId}`)
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken);

      expect(delRes.status).toBe(200);

      // Verify tailored resume is gone
      const getRes = await request(app)
        .get(`/api/resumes/tailored/${tailoredId}`)
        .set('Cookie', user.cookies);
      expect(getRes.status).toBe(404);

      // Verify Master CV is still intact
      const masterRes = await request(app)
        .get('/api/master')
        .set('Cookie', user.cookies);
      expect(masterRes.status).toBe(200);
      expect(masterRes.body.master).not.toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 5. PDF Generation for Master CV & Tailored Resumes
  // --------------------------------------------------------------------------
  describe('5. PDF Generation for Master CV & Tailored Resumes', () => {
    it('downloads Master CV PDF stream via GET /api/resumes/master/pdf', async () => {
      const user = await createAuthenticatedUser('pdf_master');

      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: SAMPLE_RESUME });

      const pdfRes = await request(app)
        .get('/api/resumes/master/pdf')
        .set('Cookie', user.cookies);

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toBe('application/pdf');
      expect(pdfRes.body.slice(0, 4).toString()).toBe('%PDF');
    });

    it('downloads tailored resume PDF stream via GET /api/resumes/tailored/:id/pdf', async () => {
      const user = await createAuthenticatedUser('pdf_tailored');

      const tailoredRes = await request(app)
        .post('/api/resumes/tailored')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({
          title: 'PDF Export Version',
          resume: SAMPLE_RESUME,
        });

      const tailoredId = tailoredRes.body.resume.id;

      const pdfRes = await request(app)
        .get(`/api/resumes/tailored/${tailoredId}/pdf`)
        .set('Cookie', user.cookies);

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toBe('application/pdf');
      expect(pdfRes.body.slice(0, 4).toString()).toBe('%PDF');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Cross-User Tenant Isolation & RLS Enforcement
  // --------------------------------------------------------------------------
  describe('6. Cross-User Tenant Isolation & RLS Enforcement', () => {
    it('prevents User B from accessing or mutating User A Master CV and tailored resumes', async () => {
      const userA = await createAuthenticatedUser('tenant_a');
      const userB = await createAuthenticatedUser('tenant_b');

      // User A creates Master CV and tailored resume
      await request(app)
        .put('/api/master')
        .set('Cookie', userA.cookies)
        .set('X-CSRF-Token', userA.csrfToken)
        .send({ resume: SAMPLE_RESUME });

      const saveTailoredA = await request(app)
        .post('/api/resumes/tailored')
        .set('Cookie', userA.cookies)
        .set('X-CSRF-Token', userA.csrfToken)
        .send({ title: 'Secret Project of User A', resume: SAMPLE_RESUME });

      const tailoredAId = saveTailoredA.body.resume.id;

      // User B cannot access User A tailored resume
      const getResB = await request(app)
        .get(`/api/resumes/tailored/${tailoredAId}`)
        .set('Cookie', userB.cookies);
      expect(getResB.status).toBe(404);

      // User B cannot delete User A tailored resume
      const delResB = await request(app)
        .delete(`/api/resumes/tailored/${tailoredAId}`)
        .set('Cookie', userB.cookies)
        .set('X-CSRF-Token', userB.csrfToken);
      expect(delResB.status).toBe(404);

      // User B GET /api/master returns null (not User A's Master CV)
      const masterResB = await request(app)
        .get('/api/master')
        .set('Cookie', userB.cookies);
      expect(masterResB.status).toBe(200);
      expect(masterResB.body.master).toBeNull();
    });

    it('enforces PostgreSQL RLS under dedicated application role (NOSUPERUSER NOBYPASSRLS)', async () => {
      const userA = await createAuthenticatedUser('rls_iso_a');
      const userB = await createAuthenticatedUser('rls_iso_b');

      // Create Master CV for User A
      await request(app)
        .put('/api/master')
        .set('Cookie', userA.cookies)
        .set('X-CSRF-Token', userA.csrfToken)
        .send({ resume: SAMPLE_RESUME });

      // Run query under curevo_app_role with User B's identity context
      const db = getDb();
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE curevo_app_role');
        await client.query("SELECT set_config('app.current_user_id', $1, true)", [userB.userId]);

        // Attempt to select from master_cvs where user_id = userA.userId
        const selectRes = await client.query('SELECT * FROM master_cvs WHERE user_id = $1', [userA.userId]);
        expect(selectRes.rows.length).toBe(0);

        // Attempt to update User A's master CV
        const updateRes = await client.query(
          "UPDATE master_cvs SET title = 'Hacked' WHERE user_id = $1",
          [userA.userId]
        );
        expect(updateRes.rowCount).toBe(0);

        // Attempt to select User A's version snapshots
        const versionsRes = await client.query('SELECT * FROM master_cv_versions WHERE user_id = $1', [userA.userId]);
        expect(versionsRes.rows.length).toBe(0);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });

  // --------------------------------------------------------------------------
  // 7. Anonymous Draft Import
  // --------------------------------------------------------------------------
  describe('7. Anonymous Draft Import', () => {
    it('prompts overwrite when Master CV already exists unless overwrite: true', async () => {
      const user = await createAuthenticatedUser('draft_import');

      // Create existing Master CV
      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: SAMPLE_RESUME });

      const newDraft = {
        resume: {
          ...SAMPLE_RESUME,
          personal: { ...SAMPLE_RESUME.personal, fullName: 'Imported Candidate' },
        },
      };

      // Import without overwrite: true
      const rejectRes = await request(app)
        .post('/api/master/import-draft')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ draft: newDraft, overwrite: false });

      expect(rejectRes.status).toBe(409);
      expect(rejectRes.body.error?.code).toBe('MASTER_CV_EXISTS');

      // Import with overwrite: true
      const acceptRes = await request(app)
        .post('/api/master/import-draft')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ draft: newDraft, overwrite: true });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.ok).toBe(true);

      // Verify updated Master CV
      const getRes = await request(app).get('/api/master').set('Cookie', user.cookies);
      expect(getRes.body.master.content.personal.fullName).toBe('Imported Candidate');
    });
  });

  // --------------------------------------------------------------------------
  // 8. Delete Master CV
  // --------------------------------------------------------------------------
  describe('8. Delete Master CV', () => {
    it('deletes Master CV and cascades to version history', async () => {
      const user = await createAuthenticatedUser('mcv_delete');

      // Create Master CV
      await request(app)
        .put('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken)
        .send({ resume: SAMPLE_RESUME });

      // Delete Master CV
      const delRes = await request(app)
        .delete('/api/master')
        .set('Cookie', user.cookies)
        .set('X-CSRF-Token', user.csrfToken);

      expect(delRes.status).toBe(200);
      expect(delRes.body.ok).toBe(true);

      // Verify GET returns null
      const getRes = await request(app).get('/api/master').set('Cookie', user.cookies);
      expect(getRes.body.master).toBeNull();

      // Verify version history is empty
      const versionsRes = await request(app).get('/api/master/versions').set('Cookie', user.cookies);
      expect(versionsRes.body.versions.length).toBe(0);
    });
  });
});
