import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { __resetConcurrencyForTests } from '../src/routes/public';
import type { Express } from 'express';

describe('Curevo AI — Phase 9H Public Company Research Intelligence API', () => {
  let app: Express;

  beforeEach(async () => {
    app = await buildApp();
    __resetConcurrencyForTests();
  });

  describe('1. GET /api/public/company-research/status', () => {
    it('returns 200 with search provider configuration and curated companies', async () => {
      const res = await request(app).get('/api/public/company-research/status');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.isConfigured).toBe('boolean');
      expect(Array.isArray(res.body.curatedCompanies)).toBe(true);
      expect(res.body.curatedCompanies).toContain('Apex Cloud Systems');
    });
  });

  describe('2. POST /api/public/company-research', () => {
    it('returns 400 when company name is omitted', async () => {
      const res = await request(app)
        .post('/api/public/company-research')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_COMPANY');
    });

    it('returns verified curated benchmark research with source URLs when search is not configured', async () => {
      const res = await request(app)
        .post('/api/public/company-research')
        .send({
          company: 'Apex Cloud Systems',
          jobDescription: 'Senior Kubernetes and Cloud Platform Engineer',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.research.company).toBe('Apex Cloud Systems');
      expect(res.body.research.industry).toContain('Cloud Infrastructure');
      expect(Array.isArray(res.body.research.productsServices)).toBe(true);
      expect(Array.isArray(res.body.research.recentDevelopments)).toBe(true);
      expect(res.body.research.recentDevelopments.length).toBeGreaterThan(0);
      expect(res.body.research.recentDevelopments[0].sourceUrl).toMatch(/^https?:\/\//);
      expect(Array.isArray(res.body.research.suggestedInterviewerQuestions)).toBe(true);
      expect(res.body.research.isCuratedBenchmark).toBe(true);
    });

    it('returns an honest configuration error for unverified companies when live search is not configured', async () => {
      const res = await request(app)
        .post('/api/public/company-research')
        .send({
          company: 'NonExistentStartupXYZ998',
        });

      // Must return 503 rather than fabricating fake company facts
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('RESEARCH_NOT_CONFIGURED');
    });
  });
});
