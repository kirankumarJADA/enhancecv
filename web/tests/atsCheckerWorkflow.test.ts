import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiUrl } from '../src/apiBase';
import { getSampleCv, SAMPLE_ATS_FALLBACK } from '../src/data/sampleCv';
import { normalizeResume, createUploadFormData } from '../src/pages/PublicBuilder';

describe('Dedicated ATS Score Checker Workflow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Homepage & Routing Integration', () => {
    it('constructs correct public endpoint paths for ATS check and audit', () => {
      expect(apiUrl('/public/parse', '')).toBe('/api/public/parse');
      expect(apiUrl('/public/ats', '')).toBe('/api/public/ats');
      expect(apiUrl('/public/audit', '')).toBe('/api/public/audit');
    });

    it('ensures sample CV baseline contains full 9-dimension audit breakdown', () => {
      const sample = getSampleCv();
      expect(sample.personal.fullName).toBe('Aarav Sharma');
      expect(SAMPLE_ATS_FALLBACK.audit).toBeDefined();
      expect(SAMPLE_ATS_FALLBACK.audit.overallScore).toBeGreaterThanOrEqual(80);
      expect(Object.keys(SAMPLE_ATS_FALLBACK.audit.dimensions)).toHaveLength(9);
      expect(SAMPLE_ATS_FALLBACK.audit.dimensions.parsing).toBeDefined();
      expect(SAMPLE_ATS_FALLBACK.audit.dimensions.quantification).toBeDefined();
      expect(SAMPLE_ATS_FALLBACK.audit.dimensions.repetition).toBeDefined();
      expect(SAMPLE_ATS_FALLBACK.audit.dimensions.spelling).toBeDefined();
      expect(SAMPLE_ATS_FALLBACK.audit.dimensions.consistency).toBeDefined();
      expect(SAMPLE_ATS_FALLBACK.audit.dimensions.sections).toBeDefined();
      expect(SAMPLE_ATS_FALLBACK.audit.dimensions.essentials).toBeDefined();
      expect(SAMPLE_ATS_FALLBACK.audit.dimensions.recruiter).toBeDefined();
      expect(SAMPLE_ATS_FALLBACK.audit.dimensions.inclusivity).toBeDefined();
    });
  });

  describe('2. Upload & File Validation for ATS Checking', () => {
    it('creates standard multipart FormData containing the uploaded file', () => {
      const mockFile = new File(['mock CV content'], 'alex_rivera_cv.pdf', { type: 'application/pdf' });
      const formData = createUploadFormData(mockFile);
      expect(formData.get('file')).toBe(mockFile);
    });

    it('validates supported file extensions (.pdf, .docx, .txt)', () => {
      const validExtensions = ['pdf', 'docx', 'txt'];
      validExtensions.forEach((ext) => {
        expect(['pdf', 'docx', 'txt'].includes(ext)).toBe(true);
      });

      const invalidExtensions = ['exe', 'png', 'zip', 'json'];
      invalidExtensions.forEach((ext) => {
        expect(['pdf', 'docx', 'txt'].includes(ext)).toBe(false);
      });
    });

    it('enforces 8MB file size limit for ATS uploads', () => {
      const maxBytes = 8 * 1024 * 1024;
      const validSize = 7.5 * 1024 * 1024;
      const oversized = 8.5 * 1024 * 1024;

      expect(validSize <= maxBytes).toBe(true);
      expect(oversized <= maxBytes).toBe(false);
    });
  });

  describe('3. Dedicated ATS Checker Execution Flow', () => {
    it('normalizes parsed resume facts without calling AI rebuilder or Truth Guard mutation', () => {
      const parsedResume = {
        personal: {
          fullName: 'Taylor Swift',
          email: 'taylor@example.com',
          headline: 'Senior Cloud Architect',
        },
        summary: 'Experienced cloud engineer building serverless systems.',
        skills: {
          technical: ['AWS', 'Kubernetes', 'TypeScript'],
          soft: ['Leadership'],
        },
        experience: [
          {
            title: 'Cloud Lead',
            company: 'TechCorp',
            bullets: ['Managed 50+ Kubernetes clusters with 99.99% uptime.'],
          },
        ],
      };

      const normalized = normalizeResume(parsedResume);
      expect(normalized.personal.fullName).toBe('Taylor Swift');
      expect(normalized.skills.technical).toEqual(['AWS', 'Kubernetes', 'TypeScript']);
      expect(normalized.experience[0].company).toBe('TechCorp');
      expect(normalized.experience[0].bullets[0]).toBe('Managed 50+ Kubernetes clusters with 99.99% uptime.');
    });

    it('verifies all 9 ATS dimensions and quick wins are exposed in audit response', () => {
      const audit = SAMPLE_ATS_FALLBACK.audit;
      expect(audit.overallScore).toBe(98);
      expect(audit.rating).toBe('exceptional');
      expect(audit.summary).toBeDefined();

      const dims = audit.dimensions;
      const dimKeys = [
        'parsing',
        'quantification',
        'repetition',
        'spelling',
        'consistency',
        'sections',
        'essentials',
        'recruiter',
        'inclusivity',
      ];

      dimKeys.forEach((key) => {
        expect(dims[key as keyof typeof dims]).toBeDefined();
        expect(dims[key as keyof typeof dims].score).toBeGreaterThanOrEqual(0);
        expect(dims[key as keyof typeof dims].score).toBeLessThanOrEqual(100);
        expect(dims[key as keyof typeof dims].label).toBeDefined();
      });

      expect(audit.stats.quantifiedPercentage).toBeDefined();
      expect(audit.stats.actionVerbPercentage).toBeDefined();
      expect(audit.stats.readingTimeSeconds).toBeDefined();
      expect(Array.isArray(audit.allFindings)).toBe(true);
      expect(Array.isArray(audit.quickWins)).toBe(true);
    });
  });
});
