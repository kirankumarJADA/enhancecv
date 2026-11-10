import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { __setAiProviderForTests, AiProvider, JsonCompletionRequest } from '../src/ai/provider';
import { makeMasterCV } from './fixtures';

import type { Express } from 'express';

const FORBIDDEN_TOKENS = [
  'nvidia/nemotron',
  'nemotron-3.5-lightning-30b-a3b',
  'integrate.api.nvidia.com',
  'api.openai.com',
  'gpt-4o',
];

describe('Phase 5D — Public AI Engine Disclosure Safety Suite', () => {
  let app: Express;

  beforeEach(async () => {
    __setAiProviderForTests(null);
    app = await buildApp();
  });

  afterEach(() => {
    __setAiProviderForTests(null);
  });

  it('1. GET /api/public/status serialized response never discloses internal model IDs or gateway URLs', async () => {
    const res = await request(app).get('/api/public/status');
    expect(res.status).toBe(200);

    const serialized = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(serialized).not.toContain(forbidden.toLowerCase());
    }

    // Must not leak any external URL or fake configuration placeholders
    expect(res.body.baseUrl).toBeUndefined();
    expect(res.body.timeoutMs).toBeUndefined();
    expect(serialized).not.toContain('http://');
    expect(serialized).not.toContain('https://');

    // Also verify /api/ai/status alias used by web frontend
    const aliasRes = await request(app).get('/api/ai/status');
    expect(aliasRes.status).toBe(200);
    expect(aliasRes.body.enabled).toBe(false);
  });

  it('2. GET /api/public/status with configured mock AI reports public identity as "AI Engine"', async () => {
    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      async completeJson<T>(req: JsonCompletionRequest<T>): Promise<T> {
        return {} as T;
      },
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app).get('/api/public/status');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.provider).toBe('AI Engine');
    expect(res.body.model).toBe('AI Engine');
    expect(res.body.baseUrl).toBeUndefined();
    expect(res.body.timeoutMs).toBeUndefined();

    const serialized = JSON.stringify(res.body);
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('3. POST /api/public/cover-letter serialized response contains zero internal model IDs or gateways', async () => {
    const master = makeMasterCV();
    const res = await request(app)
      .post('/api/public/cover-letter')
      .send({
        resume: master,
        jobText: 'Software Engineer specializing in Java and Spring Boot.',
        targetRole: 'Software Engineer',
        company: 'Cloud Corp',
      });

    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(serialized).not.toContain(forbidden);
    }
    // Must be either AI Engine or deterministic fallback
    expect(['AI Engine', 'deterministic']).toContain(res.body.provider);
    expect(['AI Engine', 'resumeskills-rules', 'rules-v1']).toContain(res.body.model);
  });

  it('4. POST /api/public/improve serialized response contains zero internal model IDs or gateways', async () => {
    const master = makeMasterCV();

    // 4a. Unconfigured error path
    const unconfiguredRes = await request(app)
      .post('/api/public/improve')
      .send({
        resume: master,
        jobText: 'Software Engineer specializing in Java and Spring Boot.',
      });

    expect(unconfiguredRes.status).toBe(503);
    const unconfSerialized = JSON.stringify(unconfiguredRes.body);
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(unconfSerialized).not.toContain(forbidden);
    }

    // 4b. Configured AI path with mock provider
    const mockNvidia: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        summary: 'Software engineer with 4 years experience building backend services.',
        bullets: [
          {
            itemId: 'exp_1',
            index: 0,
            text: 'Engineered backend services serving 120k daily requests.',
          },
        ],
        skillsOrder: ['Java', 'Spring Boot', 'PostgreSQL'],
      }),
    };
    __setAiProviderForTests(mockNvidia);

    const authedRes = await request(app)
      .post('/api/public/improve')
      .send({
        resume: master,
        jobText: 'Software Engineer specializing in Java and Spring Boot.',
      });

    expect(authedRes.status).toBe(200);
    const authedSerialized = JSON.stringify(authedRes.body);
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(authedSerialized).not.toContain(forbidden);
    }
    expect(authedRes.body.agent.provider).toBe('AI Engine');
    expect(authedRes.body.agent.model).toBe('AI Engine');
  });

  it('5. Error responses from public endpoints sanitize internal details and leak no credentials or URLs', async () => {
    const res = await request(app)
      .post('/api/public/improve')
      .send({ resume: 'invalid-string' });

    expect(res.status).toBe(400);
    const serialized = JSON.stringify(res.body);
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain('nvapi-');
    expect(serialized).not.toContain('Authorization');
  });

  it('6. POST /api/public/interview/prep serialized response contains zero internal model IDs or gateways', async () => {
    const master = makeMasterCV();
    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        questions: [
          {
            id: 'q1',
            question: 'Tell me about a backend scaling challenge.',
            category: 'technical',
            sample_truthful_answer: 'Built APIs serving 120k requests.',
          },
        ],
        studyPlan: ['Review system design'],
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/interview/prep')
      .send({ resume: master, targetRole: 'Senior Engineer' });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('AI Engine');
    expect(res.body.model).toBe('AI Engine');
    const serialized = JSON.stringify(res.body);
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('7. POST /api/public/interview/star-coach serialized response contains zero internal model IDs', async () => {
    const master = makeMasterCV();
    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        relevance: { level: 'high', explanation: 'Directly addresses question.' },
        structureFeedback: 'Good structure',
        clarityFeedback: 'Clear explanation',
        specificityFeedback: 'Specific details',
        impactFeedback: 'High impact',
        strengths: ['Clear delivery'],
        improvements: ['Include more metrics'],
        suggestedStarRefinement: {
          situation: 'Microservice bottlenecks',
          task: 'Scale pipeline',
          action: 'Implemented Redis caching',
          result: 'Reduced latency by 40%',
        },
        overallSummary: 'Strong STAR answer.',
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/interview/star-coach')
      .send({
        question: 'Describe how you solved a latency issue.',
        star: {
          situation: 'High latency on API',
          task: 'Reduce response times',
          action: 'Optimized PostgreSQL indices',
          result: 'Achieved faster response times',
        },
        resume: master,
      });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('AI Engine');
    expect(res.body.model).toBe('AI Engine');
    const serialized = JSON.stringify(res.body);
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('8. POST /api/public/linkedin/optimize serialized response contains zero internal model IDs', async () => {
    const master = makeMasterCV();
    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        scores: {
          overallScore: 88,
          headlineScore: 85,
          aboutScore: 90,
          experienceScore: 88,
          skillsScore: 92,
          searchabilityScore: 85,
          completenessScore: 90,
        },
        analysis: {
          strengths: ['Strong technical background'],
          weaknesses: ['Add more keywords'],
          profileCompletenessFeedback: 'Near all-star',
          positioningReview: 'Strong candidate',
        },
        headlineOptions: [
          {
            type: 'Impact-Driven',
            headline: 'Senior Backend Engineer | Scalable Systems',
            rationale: 'Focuses on architectural impact',
          },
        ],
        improvedAbout: {
          hook: 'Building high-scale services',
          coreStory: 'Experienced engineer passionate about distributed systems.',
          keyAccomplishments: ['Built backend handling 120k requests'],
          specialtiesBlock: 'Java, Spring Boot, PostgreSQL',
          callToAction: 'Open to discussions',
          fullAbout: 'Experienced software engineer.',
        },
        experienceEnhancements: [],
        skillsRecommendations: {
          skillsToAdd: ['Docker'],
          topIndustryPicks: ['Agile'],
        },
        recruiterKeywords: ['Java', 'Spring Boot'],
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/linkedin/optimize')
      .send({
        headline: 'Software Engineer',
        about: 'Passionate about engineering',
        skills: ['Java', 'Spring Boot'],
        targetRole: 'Senior Backend Engineer',
        resume: master,
      });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('AI Engine');
    expect(res.body.model).toBe('AI Engine');
    const serialized = JSON.stringify(res.body);
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
