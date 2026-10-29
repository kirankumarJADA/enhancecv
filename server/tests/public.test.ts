// Test suite verifying Phase 2: Public Stateless Resume API & NVIDIA Nemotron Integration.
// Validates:
// - All public routes operate statelessly without authentication, cookies, or PostgreSQL.
// - File parsing (PDF/DOCX/TXT) through hardened parser.
// - Deterministic ATS evaluation and JD matching.
// - Complete NVIDIA-powered resume improvement with Truth Guard.
// - New resume creation from user facts with Truth Guard enforcement.
// - PDF streaming across all 6 ATS-safe templates.
// - Clear, safe error responses for unconfigured AI, timeouts, malformed responses, and rate/concurrency limits.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { __setAiProviderForTests, AiProvider, AiUnavailableError } from '../src/ai/provider';
import { __resetRateLimitsForTests } from '../src/middleware/rateLimit';
import { __resetConcurrencyForTests } from '../src/routes/public';
import pdfParse from 'pdf-parse';
import type { Express } from 'express';
import type { ResumeData } from '../src/types';

const SAMPLE_RESUME: ResumeData = {
  personal: {
    fullName: 'Priya Patel',
    email: 'priya.patel@example.com',
    phone: '+44 7700 900123',
    location: 'London, UK',
    headline: 'Senior Full Stack Engineer',
    linkedin: 'linkedin.com/in/priyapatel',
    github: 'github.com/priyapatel',
  },
  summary: 'Full stack software engineer with 5 years experience building scalable web applications with TypeScript, Node.js and React.',
  experience: [
    {
      id: 'exp_1',
      company: 'FinTech Cloud Ltd',
      title: 'Senior Software Engineer',
      location: 'London',
      startDate: '2022',
      endDate: 'Present',
      current: true,
      bullets: [
        'Architected high-throughput payment processing APIs handling 25000 transactions daily using Node.js and TypeScript.',
        'Spearheaded migration to AWS microservices reducing API latency by 40%.',
      ],
    },
    {
      id: 'exp_2',
      company: 'TechWave Solutions',
      title: 'Software Developer',
      location: 'London',
      startDate: '2019',
      endDate: '2022',
      current: false,
      bullets: [
        'Developed full stack React and Express web portals for enterprise clients.',
        'Wrote comprehensive unit and integration tests achieving 85% test coverage.',
      ],
    },
  ],
  education: [
    {
      id: 'edu_1',
      institution: 'University of Bristol',
      degree: 'BSc Computer Science',
      field: 'Computer Science',
      startDate: '2016',
      endDate: '2019',
    },
  ],
  skills: {
    technical: ['TypeScript', 'Node.js', 'React', 'AWS', 'Docker', 'PostgreSQL', 'Express'],
    soft: ['Leadership', 'Agile', 'Communication'],
  },
  projects: [
    {
      id: 'proj_1',
      name: 'OpenMetrics Dashboard',
      bullets: ['Built real-time telemetry dashboard using React and WebSockets.'],
      tech: ['React', 'TypeScript', 'WebSockets'],
    },
  ],
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
  achievements: [],
  customSections: [],
  sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
  hiddenSections: [],
};

const SAMPLE_RAW_TEXT_RESUME = `Priya Patel
priya.patel@example.com | +44 7700 900123 | London, UK

SUMMARY
Full stack software engineer with 5 years experience building scalable web applications.

EXPERIENCE
Senior Software Engineer, FinTech Cloud Ltd 2022 - Present
• Architected high-throughput payment processing APIs handling 25000 transactions daily using Node.js and TypeScript.
• Spearheaded migration to AWS microservices reducing API latency by 40%.

Software Developer, TechWave Solutions 2019 - 2022
• Developed full stack React and Express web portals for enterprise clients.
• Wrote comprehensive unit and integration tests achieving 85% test coverage.

EDUCATION
BSc Computer Science, University of Bristol 2016 - 2019

SKILLS
TypeScript, Node.js, React, AWS, Docker, PostgreSQL, Express
`;

describe('Phase 2 — Public Stateless API & NVIDIA Nemotron Backend', () => {
  let app: Express;

  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    __setAiProviderForTests(null);
    __resetRateLimitsForTests();
    __resetConcurrencyForTests();
    app = await buildApp();
  });

  afterEach(() => {
    __setAiProviderForTests(null);
    __resetRateLimitsForTests();
    __resetConcurrencyForTests();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // 1. Zero Database & Stateless Verification
  // -------------------------------------------------------------
  describe('1. Zero Database & Stateless Operations', () => {
    it('executes public endpoints without initiating database connections', async () => {
      const connectSpy = vi.spyOn(Pool.prototype, 'connect');
      const querySpy = vi.spyOn(Pool.prototype, 'query');

      const res = await request(app)
        .post('/api/public/ats')
        .send({ resume: SAMPLE_RESUME });

      expect(res.status).toBe(200);
      expect(res.body.ats).toBeDefined();
      expect(connectSpy).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // 2. POST /api/public/parse
  // -------------------------------------------------------------
  describe('2. POST /api/public/parse (Hardened Upload Parser)', () => {
    it('parses a plain text resume and returns structured data with ATS score', async () => {
      const res = await request(app)
        .post('/api/public/parse')
        .attach('file', Buffer.from(SAMPLE_RAW_TEXT_RESUME, 'utf8'), 'resume.txt');

      expect(res.status).toBe(200);
      expect(res.body.resume).toBeDefined();
      expect(res.body.resume.personal.fullName).toBe('Priya Patel');
      expect(res.body.ats).toBeDefined();
      expect(res.body.ats.overallScore).toBeGreaterThan(0);
      expect(res.body.confidence).toBeDefined();
      expect(Array.isArray(res.body.notes)).toBe(true);
    });

    it('rejects unsupported file formats with 400 UNSUPPORTED_FILE_TYPE', async () => {
      const res = await request(app)
        .post('/api/public/parse')
        .attach('file', Buffer.from('malicious binary content'), 'payload.exe');

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('rejects mismatched multipart field names (e.g. "resume") with 400 UPLOAD_ERROR and "Unexpected field"', async () => {
      const res = await request(app)
        .post('/api/public/parse')
        .attach('resume', Buffer.from(SAMPLE_RAW_TEXT_RESUME, 'utf8'), 'resume.txt');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('UPLOAD_ERROR');
      expect(res.body.error.message).toContain('Unexpected field');
    });

    it('rejects files exceeding the 8MB size limit with 413 FILE_TOO_LARGE', async () => {
      // 8MB + 1 byte
      const oversizedBuffer = Buffer.alloc(8 * 1024 * 1024 + 10, 'a');
      const res = await request(app)
        .post('/api/public/parse')
        .attach('file', oversizedBuffer, 'oversized.txt');

      expect(res.status).toBe(413);
      expect(res.body.error?.code).toBe('FILE_TOO_LARGE');
    });

    it('rejects request with no file attached with 400', async () => {
      const res = await request(app).post('/api/public/parse');
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('UNSUPPORTED_FILE_TYPE');
    });
  });

  // -------------------------------------------------------------
  // 3. POST /api/public/ats
  // -------------------------------------------------------------
  describe('3. POST /api/public/ats (Deterministic ATS Analysis)', () => {
    it('evaluates valid resume and returns comprehensive ATS score breakdown and audit', async () => {
      const res = await request(app)
        .post('/api/public/ats')
        .send({ resume: SAMPLE_RESUME });

      expect(res.status).toBe(200);
      expect(res.body.ats).toBeDefined();
      expect(res.body.ats.overallScore).toBeGreaterThanOrEqual(0);
      expect(res.body.ats.overallScore).toBeLessThanOrEqual(100);
      expect(res.body.ats.completeness.status).toBe('complete');
      expect(res.body.ats.formattingScore).toBeGreaterThan(0);
      expect(res.body.ats.contentScore).toBeGreaterThan(0);
      expect(res.body.ats.skillsScore).toBeGreaterThan(0);
      expect(res.body.audit).toBeDefined();
      expect(res.body.audit.dimensions.parsing).toBeDefined();
    });

    it('rejects missing or invalid resume structure with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/public/ats')
        .send({ resume: { personal: {} } });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  // -------------------------------------------------------------
  // 3b. POST /api/public/audit
  // -------------------------------------------------------------
  describe('3b. POST /api/public/audit (Advanced ATS Audit Across 9 Dimensions)', () => {
    it('returns full 9-dimension audit breakdown with ratings and findings', async () => {
      const res = await request(app)
        .post('/api/public/audit')
        .send({ resume: SAMPLE_RESUME });

      expect(res.status).toBe(200);
      expect(res.body.audit).toBeDefined();
      expect(res.body.audit.overallScore).toBeGreaterThanOrEqual(0);
      expect(res.body.audit.overallScore).toBeLessThanOrEqual(100);
      expect(res.body.audit.dimensions.parsing).toBeDefined();
      expect(res.body.audit.dimensions.quantification).toBeDefined();
      expect(res.body.audit.dimensions.repetition).toBeDefined();
      expect(res.body.audit.dimensions.spelling).toBeDefined();
      expect(res.body.audit.dimensions.consistency).toBeDefined();
      expect(res.body.audit.dimensions.sections).toBeDefined();
      expect(res.body.audit.dimensions.essentials).toBeDefined();
      expect(res.body.audit.dimensions.recruiter).toBeDefined();
      expect(res.body.audit.dimensions.inclusivity).toBeDefined();
      expect(Array.isArray(res.body.audit.quickWins)).toBe(true);
      expect(Array.isArray(res.body.audit.strengths)).toBe(true);
      expect(res.body.ats).toBeDefined();
    });

    it('evaluates complete synthetic engineering candidate CV with 9-dimension audit and actionable recommendations', async () => {
      const syntheticEngineeringCv: ResumeData = {
        personal: {
          fullName: 'Aarav Sharma',
          email: 'aarav.sharma@example.com',
          phone: '+44 7700 900123',
          location: 'Manchester, UK',
          headline: 'Senior Cloud Solutions Architect',
        },
        summary: 'Experienced cloud architect specializing in distributed systems, high-availability architectures, and automated infrastructure.',
        experience: [
          {
            id: 'exp-1',
            company: 'CloudScale Technologies Ltd',
            title: 'Principal Cloud Architect',
            location: 'Manchester, UK',
            startDate: 'Jan 2022',
            endDate: 'Present',
            current: true,
            bullets: [
              'Architected multi-region Kubernetes clusters on AWS achieving 99.999% uptime for 2.4 million active users.',
              'Reduced annual cloud infrastructure expenditure by £420,000 through automated Spot instance orchestration.',
              'Mentored 12 platform engineers in Infrastructure as Code (Terraform) and GitOps deployment standards.',
            ],
          },
          {
            id: 'exp-2',
            company: 'Finlio Systems Ltd',
            title: 'Senior DevOps Engineer',
            location: 'Leeds, UK',
            startDate: 'Jun 2019',
            endDate: 'Dec 2021',
            current: false,
            bullets: [
              'Engineered high-throughput payment REST APIs in Java and Spring Boot processing over 150,000 daily transactions.',
              'Optimised PostgreSQL schema indexing and connection pooling, cutting p99 API query latency by 35%.',
            ],
          },
        ],
        projects: [
          {
            id: 'proj-1',
            name: 'LedgerSync Observability Mesh',
            tech: ['Go', 'Kubernetes', 'Prometheus'],
            bullets: ['Processed over 60 million telemetry spans daily with sub-millisecond overhead.'],
          },
        ],
        education: [
          {
            id: 'edu-1',
            institution: 'University of Leeds',
            degree: 'BSc (Hons)',
            field: 'Computer Science',
            startDate: '2015',
            endDate: '2019',
          },
        ],
        skills: {
          technical: ['AWS', 'Kubernetes', 'Terraform', 'Docker', 'Java', 'Spring Boot', 'PostgreSQL'],
          soft: ['Technical Leadership', 'Collaboration', 'Mentorship'],
        },
        certifications: [
          { id: 'cert-1', name: 'AWS Certified Solutions Architect — Professional', issuer: 'AWS', year: '2023' },
        ],
        languages: [{ id: 'lang-1', name: 'English', proficiency: 'Native' }],
        achievements: ['Keynote speaker at Cloud Native London 2023.'],
        customSections: [],
        sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
        hiddenSections: [],
      };

      const res = await request(app)
        .post('/api/public/audit')
        .send({ resume: syntheticEngineeringCv });

      expect(res.status).toBe(200);
      expect(res.body.audit).toBeDefined();
      expect(res.body.audit.overallScore).toBeGreaterThanOrEqual(90);
      expect(res.body.audit.rating).toBe('exceptional');
      expect(res.body.audit.dimensions.quantification.score).toBeGreaterThanOrEqual(80);
      expect(res.body.audit.dimensions.parsing.score).toBe(100);
      expect(res.body.audit.stats.quantifiedPercentage).toBeGreaterThan(50);
      expect(res.body.ats.recommendations).toBeDefined();
    });

    it('rejects invalid resume with 400', async () => {
      const res = await request(app)
        .post('/api/public/audit')
        .send({ resume: null });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------
  // 4. POST /api/public/match
  // -------------------------------------------------------------
  describe('4. POST /api/public/match (Job Description Matcher)', () => {
    it('computes JD match when job description is supplied', async () => {
      const jd = `
        Senior TypeScript Engineer
        Requirements:
        - 4+ years of TypeScript and Node.js development experience
        - Experience with AWS and microservices architecture
        - Experience writing automated unit tests
      `;

      const res = await request(app)
        .post('/api/public/match')
        .send({ resume: SAMPLE_RESUME, jobText: jd });

      expect(res.status).toBe(200);
      expect(res.body.job).toBeDefined();
      expect(res.body.match).toBeDefined();
      expect(res.body.match.score).toBeGreaterThan(50);
      expect(res.body.match.matchedSkills).toContain('TypeScript');
      expect(res.body.match.matchedSkills).toContain('Node.js');
    });

    it('returns null match when job description is empty', async () => {
      const res = await request(app)
        .post('/api/public/match')
        .send({ resume: SAMPLE_RESUME, jobText: '' });

      expect(res.status).toBe(200);
      expect(res.body.job).toBeNull();
      expect(res.body.match).toBeNull();
      expect(res.body.message).toContain('No job description');
    });
  });

  // -------------------------------------------------------------
  // 5. POST /api/public/pdf (PDF Generation for all 6 templates)
  // -------------------------------------------------------------
  describe('5. POST /api/public/pdf (Download Across 6 Templates)', () => {
    const templates = ['classic', 'modern', 'minimal', 'professional', 'technical', 'executive'];

    for (const template of templates) {
      it(`renders and streams a valid PDF for template "${template}"`, async () => {
        const res = await request(app)
          .post('/api/public/pdf')
          .send({ resume: SAMPLE_RESUME, template })
          .responseType('blob');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toContain('attachment');
        expect(res.headers['content-disposition']).toContain('.pdf');

        // Verify PDF magic header bytes %PDF-
        const buffer = Buffer.from(res.body);
        expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      });
    }

    it('rejects unsupported template with 400 INVALID_TEMPLATE', async () => {
      const res = await request(app)
        .post('/api/public/pdf')
        .send({ resume: SAMPLE_RESUME, template: 'unsupported_fancy_template' });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_TEMPLATE');
    });

    // DEF-02 Regression Tests: Margin Density Controls
    it('DEF-02: accepts compact, normal, and spacious marginDensity settings', async () => {
      for (const marginDensity of ['compact', 'normal', 'spacious']) {
        const res = await request(app)
          .post('/api/public/pdf')
          .send({ resume: SAMPLE_RESUME, template: 'modern', marginDensity })
          .responseType('blob');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        const buf = Buffer.from(res.body);
        expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      }
    });

    it('DEF-02: rejects invalid marginDensity with 400 INVALID_MARGIN_DENSITY', async () => {
      const res = await request(app)
        .post('/api/public/pdf')
        .send({ resume: SAMPLE_RESUME, marginDensity: 'ultra_condensed' });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_MARGIN_DENSITY');
      expect(res.body.error?.message).toContain('Supported margin densities');
    });

    // Page Size Regression Tests: A4 and US Letter Support
    it('accepts A4 and LETTER page sizes and outputs correct PDF headers and dimensions', async () => {
      // Test A4
      const resA4 = await request(app)
        .post('/api/public/pdf')
        .send({ resume: SAMPLE_RESUME, template: 'classic', pageSize: 'A4' })
        .responseType('blob');

      expect(resA4.status).toBe(200);
      expect(resA4.headers['content-type']).toBe('application/pdf');
      const bufA4 = Buffer.from(resA4.body);
      expect(bufA4.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const a4Str = bufA4.toString('latin1');
      const a4Match = a4Str.match(/\/MediaBox\s*\[\s*([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s*\]/);
      expect(a4Match).toBeTruthy();
      expect(Number(a4Match![3])).toBeCloseTo(595.28, 1);
      expect(Number(a4Match![4])).toBeCloseTo(841.89, 1);

      // Test LETTER
      const resLetter = await request(app)
        .post('/api/public/pdf')
        .send({ resume: SAMPLE_RESUME, template: 'classic', pageSize: 'LETTER' })
        .responseType('blob');

      expect(resLetter.status).toBe(200);
      expect(resLetter.headers['content-type']).toBe('application/pdf');
      const bufLetter = Buffer.from(resLetter.body);
      expect(bufLetter.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const letterStr = bufLetter.toString('latin1');
      const letterMatch = letterStr.match(/\/MediaBox\s*\[\s*([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s*\]/);
      expect(letterMatch).toBeTruthy();
      expect(Number(letterMatch![3])).toBeCloseTo(612, 1);
      expect(Number(letterMatch![4])).toBeCloseTo(792, 1);
    });

    it('defaults to A4 when pageSize is omitted', async () => {
      const res = await request(app)
        .post('/api/public/pdf')
        .send({ resume: SAMPLE_RESUME })
        .responseType('blob');

      expect(res.status).toBe(200);
      const buf = Buffer.from(res.body);
      const str = buf.toString('latin1');
      const match = str.match(/\/MediaBox\s*\[\s*([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s*\]/);
      expect(match).toBeTruthy();
      expect(Number(match![3])).toBeCloseTo(595.28, 1);
      expect(Number(match![4])).toBeCloseTo(841.89, 1);
    });

    it('normalizes lowercase or whitespace pageSize values safely', async () => {
      const res = await request(app)
        .post('/api/public/pdf')
        .send({ resume: SAMPLE_RESUME, pageSize: '  letter  ' })
        .responseType('blob');

      expect(res.status).toBe(200);
      const buf = Buffer.from(res.body);
      const str = buf.toString('latin1');
      const match = str.match(/\/MediaBox\s*\[\s*([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s*\]/);
      expect(match).toBeTruthy();
      expect(Number(match![3])).toBeCloseTo(612, 1);
      expect(Number(match![4])).toBeCloseTo(792, 1);
    });

    it('rejects invalid pageSize with 400 VALIDATION_ERROR', async () => {
      const invalidValues = ['legal', 'tabloid', 'a3', 123, true, ''];
      for (const invalid of invalidValues) {
        const res = await request(app)
          .post('/api/public/pdf')
          .send({ resume: SAMPLE_RESUME, pageSize: invalid });

        expect(res.status).toBe(400);
        expect(res.body.error?.code).toBe('VALIDATION_ERROR');
        expect(res.body.error?.message).toContain('Invalid pageSize. Supported values are A4 and LETTER.');
      }
    });

    // DEF-03 Regression Tests: Unicode & Currency Sanitization
    it('DEF-03: sanitizes rupee symbol (₹ -> Rs.) and smart quotes without corrupting text', async () => {
      const unicodeResume: ResumeData = {
        ...SAMPLE_RESUME,
        personal: {
          ...SAMPLE_RESUME.personal,
          fullName: 'Dr. Élodie Müller-François',
        },
        summary: 'Earned “Top Performer” award with ₹25,00,000 cost savings — 100% verified ✓.',
      };

      const res = await request(app)
        .post('/api/public/pdf')
        .send({ resume: unicodeResume, template: 'classic' })
        .responseType('blob');

      expect(res.status).toBe(200);
      const buf = Buffer.from(res.body);
      const parsed = await pdfParse(buf);

      // Verify that accented Latin characters render cleanly
      expect(parsed.text).toContain('Dr. Élodie Müller-François');
      // Verify rupee symbol was intentionally transformed to standard readable 'Rs. '
      expect(parsed.text).toContain('Rs. 25,00,000');
      expect(parsed.text).not.toContain('₹');
      // Verify smart quotes transformed to straight quotes
      expect(parsed.text).toContain('"Top Performer"');
    });
  });

  // -------------------------------------------------------------
  // 6. POST /api/public/improve (NVIDIA Nemotron Rebuild & Truth Guard)
  // -------------------------------------------------------------
  describe('6. POST /api/public/improve (AI Resume Rebuilder)', () => {
    it('returns 503 AI_NOT_CONFIGURED when AI credentials are not configured', async () => {
      // Default state: no API key
      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: SAMPLE_RESUME });

      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe('AI_NOT_CONFIGURED');
    });

    it('rebuilds resume using NVIDIA Nemotron, recomputes ATS, and passes Truth Guard', async () => {
      const mockProvider: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockResolvedValue({
          summary: 'Accomplished Senior Full Stack Engineer with 5 years experience driving cloud architecture and payment systems using TypeScript and Node.js.',
          bullets: [
            {
              itemId: 'exp_1',
              index: 0,
              text: 'Architected high-throughput payment processing APIs handling 25000 transactions daily using Node.js and TypeScript, ensuring 99.9% uptime.',
            },
          ],
          skillsOrder: ['TypeScript', 'Node.js', 'React', 'AWS', 'PostgreSQL', 'Docker', 'Express'],
        }),
      };
      __setAiProviderForTests(mockProvider);

      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: SAMPLE_RESUME, jobText: 'Senior TypeScript Engineer' });

      expect(res.status).toBe(200);
      expect(res.body.resume).toBeDefined();
      expect(res.body.agent.usedAi).toBe(true);
      expect(res.body.agent.provider).toBe('nvidia');
      expect(res.body.agent.model).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
      expect(res.body.atsAfter).toBeDefined();
      expect(res.body.truth).toBeDefined();
      expect(Array.isArray(res.body.changeLog)).toBe(true);
    });

    it('Truth Guard rejects AI-fabricated claims (hallucinated metrics or ungrounded skills)', async () => {
      const mockProvider: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockResolvedValue({
          summary: 'Increased company revenue by 850% using Kubernetes and Blockchain technologies.',
          bullets: [
            {
              itemId: 'exp_1',
              index: 0,
              text: 'Invented proprietary quantum algorithms increasing profitability by 950% with Kubernetes.',
            },
          ],
        }),
      };
      __setAiProviderForTests(mockProvider);

      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: SAMPLE_RESUME });

      expect(res.status).toBe(200);
      // The fabricated bullet claiming 950% and Kubernetes must be rejected by Truth Guard
      const exp1Bullet0 = res.body.resume.experience[0].bullets[0];
      expect(exp1Bullet0).not.toContain('950%');
      expect(exp1Bullet0).not.toContain('Kubernetes');
      // The original truth-safe bullet is preserved
      expect(exp1Bullet0).toContain('25000');
    });

    it('handles AI provider timeout with 504 AI_TIMEOUT', async () => {
      const mockProvider: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_TIMEOUT', 'Timeout occurred', true)),
      };
      __setAiProviderForTests(mockProvider);

      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: SAMPLE_RESUME });

      expect(res.status).toBe(504);
      expect(res.body.error?.code).toBe('AI_TIMEOUT');
    });

    it('handles AI provider malformed response with 502 AI_MALFORMED', async () => {
      const mockProvider: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_MALFORMED', 'Malformed JSON', true)),
      };
      __setAiProviderForTests(mockProvider);

      const res = await request(app)
        .post('/api/public/improve')
        .send({ resume: SAMPLE_RESUME });

      expect(res.status).toBe(502);
      expect(res.body.error?.code).toBe('AI_MALFORMED');
    });
  });

  // -------------------------------------------------------------
  // 7. POST /api/public/create (New Resume from Details)
  // -------------------------------------------------------------
  describe('7. POST /api/public/create (New Resume Builder)', () => {
    const rawDetails = {
      personal: {
        fullName: 'David Miller',
        email: 'david.miller@example.com',
        phone: '+1 555 123 4567',
        location: 'New York, NY',
        headline: 'Frontend Engineer',
      },
      summary: 'Frontend developer with experience in React and JavaScript.',
      experience: [
        {
          company: 'Acme Apps Inc',
          title: 'Frontend Developer',
          startDate: '2021',
          endDate: 'Present',
          current: true,
          description: 'Built e-commerce UI components in React and Redux. Reduced page load times by 25%.',
        },
      ],
      education: [
        {
          institution: 'NYU',
          degree: 'BS Computer Science',
          startDate: '2017',
          endDate: '2021',
        },
      ],
      skills: ['React', 'JavaScript', 'HTML', 'CSS', 'Redux', 'Git'],
      targetRole: 'Senior React Developer',
    };

    it('returns 503 AI_NOT_CONFIGURED when AI is disabled', async () => {
      const res = await request(app)
        .post('/api/public/create')
        .send({ details: rawDetails });

      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe('AI_NOT_CONFIGURED');
    });

    it('rejects missing personal details with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/public/create')
        .send({ details: { personal: { fullName: '' } } });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('creates complete professional resume using NVIDIA Nemotron', async () => {
      const mockProvider: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockResolvedValue({
          summary: 'Driven Frontend Developer with expertise in building responsive e-commerce web applications with React and Redux.',
          headline: 'Senior React Developer',
          experience: [
            {
              itemId: 'exp_1',
              bullets: [
                'Engineered high-performance e-commerce user interface components in React and Redux, reducing page load times by 25%.',
              ],
            },
          ],
          skillsOrder: ['React', 'Redux', 'JavaScript', 'Git', 'HTML', 'CSS'],
        }),
      };
      __setAiProviderForTests(mockProvider);

      const res = await request(app)
        .post('/api/public/create')
        .send({ details: rawDetails });

      expect(res.status).toBe(200);
      expect(res.body.resume).toBeDefined();
      expect(res.body.resume.personal.fullName).toBe('David Miller');
      expect(res.body.resume.experience.length).toBe(1);
      expect(res.body.ats).toBeDefined();
      expect(res.body.ats.overallScore).toBeGreaterThan(0);
      expect(res.body.agent.usedAi).toBe(true);
      expect(res.body.agent.model).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
    });

    it('Truth Guard rejects ungrounded qualifications or fabricated numbers in creation', async () => {
      const mockProvider: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockResolvedValue({
          summary: 'Led 40 engineers and increased revenue by 800% using Rust and Kubernetes.',
          headline: 'Principal Rust Architect',
          experience: [
            {
              itemId: 'exp_1',
              bullets: [
                'Fabricated claim: Increased company valuation by 900% using unmentioned technology Kubernetes.',
              ],
            },
          ],
        }),
      };
      __setAiProviderForTests(mockProvider);

      const res = await request(app)
        .post('/api/public/create')
        .send({ details: rawDetails });

      expect(res.status).toBe(200);
      const bullet = res.body.resume.experience[0].bullets[0];
      // The fabricated bullet with 900% must NOT be accepted into final resume
      expect(bullet).not.toContain('900%');
      expect(bullet).not.toContain('Kubernetes');
    });
  });

  // -------------------------------------------------------------
  // 8. Rate Limiting and Concurrency Limits
  // -------------------------------------------------------------
  describe('8. Concurrency & Rate Limiting Controls', () => {
    it('enforces concurrency limit when active requests exceed maximum allowed', async () => {
      let resolveFirstCall: (value: unknown) => void;
      const firstCallPromise = new Promise((resolve) => {
        resolveFirstCall = resolve;
      });

      const mockProvider: AiProvider = {
        name: 'nvidia',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        completeJson: vi.fn().mockImplementation(() => firstCallPromise),
      };
      __setAiProviderForTests(mockProvider);

      let firstResponse: request.Response | undefined;
      const reqPromise = new Promise<void>((done) => {
        request(app)
          .post('/api/public/improve')
          .send({ resume: SAMPLE_RESUME })
          .end((_err, res) => {
            firstResponse = res;
            done();
          });
      });

      // Small delay to ensure first request enters the handler and provider
      await new Promise((r) => setTimeout(r, 60));

      const secondRes = await request(app)
        .post('/api/public/improve')
        .send({ resume: SAMPLE_RESUME });

      expect(secondRes.status).toBe(429);
      expect(secondRes.body.error?.code).toBe('CONCURRENCY_LIMIT');

      // Resolve first request cleanly
      resolveFirstCall!({
        summary: 'Updated summary for completion',
        bullets: [],
      });
      await reqPromise;
      expect(firstResponse?.status).toBe(200);
    });
  });
});
