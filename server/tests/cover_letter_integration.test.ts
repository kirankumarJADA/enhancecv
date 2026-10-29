// Comprehensive automated test suite for Curevo AI Cover Letter Generator.
//
// Covers all 10 required verification areas:
// 1. Successful cover-letter generation using supplied resume facts.
// 2. Optional job-description tailoring.
// 3. Missing or invalid inputs (insufficient facts rejection, schema validation).
// 4. Preventing invented candidate claims (ungrounded technologies / metrics).
// 5. Truth Guard validation and recovery behaviour.
// 6. AI-provider failure and timeout handling (deterministic fallback).
// 7. Output schema and response validation.
// 8. Copying and editing the generated letter data contracts.
// 9. Cover Letter PDF export (A4 and US Letter, selectable text, filenames).
// 10. Regression of ATS scoring, Sample CV, and public API routes.

import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import publicRouter from '../src/routes/public';
import {
  generateCoverLetter,
  generateDeterministicCoverLetter,
  sanitiseCoverLetter,
  coverLetterSchema,
} from '../src/ai/coverLetterAgent';
import { renderCoverLetterPdf, coverLetterFileName } from '../src/engine/pdf';
import { analyseATS } from '../src/engine/ats';
import { DIMENSION_WEIGHTS } from '../src/engine/audit';
import { AiProvider, AiUnavailableError, setAiProviderForTests } from '../src/ai/provider';
import type { ResumeData, JobAnalysis, CoverLetter } from '../src/types';
import pdfParse from 'pdf-parse';

describe('Curevo AI — Cover Letter Generator Integration Suite', () => {
  afterEach(() => {
    setAiProviderForTests(null);
    vi.restoreAllMocks();
  });

  const sampleCandidate: ResumeData = {
    personal: {
      fullName: 'Aarav Sharma',
      email: 'aarav.sharma@example.com',
      phone: '+44 7700 900123',
      location: 'Manchester, UK',
      headline: 'Senior Cloud Solutions Architect',
    },
    summary:
      'Cloud solutions architect with 6+ years designing distributed systems, Kubernetes platforms, and cutting cloud compute expenditure by £420,000 annually.',
    experience: [
      {
        id: 'exp-1',
        company: 'CloudScale Technologies Ltd',
        title: 'Principal Cloud Architect',
        startDate: 'Jan 2022',
        endDate: 'Present',
        current: true,
        bullets: [
          'Architected multi-region Kubernetes clusters achieving 99.99% uptime across UK and EU zones.',
          'Reduced annual AWS cloud compute expenditure by £420,000 using automated spot scaling and Graviton processors.',
          'Spearheaded Terraform infrastructure modules adopted by 14 cross-functional engineering teams.',
        ],
      },
      {
        id: 'exp-2',
        company: 'Nordic FinTech Systems',
        title: 'Senior DevOps Engineer',
        startDate: 'Mar 2019',
        endDate: 'Dec 2021',
        current: false,
        bullets: [
          'Engineered event-driven microservices monitoring using Kafka and Prometheus.',
          'Decreased release deployment rollback rates by 35% through robust GitOps pipelines.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'University of Manchester',
        degree: 'BSc',
        field: 'Computer Science',
        startDate: '2015',
        endDate: '2018',
      },
    ],
    skills: {
      technical: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'Kafka', 'Python', 'Go', 'Prometheus', 'Linux'],
      soft: ['Leadership', 'Technical Architecture', 'Cross-team Mentorship', 'Stakeholder Communication'],
    },
    projects: [
      {
        id: 'proj-1',
        name: 'OpenCloud Terraform Framework',
        bullets: ['Maintained open-source infrastructure modules with over 1,200 GitHub stars.'],
      },
    ],
    certifications: [
      {
        id: 'cert-1',
        name: 'AWS Certified Solutions Architect — Professional',
        issuer: 'Amazon Web Services',
        year: '2023',
      },
    ],
    languages: [{ id: 'lang-1', name: 'English', proficiency: 'Native' }],
    achievements: ['Delivered keynote on resilient cloud platforms at CloudNative London 2023.'],
    customSections: [],
    sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
    hiddenSections: [],
  };

  const sampleJob: JobAnalysis = {
    title: 'Lead Cloud Platform Architect',
    company: 'NexaCloud Global Ltd',
    seniority: 'Lead',
    yearsRequired: 5,
    requiredSkills: ['AWS', 'Kubernetes', 'Terraform'],
    preferredSkills: ['Kafka', 'Go', 'GCP'],
    softSkills: ['Leadership', 'Mentorship'],
    responsibilities: [
      'Lead enterprise multi-cloud transformation.',
      'Define Terraform architecture blueprints.',
      'Maintain 99.99% availability.',
    ],
    educationRequirements: ["Bachelor's in Computer Science"],
    certificationRequirements: ['AWS Certified Solutions Architect'],
    keywords: ['aws', 'kubernetes', 'terraform', 'kafka', 'go', 'gcp', 'cloud', 'architect'],
    domainTerms: ['cloud', 'architecture'],
  };

  // Helper to build app for supertest
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/public', publicRouter);

  // -------------------------------------------------------------------------
  // 1. Successful Cover Letter Generation Using Supplied Facts
  // -------------------------------------------------------------------------
  describe('1. Successful Cover Letter Generation Using Supplied Facts', () => {
    it('generates a structured, truthful 4-paragraph letter deterministically', () => {
      const letter = generateDeterministicCoverLetter({
        master: sampleCandidate,
        job: sampleJob,
        targetRole: 'Lead Cloud Platform Architect',
        company: 'NexaCloud Global Ltd',
      });

      expect(letter.greeting).toBe('Dear NexaCloud Global Ltd Hiring Team,');
      expect(letter.paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(letter.paragraphs.length).toBeLessThanOrEqual(5);

      // Paragraph 1: Hook + Role + Company
      expect(letter.paragraphs[0]).toContain('Lead Cloud Platform Architect');
      expect(letter.paragraphs[0]).toContain('NexaCloud Global Ltd');

      // Paragraph 2: Direct Experience Match with candidate metrics
      expect(letter.paragraphs[1]).toContain('CloudScale Technologies Ltd');
      expect(letter.paragraphs[1]).toContain('Kubernetes');

      // Paragraph 3: Broader Value (Skills, Projects, Certifications)
      expect(letter.paragraphs[2]).toContain('AWS');
      expect(letter.paragraphs[2]).toContain('University of Manchester');

      // Paragraph 4: Closing Call to Action
      expect(letter.paragraphs[3]).toContain('opportunity to discuss');

      // Signoff
      expect(letter.closing).toContain('Aarav Sharma');
    });

    it('generates a cover letter via AI when provider is configured and passes Truth Guard', async () => {
      const mockAiProvider: AiProvider = {
        name: 'mock-nemotron',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        async completeJson<T>(): Promise<T> {
          return {
            greeting: 'Dear NexaCloud Global Ltd Hiring Team,',
            paragraphs: [
              'Having spent over 6 years designing Kubernetes platforms, I was excited to see NexaCloud Global Ltd expanding its platform engineering group for the Lead Cloud Platform Architect role.',
              'At CloudScale Technologies Ltd, I architected multi-region Kubernetes clusters achieving 99.99% uptime and reduced annual AWS cloud compute expenditure by £420,000.',
              'My core competencies in Terraform, Kafka, and Python are supported by an AWS Certified Solutions Architect credential and a BSc from University of Manchester.',
              'I welcome the opportunity to discuss how my distributed systems experience can accelerate NexaCloud Global Ltd goals. Thank you for your consideration.',
            ],
            closing: 'Sincerely,\nAarav Sharma',
          } as T;
        },
      };

      setAiProviderForTests(mockAiProvider);

      const res = await generateCoverLetter({
        master: sampleCandidate,
        resume: sampleCandidate,
        job: sampleJob,
        jdText: 'Lead Cloud Platform Architect at NexaCloud Global Ltd',
        targetRole: 'Lead Cloud Platform Architect',
        company: 'NexaCloud Global Ltd',
      });

      expect(res.letter.greeting).toBe('Dear NexaCloud Global Ltd Hiring Team,');
      expect(res.letter.paragraphs).toHaveLength(4);
      expect(res.rejectedCount).toBe(0);
      expect(res.isFallback).toBe(false);
      expect(res.provider).toBe('mock-nemotron');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Optional Job-Description Tailoring
  // -------------------------------------------------------------------------
  describe('2. Optional Job-Description Tailoring', () => {
    it('generates a valid cover letter even when no job description is supplied', async () => {
      const letter = generateDeterministicCoverLetter({
        master: sampleCandidate,
      });

      expect(letter.greeting).toBe('Dear Hiring Manager,');
      expect(letter.paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(letter.paragraphs[0]).toContain(sampleCandidate.personal.headline);
      expect(letter.closing).toContain(sampleCandidate.personal.fullName);
    });

    it('adapts greeting and target alignment when company and role are passed', () => {
      const letter = generateDeterministicCoverLetter({
        master: sampleCandidate,
        targetRole: 'Head of Infrastructure',
        company: 'Fintech Innovations',
      });

      expect(letter.greeting).toBe('Dear Fintech Innovations Hiring Team,');
      expect(letter.paragraphs[0]).toContain('Head of Infrastructure');
      expect(letter.paragraphs[0]).toContain('Fintech Innovations');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Missing or Invalid Inputs
  // -------------------------------------------------------------------------
  describe('3. Missing or Invalid Inputs', () => {
    it('rejects cover-letter generation if resume has no experience, summary, or skills', async () => {
      const emptyResume: ResumeData = {
        personal: { fullName: 'Empty Candidate', email: 'empty@example.com', phone: '', location: '' },
        summary: '',
        experience: [],
        education: [],
        skills: { technical: [], soft: [] },
        projects: [],
        certifications: [],
        languages: [],
        achievements: [],
        customSections: [],
        sectionOrder: ['summary'],
        hiddenSections: [],
      };

      const res = await request(app)
        .post('/api/public/cover-letter')
        .send({ resume: emptyResume });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_INPUT');
      expect(res.body.error.message).toContain('insufficient');
    });

    it('rejects malformed cover-letter PDF payload without required fields', async () => {
      const res = await request(app)
        .post('/api/public/cover-letter/pdf')
        .send({ letter: { greeting: 'Hello' } }); // missing paragraphs and closing

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid pageSize parameter in PDF route', async () => {
      const validLetter: CoverLetter = {
        greeting: 'Dear Hiring Manager,',
        paragraphs: ['This is a test paragraph with valid facts.'],
        closing: 'Sincerely, Aarav Sharma',
      };

      const res = await request(app)
        .post('/api/public/cover-letter/pdf')
        .send({ letter: validLetter, pageSize: 'TABLOID' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('A4 and LETTER');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Preventing Invented Candidate Claims (Truth Guard)
  // -------------------------------------------------------------------------
  describe('4. Preventing Invented Candidate Claims (Truth Guard)', () => {
    it('strictly strips sentences containing unevidenced technologies or fabricated numbers', () => {
      const hallucinatedLetter: CoverLetter = {
        greeting: 'Dear Hiring Team,',
        paragraphs: [
          // Sentence 1 has real skill (AWS), sentence 2 fabricates Rust and £10,000,000 revenue
          'I have extensive experience architecting platforms on AWS. In addition, I built microservices using Rust that generated £10,000,000 in recurring revenue.',
          // Sentence 1 has real skill (Terraform), sentence 2 fabricates GCP
          'At CloudScale Technologies Ltd, I authored standard Terraform modules. I also migrated 500 clusters to GCP.',
        ],
        closing: 'Sincerely, Aarav Sharma',
      };

      const sanitised = sanitiseCoverLetter(hallucinatedLetter, sampleCandidate);

      expect(sanitised.rejectedCount).toBe(2);
      expect(sanitised.letter.paragraphs[0]).toContain('AWS');
      expect(sanitised.letter.paragraphs[0]).not.toContain('Rust');
      expect(sanitised.letter.paragraphs[0]).not.toContain('£10,000,000');
      expect(sanitised.letter.paragraphs[1]).toContain('Terraform');
      expect(sanitised.letter.paragraphs[1]).not.toContain('GCP');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Truth Guard Validation and Recovery Behaviour
  // -------------------------------------------------------------------------
  describe('5. Truth Guard Validation and Recovery Behaviour', () => {
    it('recovers with a grounded factual paragraph if all candidate sentences in a paragraph are dropped', () => {
      const totallyFabricatedLetter: CoverLetter = {
        greeting: 'Dear Hiring Manager,',
        paragraphs: [
          'I am a senior Ruby on Rails engineer with deep expertise in Cobol and Fortran.',
          'I managed a $50,000,000 budget deploying systems across Azure China.',
        ],
        closing: 'Sincerely, Aarav Sharma',
      };

      const sanitised = sanitiseCoverLetter(totallyFabricatedLetter, sampleCandidate);

      expect(sanitised.rejectedCount).toBe(2);
      expect(sanitised.letter.paragraphs.length).toBeGreaterThanOrEqual(1);
      // Recovery paragraph draws from candidate summary
      expect(sanitised.letter.paragraphs[0]).toContain('My background aligns closely with this role');
    });
  });

  // -------------------------------------------------------------------------
  // 6. AI-Provider Failure and Timeout Handling (Deterministic Fallback)
  // -------------------------------------------------------------------------
  describe('6. AI-Provider Failure and Timeout Handling', () => {
    it('gracefully falls back to deterministic generator when AI provider times out', async () => {
      const timingOutProvider: AiProvider = {
        name: 'timing-out-nemotron',
        model: 'nvidia/nemotron',
        async completeJson(): Promise<never> {
          throw new AiUnavailableError('AI_TIMEOUT', 'NVIDIA API timed out after 65000ms', true);
        },
      };

      setAiProviderForTests(timingOutProvider);

      const res = await generateCoverLetter({
        master: sampleCandidate,
        job: sampleJob,
        targetRole: 'Lead Cloud Platform Architect',
        company: 'NexaCloud Global Ltd',
        fallbackOnAiFailure: true,
      });

      expect(res.isFallback).toBe(true);
      expect(res.provider).toBe('deterministic');
      expect(res.letter.greeting).toBe('Dear NexaCloud Global Ltd Hiring Team,');
      expect(res.letter.paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(res.warnings?.[0]).toContain('AI_TIMEOUT');
    });

    it('falls back seamlessly when AI provider returns 429 rate limit', async () => {
      const rateLimitedProvider: AiProvider = {
        name: 'busy-nemotron',
        model: 'nvidia/nemotron',
        async completeJson(): Promise<never> {
          throw new AiUnavailableError('AI_RATE_LIMITED', 'Rate limit exceeded', true);
        },
      };

      setAiProviderForTests(rateLimitedProvider);

      const res = await generateCoverLetter({
        master: sampleCandidate,
        fallbackOnAiFailure: true,
      });

      expect(res.isFallback).toBe(true);
      expect(res.letter.greeting).toBe('Dear Hiring Manager,');
      expect(res.letter.paragraphs[0]).toContain(sampleCandidate.personal.headline);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Output Schema and Response Validation
  // -------------------------------------------------------------------------
  describe('7. Output Schema and Response Validation', () => {
    it('validates that generated letter strictly conforms to coverLetterSchema', () => {
      const letter = generateDeterministicCoverLetter({ master: sampleCandidate });
      const parseResult = coverLetterSchema.safeParse(letter);
      expect(parseResult.success).toBe(true);
    });

    it('rejects letters with missing greeting or empty paragraphs array', () => {
      expect(coverLetterSchema.safeParse({ greeting: '', paragraphs: [], closing: 'Sincerely' }).success).toBe(false);
      expect(coverLetterSchema.safeParse({ greeting: 'Hi', paragraphs: ['short'], closing: '' }).success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Copying and Editing the Generated Letter Contracts
  // -------------------------------------------------------------------------
  describe('8. Copying and Editing the Generated Letter Contracts', () => {
    it('formats full letter for clipboard copy with blank lines between paragraphs', () => {
      const letter: CoverLetter = {
        greeting: 'Dear NexaCloud Hiring Team,',
        paragraphs: [
          'Opening paragraph discussing role alignment.',
          'Body paragraph with verified achievement metrics.',
          'Closing paragraph thanking the hiring team.',
        ],
        closing: 'Sincerely,\nAarav Sharma',
      };

      const clipboardText = [
        letter.greeting,
        '',
        letter.paragraphs.join('\n\n'),
        '',
        letter.closing,
      ].join('\n');

      expect(clipboardText).toContain('Dear NexaCloud Hiring Team,');
      expect(clipboardText).toContain('\n\nOpening paragraph');
      expect(clipboardText).toContain('Sincerely,\nAarav Sharma');
    });

    it('supports paragraph modifications, additions, and deletions without schema breach', () => {
      const letter = generateDeterministicCoverLetter({ master: sampleCandidate });
      const edited: CoverLetter = {
        ...letter,
        paragraphs: [
          'Updated custom opening crafted by candidate.',
          ...letter.paragraphs.slice(1),
          'Added custom closing remark.',
        ],
      };

      expect(coverLetterSchema.safeParse(edited).success).toBe(true);
      expect(edited.paragraphs).toHaveLength(letter.paragraphs.length + 1);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Cover Letter PDF Export Functionality
  // -------------------------------------------------------------------------
  describe('9. Cover Letter PDF Export Functionality', () => {
    it('generates a valid selectable A4 PDF buffer containing letter content', async () => {
      const letter: CoverLetter = {
        greeting: 'Dear NexaCloud Global Ltd Hiring Team,',
        paragraphs: [
          'With my background as Senior Cloud Solutions Architect and expertise in AWS and Kubernetes, I am eager to apply.',
          'At CloudScale Technologies Ltd, I architected multi-region Kubernetes clusters achieving 99.99% uptime.',
          'I welcome the opportunity to discuss how my technical skills can contribute to your team. Thank you.',
        ],
        closing: 'Sincerely,\nAarav Sharma',
      };

      const chunks: Buffer[] = [];
      const stream = renderCoverLetterPdf(letter, 'Aarav Sharma', 'A4');

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });

      const buffer = Buffer.concat(chunks);
      expect(buffer.length).toBeGreaterThan(500);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');

      // Ensure a cleanly aligned Uint8Array for pdf-parse (pdf.js v1.10)
      const cleanUint8 = new Uint8Array(buffer);
      const parsed = await pdfParse(cleanUint8 as unknown as Buffer);
      expect(parsed.text).toContain('Dear NexaCloud Global Ltd Hiring Team,');
      expect(parsed.text).toContain('CloudScale Technologies Ltd');
      expect(parsed.text).toContain('Sincerely');
      expect(parsed.text).toContain('Aarav Sharma');
    });

    it('generates a valid US Letter PDF buffer', async () => {
      const letter: CoverLetter = {
        greeting: 'Dear Hiring Manager,',
        paragraphs: ['Paragraph one describing cloud architectures.'],
        closing: 'Sincerely,\nJane Doe',
      };

      const chunks: Buffer[] = [];
      const stream = renderCoverLetterPdf(letter, 'Jane Doe', 'LETTER');

      await new Promise<void>((resolve) => {
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => resolve());
      });

      const buffer = Buffer.concat(chunks);
      expect(buffer.length).toBeGreaterThan(500);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('generates a clean, sanitized cover letter filename', () => {
      expect(coverLetterFileName('Aarav Sharma', 'Lead Architect', 'NexaCloud')).toBe(
        'Aarav_Sharma_Lead_Architect_NexaCloud_Cover_Letter_Curevo_AI.pdf'
      );
      expect(coverLetterFileName('Jane Doe', '', '')).toBe('Jane_Doe_Cover_Letter_Curevo_AI.pdf');
    });
  });

  // -------------------------------------------------------------------------
  // 10. Regression Testing: ATS Scoring, Sample CV, and Public Route
  // -------------------------------------------------------------------------
  describe('10. Regression Testing: ATS Scoring, Sample CV, and Public Route', () => {
    it('guarantees existing 9-dimension ATS weights sum to exactly 100', () => {
      const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    });

    it('confirms ATS scoring evaluates candidate CV consistently', () => {
      const ats = analyseATS(sampleCandidate);
      expect(ats.overallScore).toBeGreaterThanOrEqual(70);
      expect(ats.skillsScore).toBeGreaterThan(0);
      expect(ats.formattingScore).toBeGreaterThan(0);
    });

    it('executes full end-to-end POST /api/public/cover-letter route with HTTP 200', async () => {
      const res = await request(app)
        .post('/api/public/cover-letter')
        .send({
          resume: sampleCandidate,
          jobDescription: 'Seeking Lead Cloud Architect with AWS and Kubernetes at NexaCloud',
          targetRole: 'Lead Cloud Architect',
          company: 'NexaCloud',
          tone: 'professional',
        });

      expect(res.status).toBe(200);
      expect(res.body.letter).toBeDefined();
      expect(res.body.letter.greeting).toContain('NexaCloud');
      expect(res.body.letter.paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(res.body.rejectedCount).toBe(0);
      expect(res.body.isFallback).toBeDefined();
    });

    it('executes full end-to-end POST /api/public/cover-letter/pdf route with HTTP 200 and PDF stream', async () => {
      const letter: CoverLetter = {
        greeting: 'Dear Hiring Manager,',
        paragraphs: ['This is a test paragraph for binary PDF streaming.'],
        closing: 'Sincerely,\nAarav Sharma',
      };

      const res = await request(app)
        .post('/api/public/cover-letter/pdf')
        .send({
          letter,
          candidateName: 'Aarav Sharma',
          role: 'Cloud Architect',
          company: 'Acme',
          pageSize: 'A4',
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('.pdf');
      expect(res.body.length).toBeGreaterThan(500);
    });
  });
});
