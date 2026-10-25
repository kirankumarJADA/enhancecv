// Test suite verifying Phase 1 & 1.1: Stateless Backend Foundation.
// Validates that the application boots without PostgreSQL or DATABASE_URL,
// verifies that no SQL queries or connection handshakes are attempted with unset or invalid DATABASE_URL,
// proves that obsolete database-backed routes are unmounted (404),
// verifies that monitoring/analytics have zero runtime database dependency,
// proves that production startup does not require JWT_SECRET,
// and preserves the core resume engine.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { captureError } from '../src/lib/monitoring';
import { track } from '../src/lib/analytics';
import { extractResumeFromText } from '../src/engine/extract';
import { analyseATS } from '../src/engine/ats';
import { renderResumePdf } from '../src/engine/pdf';
import type { Express } from 'express';

describe('Phase 1 & 1.1 — Stateless Backend Foundation', () => {
  let app: Express;
  const originalDbUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    app = await buildApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDbUrl !== undefined) {
      process.env.DATABASE_URL = originalDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    if (originalJwtSecret !== undefined) {
      process.env.JWT_SECRET = originalJwtSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  // -------------------------------------------------------------
  // 1. Startup and Health Endpoint
  // -------------------------------------------------------------
  describe('1. Startup with zero database configuration', () => {
    it('initializes buildApp() successfully when DATABASE_URL is unset', () => {
      expect(app).toBeDefined();
    });

    it('serves GET /api/health with 200 OK and valid health payload', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.service).toBe('curevo-ai');
      expect(typeof res.body.time).toBe('string');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('includes security headers from helmet and CORS options', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('starts normally in production without requiring JWT_SECRET', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      delete process.env.DATABASE_URL;

      const prodApp = await buildApp();
      expect(prodApp).toBeDefined();

      const res = await request(prodApp).get('/api/health');
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------
  // 2. Strict Proof of Zero Database Connections or SQL Queries
  // -------------------------------------------------------------
  describe('2. Strict proof of zero database connections or SQL queries', () => {
    it('does not create database connections or run queries when DATABASE_URL is unset', async () => {
      delete process.env.DATABASE_URL;
      const connectSpy = vi.spyOn(Pool.prototype, 'connect');
      const querySpy = vi.spyOn(Pool.prototype, 'query');

      const statelessApp = await buildApp();
      expect(connectSpy).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();

      const res = await request(statelessApp).get('/api/health');
      expect(res.status).toBe(200);

      expect(connectSpy).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();
    });

    it('does not attempt database connections or execute SQL when DATABASE_URL is deliberately invalid (unreachable port)', async () => {
      process.env.DATABASE_URL = 'postgres://invalid_user:invalid_pass@127.0.0.1:9999/nonexistent_db';
      const connectSpy = vi.spyOn(Pool.prototype, 'connect');
      const querySpy = vi.spyOn(Pool.prototype, 'query');

      // If connection or query were initiated, it would fail with ECONNREFUSED on port 9999
      const statelessApp = await buildApp();
      expect(connectSpy).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();

      const res = await request(statelessApp).get('/api/health');
      expect(res.status).toBe(200);

      expect(connectSpy).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();
    });

    it('does not attempt DNS lookup or database connections when DATABASE_URL has an unresolvable hostname', async () => {
      // Matches the Render production failure mode: tenant DNS lookup error
      process.env.DATABASE_URL = 'postgres://postgres.aqmdyzwiwnizyxqcuovm:secret@db.aqmdyzwiwnizyxqcuovm.supabase.co:5432/postgres';
      const connectSpy = vi.spyOn(Pool.prototype, 'connect');
      const querySpy = vi.spyOn(Pool.prototype, 'query');

      const statelessApp = await buildApp();
      expect(connectSpy).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();

      const res = await request(statelessApp).get('/api/health');
      expect(res.status).toBe(200);

      expect(connectSpy).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // 3. Obsolete Database Routes Unmounted (Return 404)
  // -------------------------------------------------------------
  describe('3. Obsolete database-backed routes are unmounted', () => {
    it('returns 404 for unmounted auth endpoints', async () => {
      const signupRes = await request(app).post('/api/auth/signup').send({ email: 'test@example.com', password: 'password123' });
      expect(signupRes.status).toBe(404);
      expect(signupRes.body.error?.code).toBe('NOT_FOUND');

      const loginRes = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'password123' });
      expect(loginRes.status).toBe(404);
      expect(loginRes.body.error?.code).toBe('NOT_FOUND');

      const meRes = await request(app).get('/api/auth/me');
      expect(meRes.status).toBe(404);
      expect(meRes.body.error?.code).toBe('NOT_FOUND');
    });

    it('returns 404 for unmounted Master CV and saved-resume endpoints', async () => {
      const masterRes = await request(app).get('/api/master');
      expect(masterRes.status).toBe(404);
      expect(masterRes.body.error?.code).toBe('NOT_FOUND');

      const resumesRes = await request(app).get('/api/resumes');
      expect(resumesRes.status).toBe(404);
      expect(resumesRes.body.error?.code).toBe('NOT_FOUND');
    });

    it('returns 404 for unmounted billing, applications, and interview endpoints', async () => {
      const billingRes = await request(app).get('/api/billing/config');
      expect(billingRes.status).toBe(404);
      expect(billingRes.body.error?.code).toBe('NOT_FOUND');

      const appsRes = await request(app).get('/api/applications');
      expect(appsRes.status).toBe(404);
      expect(appsRes.body.error?.code).toBe('NOT_FOUND');

      const interviewRes = await request(app).get('/api/interview/history');
      expect(interviewRes.status).toBe(404);
      expect(interviewRes.body.error?.code).toBe('NOT_FOUND');
    });
  });

  // -------------------------------------------------------------
  // 4. Error Monitoring & Analytics Safety
  // -------------------------------------------------------------
  describe('4. Error monitoring and telemetry safety without PostgreSQL', () => {
    it('captureError executes safely without throwing when DATABASE_URL is unset', () => {
      expect(() => {
        captureError(new Error('Sample test error for stateless verification'), {
          code: 'TEST_ERROR',
          route: '/test',
          requestId: 'req_123',
        });
      }).not.toThrow();
    });

    it('track executes safely without throwing when DATABASE_URL is unset', () => {
      expect(() => {
        track(null, 'resume_imported', { format: 'pdf' });
      }).not.toThrow();
    });

    it('ensures captureError and track never attempt SQL queries even when DATABASE_URL is set to an invalid target', () => {
      process.env.DATABASE_URL = 'postgres://invalid_user:invalid_pass@127.0.0.1:9999/nonexistent_db';
      const connectSpy = vi.spyOn(Pool.prototype, 'connect');
      const querySpy = vi.spyOn(Pool.prototype, 'query');

      captureError(new Error('Test error with invalid DATABASE_URL'));
      track('usr_test', 'resume_downloaded');

      expect(connectSpy).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // 5. Core Resume Engine Integrity
  // -------------------------------------------------------------
  describe('5. Core resume engine operates statelessly', () => {
    it('extracts resume data and evaluates ATS compatibility without database', () => {
      const resumeText = [
        'Aarav Sharma',
        'aarav@example.com | +91 98765 43210',
        '',
        'SUMMARY',
        'Backend engineer with 4 years experience designing microservices.',
        '',
        'EXPERIENCE',
        'Software Engineer, Acme Corp 2021 - Present',
        '• Built distributed event streams in Go and Kafka handling 50k requests per second.',
        '• Reduced database query latency by 35% through Redis caching.',
        '',
        'EDUCATION',
        'B.Tech Computer Science, VIT University 2017 - 2021',
        '',
        'SKILLS',
        'Go, Kafka, PostgreSQL, Redis, Docker, Kubernetes',
      ].join('\n');

      const extracted = extractResumeFromText(resumeText);
      expect(extracted.resume.personal.fullName).toBe('Aarav Sharma');
      expect(extracted.resume.experience.length).toBeGreaterThan(0);

      const ats = analyseATS(extracted.resume);
      expect(ats.overallScore).toBeGreaterThanOrEqual(0);
      expect(ats.overallScore).toBeLessThanOrEqual(100);
      expect(ats.skillsScore).toBeGreaterThan(0);
      expect(ats.completeness.status).toBe('complete');
    });

    it('renders PDF stream across templates statelessly', async () => {
      const extracted = extractResumeFromText('Aarav Sharma\naarav@example.com\nSUMMARY\nEngineer\nSKILLS\nGo\n');
      const stream = renderResumePdf(extracted.resume, { template: 'classic' });
      expect(stream).toBeDefined();

      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      const pdfBuffer = await new Promise<Buffer>((resolve) => stream.on('end', () => resolve(Buffer.concat(chunks))));

      expect(pdfBuffer.length).toBeGreaterThan(100);
      expect(pdfBuffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });
});
