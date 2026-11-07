import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { __resetConcurrencyForTests } from '../src/routes/public';
import type { Express } from 'express';
import type { ResumeData } from '../src/types';

describe('Curevo AI — Phase 9G Public LinkedIn Profile Optimization API', () => {
  let app: Express;

  const sampleResume: ResumeData = {
    personal: {
      fullName: 'Alex Vance',
      email: 'alex@example.com',
      phone: '+44 7700 900077',
      location: 'London, UK',
      headline: 'Senior Full Stack Engineer',
    },
    summary:
      'Senior Full Stack Engineer with 7 years of experience building resilient distributed systems with TypeScript and Node.js.',
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
      'skills',
      'education',
      'projects',
      'certifications',
      'languages',
      'achievements',
    ],
    hiddenSections: [],
  };

  beforeEach(async () => {
    app = await buildApp();
    __resetConcurrencyForTests();
  });

  describe('1. GET /api/public/linkedin/status', () => {
    it('returns 200 with supported headline styles and sections', async () => {
      const res = await request(app).get('/api/public/linkedin/status');
      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.supportedHeadlineStyles).toContain('Impact-Driven');
      expect(res.body.supportedHeadlineStyles).toContain('Skill-Focused');
      expect(res.body.supportedHeadlineStyles).toContain('Executive / Leadership');
      expect(res.body.supportedHeadlineStyles).toContain('Modern Specialist');
      expect(Array.isArray(res.body.supportedSections)).toBe(true);
    });
  });

  describe('2. POST /api/public/linkedin/optimize', () => {
    it('optimizes profile data anonymously with transparent scores and alternatives', async () => {
      const res = await request(app)
        .post('/api/public/linkedin/optimize')
        .send({
          headline: 'Full Stack Developer',
          about: 'Experienced developer building web apps with TypeScript.',
          targetRole: 'Lead Full Stack Engineer',
          industry: 'Financial Technology',
          skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
          resume: sampleResume,
        });

      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.scores).toBeDefined();
      expect(typeof res.body.scores.overallScore).toBe('number');
      expect(typeof res.body.scores.headlineScore).toBe('number');
      expect(typeof res.body.scores.searchabilityScore).toBe('number');
      expect(Array.isArray(res.body.headlineOptions)).toBe(true);
      expect(res.body.headlineOptions.length).toBeGreaterThanOrEqual(2);
      expect(res.body.improvedAbout).toBeDefined();
      expect(typeof res.body.improvedAbout.text).toBe('string');
      expect(Array.isArray(res.body.recruiterKeywords)).toBe(true);
      expect(res.body.recruiterKeywords.length).toBeGreaterThanOrEqual(3);
      expect(res.body.provider).toBeDefined();
    });

    it('operates even without an attached resume using raw fields', async () => {
      const res = await request(app)
        .post('/api/public/linkedin/optimize')
        .send({
          headline: 'Software Engineer',
          about: 'Building web applications and microservices.',
          skills: ['Python', 'Django', 'Docker'],
          experience: [
            {
              title: 'Backend Engineer',
              company: 'Apex Systems',
              period: '2022 - Present',
              bullets: ['Developed REST APIs handling 5,000 requests per minute.'],
            },
          ],
        });

      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.scores.overallScore).toBeGreaterThan(0);
      expect(res.body.headlineOptions.length).toBeGreaterThanOrEqual(2);
      expect(res.body.improvedAbout.text.length).toBeGreaterThan(50);
    });
  });
});
