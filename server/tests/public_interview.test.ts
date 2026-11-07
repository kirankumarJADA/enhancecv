import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { __resetConcurrencyForTests } from '../src/routes/public';
import type { Express } from 'express';
import type { ResumeData } from '../src/types';

describe('Curevo AI — Phase 9F Public Interview Prep & Mock Interview Coach API', () => {
  let app: Express;

  const sampleResume: ResumeData = {
    personal: {
      fullName: 'Alex Vance',
      email: 'alex@example.com',
      phone: '+44 7700 900077',
      location: 'London, UK',
      headline: 'Senior Full Stack Engineer',
    },
    summary: 'Senior Full Stack Engineer with 7 years of experience building resilient distributed systems with TypeScript and Node.js.',
    experience: [
      {
        id: 'exp-1',
        company: 'CloudScale UK',
        title: 'Senior Software Engineer',
        location: 'London, UK',
        startDate: '2021',
        endDate: 'Present',
        current: true,
        bullets: [
          'Architected high-throughput microservices using Node.js and TypeScript, handling 15,000 requests per second.',
          'Reduced p99 database query latency by 42% by introducing Redis caching and connection pooling.',
          'Mentored a team of 5 junior engineers and established automated CI/CD pipelines.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-1',
        degree: 'BSc Computer Science',
        institution: 'University of Bristol',
        startDate: '2014',
        endDate: '2017',
      },
    ],
    skills: {
      technical: ['TypeScript', 'Node.js', 'PostgreSQL', 'Redis', 'React', 'Docker'],
      soft: ['Mentorship', 'Cross-functional Collaboration', 'System Design'],
    },
    projects: [
      {
        id: 'proj-1',
        name: 'OpenTelemetry Observability Mesh',
        bullets: ['Implemented distributed tracing across 12 microservices.'],
      },
    ],
    certifications: [],
    languages: [{ id: 'lang-1', name: 'English', proficiency: 'Native' }],
    achievements: ['Speaker at London Node User Group 2023'],
    customSections: [],
    sectionOrder: [
      'summary',
      'experience',
      'projects',
      'skills',
      'education',
      'certifications',
      'languages',
      'achievements',
    ],
    hiddenSections: [],
  };

  const sampleJobDescription = `
    Job Title: Staff Backend Engineer
    Company: Monolith Financial Technologies
    Location: London, UK (Hybrid)
    Requirements:
    - 5+ years of experience with TypeScript, Node.js, and PostgreSQL
    - Proven track record with distributed systems and low-latency databases
    - Strong mentoring and team leadership skills
  `;

  beforeEach(async () => {
    __resetConcurrencyForTests();
    app = await buildApp();
  });

  describe('GET /api/public/interview/status', () => {
    it('returns status with categories and framework details', async () => {
      const res = await request(app).get('/api/public/interview/status');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.categories)).toBe(true);
      expect(res.body.categories).toContain('TECHNICAL');
      expect(res.body.categories).toContain('BEHAVIOURAL');
      expect(res.body.categories).toContain('SITUATIONAL');
      expect(res.body.categories).toContain('HR');
      expect(res.body.framework).toContain('STAR');
    });
  });

  describe('POST /api/public/interview/prep', () => {
    it('operates statelessly with minimal or no payload', async () => {
      const res = await request(app).post('/api/public/interview/prep').send({});
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.questions)).toBe(true);
      expect(res.body.questions.length).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(res.body.studyPlan)).toBe(true);
      expect(typeof res.body.provider).toBe('string');
    });

    it('generates role-specific questions grounded in CV and JD evidence', async () => {
      const res = await request(app)
        .post('/api/public/interview/prep')
        .send({
          resume: sampleResume,
          jobDescription: sampleJobDescription,
          targetRole: 'Staff Backend Engineer',
          company: 'Monolith Financial Technologies',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.questions.length).toBeGreaterThanOrEqual(4);

      const firstQuestion = res.body.questions[0];
      expect(firstQuestion).toHaveProperty('category');
      expect(firstQuestion).toHaveProperty('question');
      expect(firstQuestion).toHaveProperty('why_it_may_be_asked');
      expect(firstQuestion).toHaveProperty('recommended_answer_structure');
      expect(firstQuestion).toHaveProperty('sample_truthful_answer');
      expect(res.body.studyPlan.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/public/interview/star-coach', () => {
    it('rejects missing question with 400', async () => {
      const res = await request(app)
        .post('/api/public/interview/star-coach')
        .send({
          star: {
            situation: 'High traffic incident',
            task: 'Mitigate latency',
            action: 'Implemented Redis cache',
            result: 'Latency dropped 42%',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUESTION');
    });

    it('rejects empty STAR fields with 400', async () => {
      const res = await request(app)
        .post('/api/public/interview/star-coach')
        .send({
          question: 'Tell me about a high-pressure situation.',
          star: { situation: '', task: '', action: '', result: '' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EMPTY_STAR_ANSWER');
    });

    it('evaluates STAR answer with qualitative dimensions and Truth Guard', async () => {
      const res = await request(app)
        .post('/api/public/interview/star-coach')
        .send({
          question: 'Tell me about a time you solved a performance bottleneck.',
          resume: sampleResume,
          star: {
            situation: 'At CloudScale UK, our database experienced p99 latency spikes during peak trading hours.',
            task: 'I was tasked with identifying the root cause and restoring response times below 100ms.',
            action: 'I analysed query execution plans, added indexes, and architected a Redis caching layer.',
            result: 'Query latency was reduced by 42% and peak throughput increased to 15,000 requests per second.',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.relevance).toHaveProperty('level');
      expect(['low', 'medium', 'high']).toContain(res.body.relevance.level);
      expect(typeof res.body.structureFeedback).toBe('string');
      expect(typeof res.body.clarityFeedback).toBe('string');
      expect(typeof res.body.specificityFeedback).toBe('string');
      expect(typeof res.body.impactFeedback).toBe('string');
      expect(Array.isArray(res.body.strengths)).toBe(true);
      expect(Array.isArray(res.body.improvements)).toBe(true);
      expect(Array.isArray(res.body.unsupportedClaims)).toBe(true);
    });

    it('flags unsupported claims when answer fabricates metrics/facts outside CV', async () => {
      const res = await request(app)
        .post('/api/public/interview/star-coach')
        .send({
          question: 'Describe an achievement you are proud of.',
          resume: sampleResume,
          star: {
            situation: 'At Google DeepMind in 2024, our quantum computing cluster crashed.',
            task: 'I had to rewrite the kernel in Rust.',
            action: 'I led 50 engineers to deploy a satellite link.',
            result: 'Saved $500,000,000 in revenue.',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.unsupportedClaims.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/public/interview/mock-evaluate', () => {
    it('validates required inputs', async () => {
      const emptyQ = await request(app).post('/api/public/interview/mock-evaluate').send({ answer: 'Valid answer' });
      expect(emptyQ.status).toBe(400);
      expect(emptyQ.body.error.code).toBe('INVALID_QUESTION');

      const emptyA = await request(app).post('/api/public/interview/mock-evaluate').send({ question: 'Valid question' });
      expect(emptyA.status).toBe(400);
      expect(emptyA.body.error.code).toBe('EMPTY_ANSWER');
    });

    it('evaluates mock interview answer with adaptive follow-up', async () => {
      const res = await request(app)
        .post('/api/public/interview/mock-evaluate')
        .send({
          question: 'How do you approach designing a resilient distributed system?',
          answer:
            'I prioritize loose coupling using asynchronous message queues, idempotent consumers, and automated circuit breakers. In my previous role at CloudScale UK, I applied these patterns to maintain 99.99% uptime.',
          resume: sampleResume,
          difficulty: 'senior',
          questionNumber: 1,
          totalQuestions: 4,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.relevance).toHaveProperty('level');
      expect(typeof res.body.structure).toBe('string');
      expect(typeof res.body.clarity).toBe('string');
      expect(typeof res.body.followUpQuestion).toBe('string');
      expect(res.body.followUpQuestion.length).toBeGreaterThan(5);
    });
  });

  describe('POST /api/public/interview/mock-final', () => {
    it('rejects empty transcript with 400', async () => {
      const res = await request(app)
        .post('/api/public/interview/mock-final')
        .send({ questionsAndAnswers: [] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSCRIPT');
    });

    it('generates a comprehensive qualitative final report', async () => {
      const res = await request(app)
        .post('/api/public/interview/mock-final')
        .send({
          resume: sampleResume,
          difficulty: 'senior',
          questionsAndAnswers: [
            {
              category: 'TECHNICAL',
              question: 'How do you optimize slow database queries?',
              answer: 'I inspect query execution plans with EXPLAIN ANALYZE, add targeted indexes, and introduce caching where reads heavily outweigh writes.',
            },
            {
              category: 'BEHAVIOURAL',
              question: 'Tell me about how you handled a disagreement with a team member.',
              answer: 'I focused on our shared user outcomes, wrote small benchmark proofs-of-concept for both proposals, and agreed on the data-backed solution.',
            },
            {
              category: 'SITUATIONAL',
              question: 'What do you do if a critical deployment causes a regression in production?',
              answer: 'I immediately initiate a rollback to the last verified stable release, communicate status transparently, and conduct a blameless post-mortem.',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.summary).toBe('string');
      expect(['exceptional', 'proficient', 'developing', 'needs_practice']).toContain(res.body.overallRating);
      expect(Array.isArray(res.body.keyStrengths)).toBe(true);
      expect(Array.isArray(res.body.criticalAreasForImprovement)).toBe(true);
      expect(Array.isArray(res.body.recommendedPreparationSteps)).toBe(true);
      expect(Array.isArray(res.body.competencyBreakdown)).toBe(true);
    });
  });
});
