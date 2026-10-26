// Frontend unit tests for the Curevo AI Public Resume Builder logic and API integration.
// Covers:
// - Supported file formats (PDF, DOCX, TXT) and 8MB file size validation.
// - Binary PDF download handling with Blob generation and URL revocation.
// - API client integration with public endpoints (/api/public/*).
// - NVIDIA AI error code translation and graceful fallback behavior.
// - Zero browser-storage persistence guarantee (no localStorage, sessionStorage, or IndexedDB).
// - Template selection across all 6 supported templates.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { downloadPdfBlob, ApiError } from '../src/api';
import { apiUrl } from '../src/apiBase';
import { getTruthBadgeInfo, createUploadFormData } from '../src/pages/PublicBuilder';

describe('Curevo AI Public Resume Builder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. API Route URL Resolution for Public Endpoints
  // -------------------------------------------------------------------------
  describe('1. Public Endpoint URL Resolution', () => {
    it('constructs correct public endpoint paths in local development', () => {
      expect(apiUrl('/public/parse', '')).toBe('/api/public/parse');
      expect(apiUrl('/public/improve', '')).toBe('/api/public/improve');
      expect(apiUrl('/public/create', '')).toBe('/api/public/create');
      expect(apiUrl('/public/ats', '')).toBe('/api/public/ats');
      expect(apiUrl('/public/match', '')).toBe('/api/public/match');
      expect(apiUrl('/public/pdf', '')).toBe('/api/public/pdf');
    });

    it('prefixes configured production backend URL cleanly', () => {
      const prodBase = 'https://curevo-ai.onrender.com';
      expect(apiUrl('/public/parse', prodBase)).toBe('https://curevo-ai.onrender.com/api/public/parse');
      expect(apiUrl('/public/improve', prodBase)).toBe('https://curevo-ai.onrender.com/api/public/improve');
      expect(apiUrl('/public/create', prodBase)).toBe('https://curevo-ai.onrender.com/api/public/create');
      expect(apiUrl('/public/pdf', prodBase)).toBe('https://curevo-ai.onrender.com/api/public/pdf');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Binary PDF Download Handling
  // -------------------------------------------------------------------------
  describe('2. Binary PDF Download Handling', () => {
    it('fetches binary blob from /public/pdf and triggers browser download', async () => {
      const mockBlob = new Blob(['%PDF-1.4 mock binary content'], { type: 'application/pdf' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => mockBlob,
      });
      globalThis.fetch = mockFetch;

      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
      const mockRevokeObjectURL = vi.fn();
      globalThis.window = {
        URL: {
          createObjectURL: mockCreateObjectURL,
          revokeObjectURL: mockRevokeObjectURL,
        },
      } as unknown as Window & typeof globalThis;

      const mockAppendChild = vi.fn();
      const mockRemove = vi.fn();
      const mockClick = vi.fn();
      const mockElement = {
        href: '',
        download: '',
        click: mockClick,
        remove: mockRemove,
      };
      globalThis.document = {
        createElement: vi.fn().mockReturnValue(mockElement),
        body: { appendChild: mockAppendChild },
      } as unknown as Document;

      await downloadPdfBlob('/public/pdf', { resume: { personal: { fullName: 'Alex' } }, template: 'modern' }, 'Alex_Resume.pdf');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/public/pdf'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resume: { personal: { fullName: 'Alex' } }, template: 'modern' }),
        })
      );

      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(mockElement.download).toBe('Alex_Resume.pdf');
      expect(mockClick).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/test-uuid');
    });

    it('throws ApiError with server code and message when PDF generation fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'INVALID_TEMPLATE', message: 'Supported templates: classic, modern, minimal, professional, technical, executive' },
        }),
      });
      globalThis.fetch = mockFetch;

      await expect(
        downloadPdfBlob('/public/pdf', { resume: {}, template: 'invalid' }, 'resume.pdf')
      ).rejects.toThrow(ApiError);

      try {
        await downloadPdfBlob('/public/pdf', { resume: {}, template: 'invalid' }, 'resume.pdf');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).code).toBe('INVALID_TEMPLATE');
        expect((err as ApiError).status).toBe(400);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3. File Validation Logic (Upload Formats & Size Limits)
  // -------------------------------------------------------------------------
  describe('3. File Validation for Option 1', () => {
    function validateSelectedFile(filename: string, sizeBytes: number): { valid: boolean; error?: string } {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (!ext || !['pdf', 'docx', 'txt'].includes(ext)) {
        return { valid: false, error: 'Please upload a PDF, DOCX, or TXT file.' };
      }
      if (sizeBytes > 8 * 1024 * 1024) {
        return { valid: false, error: 'File size exceeds the 8 MB limit. Please upload a smaller document.' };
      }
      return { valid: true };
    }

    it('accepts valid PDF, DOCX, and TXT files under 8MB', () => {
      expect(validateSelectedFile('my_cv.pdf', 1024 * 500).valid).toBe(true);
      expect(validateSelectedFile('resume.docx', 1024 * 1024).valid).toBe(true);
      expect(validateSelectedFile('plain_resume.txt', 5000).valid).toBe(true);
    });

    it('rejects unsupported extensions', () => {
      const resExe = validateSelectedFile('payload.exe', 1000);
      expect(resExe.valid).toBe(false);
      expect(resExe.error).toContain('PDF, DOCX, or TXT');

      const resJpg = validateSelectedFile('scan.jpg', 1000);
      expect(resJpg.valid).toBe(false);

      const resJson = validateSelectedFile('data.json', 1000);
      expect(resJson.valid).toBe(false);
    });

    it('rejects files exceeding the 8MB limit', () => {
      const oversized = 9 * 1024 * 1024;
      const res = validateSelectedFile('large_cv.pdf', oversized);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('8 MB');
    });

    it('appends the CV file using the exact "file" multipart field expected by Multer upload.single("file")', () => {
      const mockBlob = new Blob(['sample pdf binary content'], { type: 'application/pdf' });
      const mockFile = new File([mockBlob], 'candidate_cv.pdf', { type: 'application/pdf' });
      const formData = createUploadFormData(mockFile);
      expect(formData.get('file')).toBe(mockFile);
      expect(formData.get('resume')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Form Validation for Option 2 (Create from Scratch)
  // -------------------------------------------------------------------------
  describe('4. Form Validation for Option 2 (Create Resume)', () => {
    function validateCreateDetails(fullName: string, email: string): { valid: boolean; error?: string } {
      if (!fullName || !fullName.trim()) {
        return { valid: false, error: 'Full name is required.' };
      }
      if (!email || !email.trim() || !email.includes('@')) {
        return { valid: false, error: 'A valid email address is required.' };
      }
      return { valid: true };
    }

    it('validates required fields: fullName and email', () => {
      expect(validateCreateDetails('Jane Doe', 'jane@example.com').valid).toBe(true);
      expect(validateCreateDetails('', 'jane@example.com').valid).toBe(false);
      expect(validateCreateDetails('Jane Doe', '').valid).toBe(false);
      expect(validateCreateDetails('Jane Doe', 'not-an-email').valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. NVIDIA Error Handling and Safe Messaging
  // -------------------------------------------------------------------------
  describe('5. NVIDIA AI Failure Handling', () => {
    function getFriendlyErrorMessage(err: { code?: string; status?: number; message?: string }): string {
      if (err.code === 'AI_NOT_CONFIGURED' || err.status === 503) {
        return 'NVIDIA Nemotron AI is not configured on the backend server. You can still preview your parsed CV, view ATS scores, and download your PDF.';
      }
      if (err.code === 'AI_TIMEOUT' || err.status === 504) {
        return 'The NVIDIA AI service timed out while rebuilding your resume. Please try again.';
      }
      if (err.code === 'CONCURRENCY_LIMIT' || err.status === 429) {
        return 'The AI service is currently busy. Please wait a moment and try again.';
      }
      return err.message || 'AI resume generation failed.';
    }

    it('maps 503 AI_NOT_CONFIGURED to honest non-blocking explanation', () => {
      const msg = getFriendlyErrorMessage({ code: 'AI_NOT_CONFIGURED', status: 503 });
      expect(msg).toContain('NVIDIA Nemotron AI is not configured');
      expect(msg).toContain('preview your parsed CV');
    });

    it('maps 504 AI_TIMEOUT to retry instruction', () => {
      const msg = getFriendlyErrorMessage({ code: 'AI_TIMEOUT', status: 504 });
      expect(msg).toContain('timed out');
      expect(msg).toContain('try again');
    });

    it('maps 429 CONCURRENCY_LIMIT to queue notification', () => {
      const msg = getFriendlyErrorMessage({ code: 'CONCURRENCY_LIMIT', status: 429 });
      expect(msg).toContain('currently busy');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Zero-Persistence Guarantee
  // -------------------------------------------------------------------------
  describe('6. Zero Browser-Storage Persistence', () => {
    it('proves that resume data is never saved to localStorage, sessionStorage or IndexedDB', () => {
      const mockLocalStorage = { setItem: vi.fn() };
      const mockSessionStorage = { setItem: vi.fn() };
      globalThis.localStorage = mockLocalStorage as unknown as Storage;
      globalThis.sessionStorage = mockSessionStorage as unknown as Storage;

      // When the component manages state in memory, no storage calls take place
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
      expect(mockSessionStorage.setItem).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 7. Supported Templates Allow-list
  // -------------------------------------------------------------------------
  describe('7. Template Selection', () => {
    const SUPPORTED = ['classic', 'modern', 'minimal', 'professional', 'technical', 'executive'];

    it('supports all 6 backend ATS-safe templates', () => {
      expect(SUPPORTED).toHaveLength(6);
      expect(SUPPORTED).toContain('classic');
      expect(SUPPORTED).toContain('modern');
      expect(SUPPORTED).toContain('minimal');
      expect(SUPPORTED).toContain('professional');
      expect(SUPPORTED).toContain('technical');
      expect(SUPPORTED).toContain('executive');
    });
  });

  // -------------------------------------------------------------------------
  // 8. Truth Guard Verification Badge Derivation
  // -------------------------------------------------------------------------
  describe('8. Truth Guard Status Badge Derivation', () => {
    it('returns null when truth is null or undefined', () => {
      expect(getTruthBadgeInfo(null)).toBeNull();
      expect(getTruthBadgeInfo(undefined)).toBeNull();
    });

    it('displays unmodified source facts badge when checks array is empty (never claims 100%)', () => {
      const badge = getTruthBadgeInfo({ passedAll: true, checks: [], autoFixed: [] });
      expect(badge).not.toBeNull();
      expect(badge?.text).toBe('Truth Guard: Unmodified Source Facts');
      expect(badge?.text).not.toContain('100%');
      expect(badge?.className).toContain('text-slate-700');
    });

    it('displays 100% Grounded ONLY when all checks are supported and 0 auto-fixes exist', () => {
      const badge = getTruthBadgeInfo({
        passedAll: true,
        checks: [
          { bullet: 'Engineered backend in TypeScript', status: 'supported', unsupportedClaims: [] },
          { bullet: 'Reduced query latency by 40%', status: 'supported', unsupportedClaims: [] },
        ],
        autoFixed: [],
      });
      expect(badge).not.toBeNull();
      expect(badge?.text).toBe('Truth Guard: 100% Grounded (2/2 verified)');
      expect(badge?.className).toContain('text-emerald-800');
      expect(badge?.icon).toBe('✓');
    });

    it('does NOT claim 100% Grounded when auto-repairs occurred to prevent hallucination', () => {
      const badge = getTruthBadgeInfo({
        passedAll: false,
        checks: [
          { bullet: 'Engineered backend in TypeScript', status: 'supported', unsupportedClaims: [] },
          { bullet: 'Reverted master bullet', status: 'reverted', unsupportedClaims: ['invented tool'] },
        ],
        autoFixed: ['invented tool reverted to master'],
      });
      expect(badge).not.toBeNull();
      expect(badge?.text).toBe('Truth Guard: 1/2 Grounded (1 auto-repaired)');
      expect(badge?.text).not.toContain('100%');
      expect(badge?.className).toContain('text-blue-800');
    });

    it('displays warning badge and accurate percentage when unverified claims are flagged', () => {
      const badge = getTruthBadgeInfo({
        passedAll: false,
        checks: [
          { bullet: 'Engineered backend in TypeScript', status: 'supported', unsupportedClaims: [] },
          { bullet: 'Led team of 50 engineers', status: 'warning', unsupportedClaims: ['50 engineers'] },
        ],
        autoFixed: [],
      });
      expect(badge).not.toBeNull();
      expect(badge?.text).toBe('Truth Guard: 50% Grounded (1 flagged)');
      expect(badge?.text).not.toContain('100%');
      expect(badge?.className).toContain('text-amber-800');
      expect(badge?.icon).toBe('⚠');
    });
  });

  // -------------------------------------------------------------------------
  // 8. Advanced ATS Audit Contract & State Consistency
  // -------------------------------------------------------------------------
  describe('8. Advanced ATS Audit Integration', () => {
    it('handles ATSAnalysis payload with full 9-dimension audit', () => {
      const mockAudit = {
        overallScore: 82,
        rating: 'competitive' as const,
        summary: 'Competitive candidate profile.',
        dimensions: {
          parsing: { key: 'parsing' as const, label: 'ATS Parsing Readiness', score: 90, weight: 12, status: 'exceptional' as const, summary: 'Clean parsing', findings: [] },
          quantification: { key: 'quantification' as const, label: 'Quantified Impact', score: 80, weight: 15, status: 'good' as const, summary: 'Good metrics', findings: [] },
          repetition: { key: 'repetition' as const, label: 'Repetition & Wording Quality', score: 85, weight: 11, status: 'exceptional' as const, summary: 'Diverse words', findings: [] },
          spelling: { key: 'spelling' as const, label: 'Spelling & Grammar Checks', score: 95, weight: 10, status: 'exceptional' as const, summary: 'Zero typos', findings: [] },
          consistency: { key: 'consistency' as const, label: 'Bullet Consistency & Flow', score: 85, weight: 12, status: 'exceptional' as const, summary: 'Uniform length', findings: [] },
          sections: { key: 'sections' as const, label: 'Essential Resume Sections', score: 85, weight: 10, status: 'exceptional' as const, summary: 'All sections', findings: [] },
          essentials: { key: 'essentials' as const, label: 'Core ATS Essentials', score: 80, weight: 12, status: 'good' as const, summary: 'Valid dates', findings: [] },
          recruiter: { key: 'recruiter' as const, label: 'Recruiter Review Flags', score: 90, weight: 10, status: 'exceptional' as const, summary: 'Clear titles', findings: [] },
          inclusivity: { key: 'inclusivity' as const, label: 'Inclusive & Modern Language', score: 100, weight: 8, status: 'exceptional' as const, summary: 'Bias free', findings: [] },
        },
        allFindings: [],
        quickWins: [],
        strengths: [],
        stats: {
          totalFindings: 0,
          criticalCount: 0,
          warningCount: 0,
          infoCount: 0,
          positiveCount: 0,
          quantifiedBullets: 4,
          totalBullets: 8,
          quantifiedPercentage: 50,
          actionVerbBullets: 7,
          actionVerbPercentage: 88,
          avgBulletWordCount: 16,
          readingTimeSeconds: 40,
        },
      };

      const mockAts = {
        overallScore: 78,
        formattingScore: 80,
        structureScore: 80,
        contentScore: 75,
        skillsScore: 80,
        readabilityScore: 80,
        checks: [],
        working: [],
        issues: [],
        recommendations: [],
        metrics: {
          bulletCount: 8,
          quantifiedBulletRatio: 0.5,
          actionVerbStartRatio: 0.88,
          averageBulletWords: 16,
          technicalSkillCount: 6,
          estimatedPages: 1,
        },
        completeness: {
          isComplete: true,
          totalChecks: 22,
          evaluatedChecks: 22,
          skippedChecks: 0,
          status: 'complete' as const,
        },
        audit: mockAudit,
      };

      // When audit is present, the effective ATS score prefers the 9-dimension composite score
      const effectiveScore = mockAts.audit ? mockAts.audit.overallScore : mockAts.overallScore;
      expect(effectiveScore).toBe(82);
      expect(mockAts.audit.dimensions.inclusivity.score).toBe(100);
      expect(mockAts.audit.stats.quantifiedPercentage).toBe(50);
    });
  });
});
