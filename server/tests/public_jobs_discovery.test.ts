import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { __setJobSourceProviderForTests } from '../src/lib/jobSource';
import type { Express } from 'express';

describe('Curevo AI — Phase 9E Public Job Discovery API', () => {
  let app: Express;
  const originalJobsUrl = process.env.JOBS_API_URL;

  beforeEach(async () => {
    delete process.env.JOBS_API_URL;
    __setJobSourceProviderForTests(null);
    app = await buildApp();
  });

  afterEach(() => {
    if (originalJobsUrl !== undefined) {
      process.env.JOBS_API_URL = originalJobsUrl;
    } else {
      delete process.env.JOBS_API_URL;
    }
    __setJobSourceProviderForTests(null);
  });

  describe('GET /api/public/jobs/status', () => {
    it('returns curated-presets status when no external jobs API is configured', async () => {
      const res = await request(app).get('/api/public/jobs/status');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.configured).toBe(false);
      expect(res.body.isConfigured).toBe(false);
      expect(res.body.provider).toBe('curated-presets');
      expect(res.body.message).toContain('curated benchmark roles');
    });

    it('reports live-api when JOBS_API_URL environment variable is present', async () => {
      process.env.JOBS_API_URL = 'https://api.example.com/v1/jobs';
      __setJobSourceProviderForTests(null);
      const appWithEnv = await buildApp();
      const res = await request(appWithEnv).get('/api/public/jobs/status');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.configured).toBe(true);
      expect(res.body.isConfigured).toBe(true);
      expect(res.body.provider).toBe('live-api');
    });
  });

  describe('POST /api/public/jobs/discover', () => {
    it('operates statelessly without authentication or session headers', async () => {
      const res = await request(app)
        .post('/api/public/jobs/discover')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.jobs)).toBe(true);
      expect(res.body.jobs.length).toBeGreaterThan(0);
      expect(res.body.source).toBe('curated-presets');
      expect(res.body.isConfigured).toBe(false);
    });

    it('returns well-structured job listings with all required fields', async () => {
      const res = await request(app)
        .post('/api/public/jobs/discover')
        .send({});

      expect(res.status).toBe(200);
      const job = res.body.jobs[0];
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('title');
      expect(job).toHaveProperty('company');
      expect(job).toHaveProperty('location');
      expect(job).toHaveProperty('remote_type');
      expect(job).toHaveProperty('employment_type');
      expect(job).toHaveProperty('description');
      expect(job).toHaveProperty('requirements');
      expect(Array.isArray(job.technologies)).toBe(true);
      expect(job).toHaveProperty('posted_at');
    });

    it('filters benchmark jobs by keyword query across title, description, and technologies', async () => {
      const res = await request(app)
        .post('/api/public/jobs/discover')
        .send({ query: 'Security' });

      expect(res.status).toBe(200);
      expect(res.body.jobs.length).toBeGreaterThan(0);
      for (const job of res.body.jobs) {
        const matches =
          job.title.toLowerCase().includes('security') ||
          job.description.toLowerCase().includes('security') ||
          job.technologies.some((t: string) => t.toLowerCase().includes('security'));
        expect(matches).toBe(true);
      }
    });

    it('filters jobs by workplace / remoteType', async () => {
      const res = await request(app)
        .post('/api/public/jobs/discover')
        .send({ remoteType: 'remote' });

      expect(res.status).toBe(200);
      expect(res.body.jobs.length).toBeGreaterThan(0);
      for (const job of res.body.jobs) {
        expect(job.remote_type).toBe('remote');
      }
    });

    it('filters jobs by employmentType', async () => {
      const res = await request(app)
        .post('/api/public/jobs/discover')
        .send({ employmentType: 'contract' });

      expect(res.status).toBe(200);
      expect(res.body.jobs.length).toBeGreaterThan(0);
      for (const job of res.body.jobs) {
        expect(job.employment_type.toLowerCase()).toBe('contract');
      }
    });

    it('filters jobs by location query', async () => {
      const res = await request(app)
        .post('/api/public/jobs/discover')
        .send({ location: 'Manchester' });

      expect(res.status).toBe(200);
      expect(res.body.jobs.length).toBeGreaterThan(0);
      for (const job of res.body.jobs) {
        expect(job.location.toLowerCase()).toContain('manchester');
      }
    });

    it('returns empty array cleanly when no jobs match filter criteria', async () => {
      const res = await request(app)
        .post('/api/public/jobs/discover')
        .send({ query: 'NonExistentRoleXYZ123' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.jobs).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });
});
