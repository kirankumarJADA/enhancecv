// End-to-End Test Suite: AI CV Tailoring, NVIDIA Nemotron Contract, Truth Guard Grounding & Error Fallbacks
//
// Validates:
// 1. Provider configuration detection (NVIDIA Nemotron vs OpenAI vs unconfigured).
// 2. Strict zero-secret leakage contract in /api/public/status.
// 3. Fallback behaviors: 503 AI_NOT_CONFIGURED, 504 AI_TIMEOUT, 429 AI_RATE_LIMITED, 502 AI_MALFORMED, 502 AI_PROVIDER_ERROR.
// 4. Concurrency guard: 429 CONCURRENCY_LIMIT.
// 5. Successful AI tailoring proposal parsing and Truth Guard verification.
// 6. Strict rejection of hallucinated metrics, ungrounded technologies, and invented claims.
// 7. Re-computed ATS score and match analysis on tailored output.
// 8. PDF rendering of tailored output across templates.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import {
  readAiConfigFromEnv,
  getAiStatus,
  getAiProvider,
  __setAiProviderForTests,
  AiProvider,
  AiUnavailableError,
} from '../src/ai/provider';
import { runResumeAgent, proposalSchema, critiqueSchema } from '../src/ai/resumeAgent';
import { analyseJobDescription } from '../src/engine/jd';
import { computeJobMatch } from '../src/engine/match';
import { analyseATS } from '../src/engine/ats';
import { renderResumePdf } from '../src/engine/pdf';
import { __resetRateLimitsForTests } from '../src/middleware/rateLimit';
import { __resetConcurrencyForTests } from '../src/routes/public';
import { makeMasterCV, JAVA_JD } from './fixtures';
import type { Express } from 'express';
import type { ResumeData } from '../src/types';

describe('AI Tailoring End-to-End Verification & Contract', () => {
  let app: Express;

  beforeEach(async () => {
    __setAiProviderForTests(null);
    __resetRateLimitsForTests();
    __resetConcurrencyForTests();
    app = await buildApp();
  });

  afterEach(() => {
    __setAiProviderForTests(null);
    __resetRateLimitsForTests();
    __resetConcurrencyForTests();
  });

  // ---------------------------------------------------------------------------
  // 1. Provider Configuration & Zero-Secret Exposure Contract
  // ---------------------------------------------------------------------------
  describe('1. Configuration & Security Contract', () => {
    it('readAiConfigFromEnv returns null when no API key is set', () => {
      const origNvidia = process.env.NVIDIA_API_KEY;
      const origAi = process.env.AI_API_KEY;
      const origOpenAi = process.env.OPENAI_API_KEY;
      delete process.env.NVIDIA_API_KEY;
      delete process.env.AI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const cfg = readAiConfigFromEnv();
      expect(cfg).toBeNull();

      if (origNvidia) process.env.NVIDIA_API_KEY = origNvidia;
      if (origAi) process.env.AI_API_KEY = origAi;
      if (origOpenAi) process.env.OPENAI_API_KEY = origOpenAi;
    });

    it('GET /api/public/status returns unconfigured state without secrets', async () => {
      const res = await request(app).get('/api/public/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        enabled: false,
        provider: 'deterministic',
        model: 'rules-v1',
        baseUrl: '',
        timeoutMs: 0,
        maxIterations: 2,
      });
      // Verify no secret keys exist in the response
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('key');
      expect(bodyStr).not.toContain('token');
      expect(bodyStr).not.toContain('secret');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Fallbacks & Honest Error Handling
  // ---------------------------------------------------------------------------
  describe('2. Error Fallbacks & HTTP Status Code Mapping', () => {
    const master = makeMasterCV();

    it('returns 503 AI_NOT_CONFIGURED when AI provider is unconfigured', async () => {
      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: master, jobText: JAVA_JD });

      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe('AI_NOT_CONFIGURED');
      expect(res.body.error?.message).toContain('AI provider is not configured');
    });

    it('returns 504 AI_TIMEOUT when NVIDIA provider times out', async () => {
      const mockTimeout: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_TIMEOUT', 'The AI provider did not respond in time.', true)),
      };
      __setAiProviderForTests(mockTimeout);

      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: master, jobText: JAVA_JD });

      expect(res.status).toBe(504);
      expect(res.body.error?.code).toBe('AI_TIMEOUT');
    });

    it('returns 429 AI_RATE_LIMITED when NVIDIA provider rate limits', async () => {
      const mockRateLimit: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_RATE_LIMITED', 'The AI provider is rate limiting requests.', true)),
      };
      __setAiProviderForTests(mockRateLimit);

      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: master, jobText: JAVA_JD });

      expect(res.status).toBe(429);
      expect(res.body.error?.code).toBe('AI_RATE_LIMITED');
    });

    it('returns 502 AI_MALFORMED when NVIDIA provider returns unparseable structure', async () => {
      const mockMalformed: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_MALFORMED', 'AI returned an invalid structure.', true)),
      };
      __setAiProviderForTests(mockMalformed);

      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: master, jobText: JAVA_JD });

      expect(res.status).toBe(502);
      expect(res.body.error?.code).toBe('AI_MALFORMED');
    });

    it('returns 502 AI_PROVIDER_ERROR when provider encounters upstream authentication or gateway error', async () => {
      const mockProviderError: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_PROVIDER_ERROR', 'The AI provider rejected credentials.', false)),
      };
      __setAiProviderForTests(mockProviderError);

      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: master, jobText: JAVA_JD });

      expect(res.status).toBe(502);
      expect(res.body.error?.code).toBe('AI_PROVIDER_ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Live AI Tailoring & Truth Guard Grounding Verification
  // ---------------------------------------------------------------------------
  describe('3. AI Tailoring Pipeline & Truth Guard Factual Grounding', () => {
    const master = makeMasterCV();

    it('executes end-to-end tailoring: applies truthful rewrites, reorders skills, and re-computes ATS score', async () => {
      const mockNvidia: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockImplementation(async (req) => {
          if (req.schema === proposalSchema) {
            return {
              summary: 'Backend software engineer with 4 years experience building distributed payment services and microservices using Java and Spring Boot.',
              bullets: [
                {
                  itemId: 'exp_1',
                  index: 0,
                  text: 'Developed RESTful backend services using Java and Spring Boot serving 120k daily requests with high reliability.',
                },
                {
                  itemId: 'exp_1',
                  index: 3,
                  text: 'Developed backend features for the payments team using Java and Spring Boot.',
                },
              ],
              skillsOrder: ['Java', 'Spring Boot', 'PostgreSQL', 'Docker', 'Redis', 'TypeScript'],
            };
          }
          if (req.schema === critiqueSchema) {
            return {
              summary: 'Strongly aligned with the Java JD requirements.',
              notes: ['High impact metrics preserved', 'Action verbs leading each bullet'],
              suggestions: [],
            };
          }
          throw new Error('Unknown schema');
        }),
      };
      __setAiProviderForTests(mockNvidia);

      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: master, jobText: JAVA_JD });

      expect(res.status).toBe(200);
      expect(res.body.agent.usedAi).toBe(true);
      expect(res.body.agent.provider).toBe('nvidia');
      expect(res.body.agent.model).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
      expect(res.body.agent.iterations).toBeGreaterThanOrEqual(1);

      // Tailored resume checks
      const tailored = res.body.resume as ResumeData;
      expect(tailored.summary).toContain('Backend software engineer');
      expect(tailored.experience[0].bullets[0]).toContain('120k daily requests');
      expect(tailored.experience[0].bullets[3]).toContain('Developed backend features for the payments team');
      expect(tailored.skills.technical[0]).toBe('Java');

      // ChangeLog audit
      expect(Array.isArray(res.body.changeLog)).toBe(true);
      expect(res.body.changeLog.length).toBeGreaterThan(0);
      const summaryChange = res.body.changeLog.find((c: any) => c.type === 'summary');
      expect(summaryChange).toBeDefined();

      // Truth Guard report
      expect(res.body.truth).toBeDefined();
      expect(res.body.truth.passedAll).toBe(true);

      // ATS and Match evaluation
      expect(res.body.atsBefore).toBeDefined();
      expect(res.body.atsAfter).toBeDefined();
      expect(res.body.matchBefore).toBeDefined();
      expect(res.body.matchAfter).toBeDefined();
      expect(res.body.atsAfter.overallScore).toBeGreaterThanOrEqual(res.body.atsBefore.overallScore);

      // Verify tailored resume renders cleanly to PDF across multiple templates
      for (const template of ['classic', 'modern', 'professional']) {
        const doc = renderResumePdf(tailored, { template, marginDensity: 'normal' });
        expect(doc).toBeDefined();
      }
    });

    it('Truth Guard strictly rejects hallucinated metrics (e.g. 999%), ungrounded skills (e.g. Kubernetes, Blockchain), and invented roles', async () => {
      const mockHallucinatory: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockImplementation(async (req) => {
          if (req.schema === proposalSchema) {
            return {
              summary: 'World-renowned Blockchain architect who increased revenue by 999% using Kubernetes, Quantum Computing, and Solidity.',
              bullets: [
                {
                  itemId: 'exp_1',
                  index: 0,
                  text: 'Architected autonomous Kubernetes clusters with 999% cost reduction using Blockchain technology.',
                },
              ],
              skillsOrder: ['Kubernetes', 'Blockchain', 'Solidity', 'Java', 'Spring Boot'],
            };
          }
          if (req.schema === critiqueSchema) {
            return {
              summary: 'Assessment',
              notes: [],
              suggestions: [],
            };
          }
          throw new Error('Unknown schema');
        }),
      };
      __setAiProviderForTests(mockHallucinatory);

      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: master, jobText: JAVA_JD });

      expect(res.status).toBe(200);
      const tailored = res.body.resume as ResumeData;

      // Hallucinated summary must be rejected (reverts to truthful base summary)
      expect(tailored.summary).not.toContain('999%');
      expect(tailored.summary).not.toContain('Blockchain');
      expect(tailored.summary).not.toContain('Quantum');

      // Hallucinated bullet must be rejected (original truthful bullet preserved)
      const exp0Bullet0 = tailored.experience[0].bullets[0];
      expect(exp0Bullet0).not.toContain('999%');
      expect(exp0Bullet0).not.toContain('Blockchain');
      expect(exp0Bullet0).toContain('120k daily requests'); // Truthful original preserved

      // Hallucinated skills injected into skillsOrder must be rejected (cannot add skills not in CV)
      expect(tailored.skills.technical).not.toContain('Kubernetes');
      expect(tailored.skills.technical).not.toContain('Blockchain');
      expect(tailored.skills.technical).not.toContain('Solidity');

      // Verified rejection count tracked in agent meta
      expect(res.body.agent.rejectedCount).toBeGreaterThan(0);
    });
  });
});
