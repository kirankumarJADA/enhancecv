import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { __setAiProviderForTests, AiProvider } from '../src/ai/provider';
import { makeMasterCV } from './fixtures';
import type { Express } from 'express';
import type { ResumeData } from '../src/types';

describe('Phase 5E — Real API-Level Adversarial Truth Guard & Release Suite', () => {
  let app: Express;

  beforeEach(async () => {
    __setAiProviderForTests(null);
    app = await buildApp();
  });

  afterEach(() => {
    __setAiProviderForTests(null);
  });

  // --- ATTACK CASE 1: Fabricated 12 years against 5-year Master CV ---
  it('1. POST /api/public/improve reverts AI-fabricated 12-year experience claim to original bullet', async () => {
    const master = makeMasterCV(); // Alex Mercer: 5 years experience (2021 - Present)
    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        summary: 'Accomplished software engineer with 12 years of software engineering experience.',
        bullets: [
          {
            itemId: 'exp_1',
            index: 0,
            text: 'Over 12 years of software engineering experience architecting cloud services.',
          },
        ],
        skillsOrder: ['Java', 'Spring Boot'],
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/improve')
      .send({
        resume: master,
        jobText: 'Senior Software Engineer specializing in Java and Spring Boot cloud services.',
      });

    expect(res.status).toBe(200);
    // Bullet 0 must NOT contain fabricated 12 years — Truth Guard auto-reverts to master
    expect(res.body.resume.experience[0].bullets[0]).toBe(master.experience[0].bullets[0]);
    expect(res.body.resume.experience[0].bullets[0]).not.toContain('12 years');
    expect(res.body.truth.passedAll).toBe(true);
    expect(res.body.agent.rejectedCount).toBeGreaterThan(0);
    
    expect(res.body.agent.provider).toBe('AI Engine');
  });

  // --- ATTACK CASE 2: Separated employment (2010-2011 & 2020-2021) vs Fabricated 8-year claim ---
  it('2. POST /api/public/improve rejects 8 years when candidate has two separated 1-year jobs (gap exclusion)', async () => {
    const separatedCV: ResumeData = {
      ...makeMasterCV(),
      summary: 'Software developer.',
      experience: [
        {
          id: 'exp_sep_1',
          company: 'Legacy Corp',
          title: 'Software Developer',
          startDate: '2010-01',
          endDate: '2011-01', // 1 year
          current: false,
          bullets: ['Developed backend endpoints in Java.'],
        },
        {
          id: 'exp_sep_2',
          company: 'Modern Systems',
          title: 'Backend Engineer',
          startDate: '2020-01',
          endDate: '2021-01', // 1 year (9-year gap between 2011 and 2020)
          current: false,
          bullets: ['Engineered Spring Boot microservices.'],
        },
      ],
    };

    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        summary: 'Software engineer with 8 years of software development experience.',
        bullets: [
          {
            itemId: 'exp_sep_2',
            index: 0,
            text: 'Over 8 years of software development experience building Spring Boot services.',
          },
        ],
        skillsOrder: ['Java', 'Spring Boot'],
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/improve')
      .send({
        resume: separatedCV,
        jobText: 'Senior Backend Engineer with 5+ years experience.',
      });

    expect(res.status).toBe(200);
    // 8 years must be rejected because accumulated union is only 2 years (gap excluded)
    expect(res.body.resume.experience[1].bullets[0]).toBe('Engineered Spring Boot microservices.');
    expect(res.body.resume.experience[1].bullets[0]).not.toContain('8 years');
    expect(res.body.truth.passedAll).toBe(true);
    expect(res.body.agent.rejectedCount).toBeGreaterThan(0);
  });

  // --- ATTACK CASE 3: Overlapping employment (2020-2022 & 2021-2023) ---
  it('3. POST /api/public/improve correctly unions overlapping periods (3 years max, rejecting 5-year inflation)', async () => {
    const overlappingCV: ResumeData = {
      ...makeMasterCV(),
      experience: [
        {
          id: 'exp_ov_1',
          company: 'Alpha Inc',
          title: 'Software Engineer',
          startDate: '2020-01',
          endDate: '2022-01', // 2 years
          current: false,
          bullets: ['Built APIs in Java.'],
        },
        {
          id: 'exp_ov_2',
          company: 'Beta LLC',
          title: 'Cloud Engineer',
          startDate: '2021-01',
          endDate: '2023-01', // 2 years (overlapping 2021-2022, union is 2020-2023 = 3 years)
          current: false,
          bullets: ['Maintained cloud infrastructure.'],
        },
      ],
    };

    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        summary: 'Cloud engineer with 5 years of software engineering experience.',
        bullets: [
          {
            itemId: 'exp_ov_2',
            index: 0,
            text: 'Delivered 5 years of software engineering experience maintaining cloud services.',
          },
        ],
        skillsOrder: ['Java', 'Docker'],
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/improve')
      .send({
        resume: overlappingCV,
        jobText: 'Cloud Engineer with 3+ years experience.',
      });

    expect(res.status).toBe(200);
    // 5 years must be reverted because union is 3 years
    expect(res.body.resume.experience[1].bullets[0]).toBe('Maintained cloud infrastructure.');
    expect(res.body.truth.passedAll).toBe(true);
    expect(res.body.agent.rejectedCount).toBeGreaterThan(0);
  });

  // --- ATTACK CASE 4: Leadership duration vs General IC duration ---
  it('4. POST /api/public/improve rejects leadership duration claim when candidate has only IC experience', async () => {
    const icMaster: ResumeData = {
      ...makeMasterCV(), // Alex Mercer is an individual contributor with no management history
      experience: [
        {
          id: 'exp_ic_1',
          company: 'Tech Corp',
          title: 'Senior Software Engineer', // IC role
          startDate: '2021-01',
          endDate: 'Present',
          current: true,
          bullets: ['Designed microservice architectures in Java and Spring Boot.'],
        },
      ],
    };

    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        summary: 'Engineering leader with 5 years of engineering leadership.',
        bullets: [
          {
            itemId: 'exp_ic_1',
            index: 0,
            text: 'Delivered 5 years of engineering leadership designing microservices.',
          },
        ],
        skillsOrder: ['Java', 'Spring Boot'],
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/improve')
      .send({
        resume: icMaster,
        jobText: 'Engineering Lead to guide cross-functional teams.',
      });

    expect(res.status).toBe(200);
    // Must be reverted: candidate has general experience but ZERO leadership evidence
    expect(res.body.resume.experience[0].bullets[0]).toBe('Designed microservice architectures in Java and Spring Boot.');
    expect(res.body.truth.passedAll).toBe(true);
    expect(res.body.agent.rejectedCount).toBeGreaterThan(0);
  });

  // --- ATTACK CASE 5: Inflated financial & reliability metrics ($5.8M and 99.999%) ---
  it('5. POST /api/public/improve auto-fixes unevidenced financial scale and SLA inflation', async () => {
    const master = makeMasterCV(); // Contains 120k requests, $1.2M in text
    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        summary: 'Senior software engineer.',
        bullets: [
          {
            itemId: 'exp_1',
            index: 0,
            text: 'Managed $5.8M department budget maintaining 99.999% high-availability SLA.',
          },
        ],
        skillsOrder: ['Java', 'Spring Boot'],
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/improve')
      .send({
        resume: master,
        jobText: 'Senior Backend Engineer specializing in high-reliability financial systems.',
      });

    expect(res.status).toBe(200);
    // Hallucinated $5.8M and 99.999% must be auto-fixed by reverting
    expect(res.body.resume.experience[0].bullets[0]).toBe(master.experience[0].bullets[0]);
    expect(res.body.truth.passedAll).toBe(true);
    expect(res.body.agent.rejectedCount).toBeGreaterThan(0);
  });

  // --- ATTACK CASE 6: Phantom headcount (team of 45 engineers) ---
  it('6. POST /api/public/improve rejects phantom headcount claims exceeding Master CV scale', async () => {
    const master = makeMasterCV(); // Mentions "team of 5 engineers" at most
    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        summary: 'Senior engineer.',
        bullets: [
          {
            itemId: 'exp_1',
            index: 0,
            text: 'Led high-performing global team of 45 engineers delivering core payment gateway.',
          },
        ],
        skillsOrder: ['Java', 'Spring Boot'],
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/improve')
      .send({
        resume: master,
        jobText: 'Director of Engineering managing large teams.',
      });

    expect(res.status).toBe(200);
    expect(res.body.resume.experience[0].bullets[0]).toBe(master.experience[0].bullets[0]);
    expect(res.body.truth.passedAll).toBe(true);
    expect(res.body.agent.rejectedCount).toBeGreaterThan(0);
  });

  // --- ATTACK CASE 7: Unsupported technologies (Rust, Kubernetes, GraphQL) ---
  it('7. POST /api/public/improve flags unsupported technologies not grounded in Master CV', async () => {
    const master = makeMasterCV(); // Contains Java, Spring Boot, PostgreSQL, Docker (no Rust or GraphQL)
    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        summary: 'Senior software engineer.',
        bullets: [
          {
            itemId: 'exp_1',
            index: 0,
            text: 'Engineered high-throughput microservices using Rust, Kubernetes, and GraphQL.',
          },
        ],
        skillsOrder: ['Java', 'Spring Boot'],
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/improve')
      .send({
        resume: master,
        jobText: 'Rust and Kubernetes Engineer.',
      });

    expect(res.status).toBe(200);
    expect(res.body.resume.experience[0].bullets[0]).toBe(master.experience[0].bullets[0]);
    expect(res.body.truth.passedAll).toBe(true);
    expect(res.body.agent.rejectedCount).toBeGreaterThan(0);
  });

  // --- ATTACK CASE 8: Cover letter sentence pruner on adversarial claims ---
  it('8. POST /api/public/cover-letter prunes adversarial duration, metric and tech hallucinations', async () => {
    const master = makeMasterCV();
    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        greeting: 'Dear Hiring Team,',
        paragraphs: [
          'I am writing to express my strong enthusiasm for the Senior Backend Engineer position at Acme Corp.',
          'Over my 12 years of executive engineering leadership, I managed a $5.8M budget and scaled Rust clusters.',
          'At my current role, I developed RESTful services using Java and Spring Boot serving 120k daily requests.',
        ],
        closing: 'Sincerely,\nAlex Mercer',
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/cover-letter')
      .send({
        resume: master,
        jobText: 'Senior Backend Engineer with Java and Spring Boot experience.',
        targetRole: 'Senior Backend Engineer',
        company: 'Acme Corp',
      });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('AI Engine');
    expect(res.body.model).toBe('AI Engine');

    const fullLetter = res.body.letter.paragraphs.join(' ');
    // Grounded claims survive
    expect(fullLetter).toContain('Java');
    expect(fullLetter).toContain('120k daily requests');
    // Hallucinated claims are pruned
    expect(fullLetter).not.toContain('12 years');
    expect(fullLetter).not.toContain('$5.8M');
    expect(fullLetter).not.toContain('Rust');
    expect(res.body.rejectedCount).toBeGreaterThanOrEqual(1);
  });

  // --- LEGITIMATE CASE 9: Grounded technical versions & metrics pass safely ---
  it('9. POST /api/public/improve preserves legitimate grounded technical versions and metrics', async () => {
    const masterWithVersions: ResumeData = {
      ...makeMasterCV(),
      skills: {
        technical: ['Java', 'Python', 'PostgreSQL', 'Docker', 'Spring Boot'],
        soft: ['Leadership'],
      },
      experience: [
        {
          id: 'exp_legit_1',
          company: 'Cloud Scale',
          title: 'Senior Software Engineer',
          startDate: '2021-01',
          endDate: 'Present',
          current: true,
          bullets: [
            'Architected backend services in Python 3.11 and Java 17 serving 120k daily requests.',
          ],
        },
      ],
    };

    const mockAi: AiProvider = {
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: async () => ({
        summary: 'Senior software engineer with 5 years experience.',
        bullets: [
          {
            itemId: 'exp_legit_1',
            index: 0,
            text: 'Architected high-throughput services in Python 3.11 and Java 17 serving 120k daily requests.',
          },
        ],
        skillsOrder: ['Java', 'Python', 'PostgreSQL'],
      }),
    };
    __setAiProviderForTests(mockAi);

    const res = await request(app)
      .post('/api/public/improve')
      .send({
        resume: masterWithVersions,
        jobText: 'Senior Engineer with Python and Java expertise.',
      });

    expect(res.status).toBe(200);
    // Grounded rewrite accepted without false metric flags
    expect(res.body.resume.experience[0].bullets[0]).toContain('Python 3.11');
    expect(res.body.resume.experience[0].bullets[0]).toContain('Java 17');
    expect(res.body.resume.experience[0].bullets[0]).toContain('120k daily requests');
    expect(res.body.truth.passedAll).toBe(true);
  });

  // --- DETERMINISTIC FALLBACK CASE 10: Fallback introduces zero hallucinations ---
  it('10. POST /api/public/cover-letter deterministic fallback produces 100% grounded letter', async () => {
    const master = makeMasterCV();
    // No mock AI set -> forces fallback
    const res = await request(app)
      .post('/api/public/cover-letter')
      .send({
        resume: master,
        jobText: 'Senior Java Backend Engineer.',
        targetRole: 'Senior Java Backend Engineer',
        company: 'Cloud Corp',
      });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('deterministic');
    expect(res.body.isFallback).toBe(true);
    expect(res.body.letter.paragraphs.length).toBeGreaterThan(0);
    const text = res.body.letter.paragraphs.join(' ');
    // Deterministic rules engine uses only verified facts from Master CV
    expect(text).not.toContain('12 years');
    expect(text).not.toContain('$5.8M');
  });
});
