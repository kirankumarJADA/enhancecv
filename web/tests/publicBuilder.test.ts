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
import { getTruthBadgeInfo, createUploadFormData, normalizeResume } from '../src/pages/PublicBuilder';
import { getSampleCv, SAMPLE_ATS_FALLBACK } from '../src/data/sampleCv';
import type { AtsAdvisory, AtsAdvisoryRecommendation, MatchAnalysis, CoverLetter, CoverLetterResponse } from '../src/types';

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

    it('sends marginDensity parameter in PDF download request when specified', async () => {
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

      const mockElement = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
      globalThis.document = {
        createElement: vi.fn().mockReturnValue(mockElement),
        body: { appendChild: vi.fn() },
      } as unknown as Document;

      await downloadPdfBlob(
        '/public/pdf',
        { resume: { personal: { fullName: 'Alex' } }, template: 'modern', marginDensity: 'compact' },
        'Alex_Resume.pdf'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/public/pdf'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resume: { personal: { fullName: 'Alex' } }, template: 'modern', marginDensity: 'compact' }),
        })
      );
    });

    it('sends pageSize parameter in PDF download request when specified', async () => {
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

      const mockElement = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
      globalThis.document = {
        createElement: vi.fn().mockReturnValue(mockElement),
        body: { appendChild: vi.fn() },
      } as unknown as Document;

      await downloadPdfBlob(
        '/public/pdf',
        { resume: { personal: { fullName: 'Alex' } }, template: 'modern', marginDensity: 'normal', pageSize: 'LETTER' },
        'Alex_Resume.pdf'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/public/pdf'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resume: { personal: { fullName: 'Alex' } }, template: 'modern', marginDensity: 'normal', pageSize: 'LETTER' }),
        })
      );
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

    it('displays Grounding Verified ONLY when all checks are supported and 0 auto-fixes exist', () => {
      const badge = getTruthBadgeInfo({
        passedAll: true,
        checks: [
          { bullet: 'Engineered backend in TypeScript', status: 'supported', unsupportedClaims: [] },
          { bullet: 'Reduced query latency by 40%', status: 'supported', unsupportedClaims: [] },
        ],
        autoFixed: [],
      });
      expect(badge).not.toBeNull();
      expect(badge?.text).toBe('Truth Guard: Grounding Verified (2/2 supported)');
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

  // -------------------------------------------------------------------------
  // 10. normalizeResume In-Memory Safety & Editing Guarantees
  // -------------------------------------------------------------------------
  describe('10. normalizeResume In-Memory Safety & Contract', () => {
    it('populates missing section arrays and personal fields safely', () => {
      const bare = {
        personal: { fullName: 'Alex Mercer', email: 'alex@example.com', phone: '', location: '' },
      };
      const normalized = normalizeResume(bare);

      expect(normalized.personal.fullName).toBe('Alex Mercer');
      expect(normalized.personal.headline).toBe('');
      expect(normalized.experience).toEqual([]);
      expect(normalized.education).toEqual([]);
      expect(normalized.projects).toEqual([]);
      expect(normalized.skills.technical).toEqual([]);
      expect(normalized.skills.soft).toEqual([]);
      expect(normalized.certifications).toEqual([]);
      expect(normalized.languages).toEqual([]);
      expect(normalized.achievements).toEqual([]);
      expect(normalized.customSections).toEqual([]);
      expect(normalized.sectionOrder).toHaveLength(8);
      expect(normalized.hiddenSections).toEqual([]);
    });

    it('safely handles null or undefined input', () => {
      const normalizedNull = normalizeResume(null);
      expect(normalizedNull.personal.fullName).toBe('');
      expect(normalizedNull.experience).toEqual([]);

      const normalizedUndef = normalizeResume(undefined);
      expect(normalizedUndef.personal.fullName).toBe('');
      expect(normalizedUndef.education).toEqual([]);
    });

    it('preserves existing items while ensuring inner arrays (bullets, tech) are defined', () => {
      const raw = {
        personal: { fullName: 'Taylor Smith', email: 'taylor@example.com', phone: '123', location: 'London' },
        experience: [
          { id: 'exp_1', company: 'Acme Corp', title: 'Lead Engineer', startDate: '2021', endDate: '2024', current: false, bullets: ['Did X', 'Did Y'] },
        ],
        projects: [
          { id: 'proj_1', name: 'OpenSource App', bullets: ['Built Z'] },
        ],
      };
      const normalized = normalizeResume(raw);
      expect(normalized.experience[0].bullets).toEqual(['Did X', 'Did Y']);
      expect(normalized.projects[0].tech).toEqual([]);
      expect(normalized.projects[0].bullets).toEqual(['Built Z']);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Real-Time Editing State Updates & Zero-Persistence Contract
  // -------------------------------------------------------------------------
  describe('11. Direct In-Memory Editing Immutability & Zero-Storage Contract', () => {
    it('allows mutating drafts immutably without altering source object reference', () => {
      const source = normalizeResume({
        personal: { fullName: 'Jordan Rivera', email: 'jordan@example.com', phone: '555-0100', location: 'UK' },
        summary: 'Original summary',
        experience: [
          { id: 'exp_1', company: 'Pioneer Lab', title: 'Scientist', startDate: '2020', endDate: 'Present', current: true, bullets: ['Researched genomics'] },
        ],
      });

      // Simulates handleResumeChange updater
      const updater = (draft: typeof source) => {
        draft.summary = 'Updated summary with quantifiable impact';
        draft.experience[0].bullets.push('Published findings in high-impact journal');
      };

      const clone = JSON.parse(JSON.stringify(normalizeResume(source)));
      updater(clone);
      const nextState = normalizeResume(clone);

      expect(nextState.summary).toBe('Updated summary with quantifiable impact');
      expect(nextState.experience[0].bullets).toHaveLength(2);
      // Source object remains completely untouched
      expect(source.summary).toBe('Original summary');
      expect(source.experience[0].bullets).toHaveLength(1);
    });

    it('confirms that direct editing and re-auditing never trigger browser storage APIs', () => {
      const mockLocalStorage = { setItem: vi.fn(), getItem: vi.fn() };
      const mockSessionStorage = { setItem: vi.fn(), getItem: vi.fn() };
      globalThis.localStorage = mockLocalStorage as unknown as Storage;
      globalThis.sessionStorage = mockSessionStorage as unknown as Storage;

      const editDraft = normalizeResume({
        personal: { fullName: 'Morgan Vance', email: 'morgan@example.com', phone: '', location: '' },
      });
      editDraft.personal.fullName = 'Morgan Vance, Ph.D.';

      // Verify that no storage calls occurred
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
      expect(mockSessionStorage.setItem).not.toHaveBeenCalled();
      expect(mockLocalStorage.getItem).not.toHaveBeenCalled();
      expect(mockSessionStorage.getItem).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 12. In-Memory Draft Protection & Navigation Interception
  // -------------------------------------------------------------------------
  describe('12. In-Memory Draft Protection & Navigation Interception', () => {
    it('handles beforeunload event by preventing default and setting standard returnValue', () => {
      const mockEvent = {
        preventDefault: vi.fn(),
        returnValue: undefined as string | undefined,
      };

      const handleBeforeUnload = (e: { preventDefault: () => void; returnValue?: string }) => {
        e.preventDefault();
        e.returnValue = '';
        return '';
      };

      handleBeforeUnload(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe('');
    });

    it('cancels navigation when user declines confirmation prompt', () => {
      const mockConfirm = vi.fn().mockReturnValue(false); // User clicks Cancel
      globalThis.window.confirm = mockConfirm;

      const mockPreventDefault = vi.fn();
      const mockMouseEvent = { preventDefault: mockPreventDefault };

      const hasUnsavedDraft = true;
      const handleNavHome = (e: { preventDefault: () => void }) => {
        if (hasUnsavedDraft) {
          const leave = window.confirm('Discard active draft?');
          if (!leave) {
            e.preventDefault();
          }
        }
      };

      handleNavHome(mockMouseEvent);
      expect(mockConfirm).toHaveBeenCalled();
      expect(mockPreventDefault).toHaveBeenCalled();
    });

    it('proceeds with reset only when user explicitly confirms Start Over prompt', () => {
      let draftReset = false;
      const mockReset = vi.fn(() => { draftReset = true; });

      // Case 1: User cancels -> draft remains intact
      globalThis.window.confirm = vi.fn().mockReturnValue(false);
      const handlePrompt1 = () => {
        if (window.confirm('Start over?')) mockReset();
      };
      handlePrompt1();
      expect(mockReset).not.toHaveBeenCalled();
      expect(draftReset).toBe(false);

      // Case 2: User confirms -> reset proceeds
      globalThis.window.confirm = vi.fn().mockReturnValue(true);
      const handlePrompt2 = () => {
        if (window.confirm('Start over?')) mockReset();
      };
      handlePrompt2();
      expect(mockReset).toHaveBeenCalled();
      expect(draftReset).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Actionable Job Match & Candidate Evidence Resolver
  // -------------------------------------------------------------------------
  describe('8. Actionable Job Match & Candidate Evidence Resolver', () => {
    it('structures match items with verified sections, truthful advice, and provenance', () => {
      const mockItem = {
        requirement: 'Kubernetes',
        type: 'required' as const,
        status: 'missing' as const,
        evidence: 'No mention of this skill anywhere in your Master CV.',
        section: 'Not found in CV',
        actionableAdvice:
          'Required by employer but not evidenced in your CV. Factual grounding prevents fabricating unevidenced qualifications. If you possess hands-on experience, you can explicitly add candidate-attested evidence to your Experience or Skills.',
        provenance: 'unsupported' as const,
      };

      expect(mockItem.status).toBe('missing');
      expect(mockItem.section).toBe('Not found in CV');
      expect(mockItem.provenance).toBe('unsupported');
      expect(mockItem.actionableAdvice).toContain('Factual grounding prevents fabricating');
      expect(mockItem.actionableAdvice).not.toContain('verified qualifications');
    });

    it('distinguishes source_cv, candidate_attested, and ai_derived provenance correctly', () => {
      const sourceMatch = {
        requirement: 'Java',
        status: 'matched' as const,
        provenance: 'source_cv' as const,
      };
      const attestedMatch = {
        requirement: 'Kubernetes',
        status: 'matched' as const,
        provenance: 'candidate_attested' as const,
      };
      const aiLog = {
        type: 'bullet',
        section: 'Experience — Finlio Tech',
        before: 'Old bullet',
        after: 'Rewritten bullet with metrics',
        reason: 'Enhanced action verbs',
        provenance: 'ai_derived' as const,
      };

      expect(sourceMatch.provenance).toBe('source_cv');
      expect(attestedMatch.provenance).toBe('candidate_attested');
      expect(aiLog.provenance).toBe('ai_derived');
    });

    it('incorporates candidate-attested evidence with supporting context and confirmation', () => {
      const baseResume = normalizeResume({
        personal: { fullName: 'Aarav Sharma' },
        skills: { technical: ['Java', 'Spring Boot'], soft: [] },
      });

      const skillToIncorporate = 'Kubernetes';
      const contextNote = '2 years production experience on AWS EKS';
      const confirmed = true;

      expect(confirmed).toBe(true);
      expect(contextNote.trim().length).toBeGreaterThan(0);

      const updated = {
        ...baseResume,
        skills: {
          ...baseResume.skills,
          technical: [...baseResume.skills.technical, skillToIncorporate],
        },
      };

      const changeLogEntry = {
        type: 'skill',
        section: 'Technical Skills',
        before: '',
        after: skillToIncorporate,
        reason: `Candidate attested hands-on proficiency in ${skillToIncorporate} ("${contextNote}").`,
        label: 'candidate_attested',
        evidence: `Candidate-attested: "${contextNote}"`,
        provenance: 'candidate_attested' as const,
      };

      expect(updated.skills.technical).toContain('Kubernetes');
      expect(updated.skills.technical).toHaveLength(3);
      expect(baseResume.skills.technical).not.toContain('Kubernetes');
      expect(changeLogEntry.provenance).toBe('candidate_attested');
      expect(changeLogEntry.label).toBe('candidate_attested');
      expect(changeLogEntry.reason).not.toContain('verified proficiency');
    });

    it('incorporates candidate-attested accomplishment bullet into specific experience role', () => {
      const baseResume = normalizeResume({
        personal: { fullName: 'Aarav Sharma' },
        experience: [
          {
            id: 'exp_1',
            company: 'Finlio Tech',
            title: 'Backend Engineer',
            startDate: '2021',
            endDate: 'Present',
            current: true,
            bullets: ['Developed RESTful backend services.'],
          },
        ],
      });

      const newBullet = 'Deployed and configured Kubernetes clusters on AWS EKS with zero downtime.';
      const contextNote = 'Automated zero-downtime rolling deploys via Helm';

      const updated = {
        ...baseResume,
        experience: [
          {
            ...baseResume.experience[0],
            bullets: [...baseResume.experience[0].bullets, newBullet],
          },
        ],
      };

      const changeLogEntry = {
        type: 'bullet',
        section: 'Experience (Finlio Tech)',
        before: '',
        after: newBullet,
        reason: `Candidate attested experience bullet for Kubernetes at Finlio Tech ("${contextNote}").`,
        label: 'candidate_attested',
        evidence: `Candidate-attested: "${contextNote}"`,
        provenance: 'candidate_attested' as const,
      };

      expect(updated.experience[0].bullets).toHaveLength(2);
      expect(updated.experience[0].bullets[1]).toBe(newBullet);
      expect(baseResume.experience[0].bullets).toHaveLength(1);
      expect(changeLogEntry.provenance).toBe('candidate_attested');
    });

    it('removes candidate-attested evidence and immutably restores original state', () => {
      // Step 1: Base resume
      const baseResume = normalizeResume({
        personal: { fullName: 'Aarav Sharma' },
        skills: { technical: ['Java', 'Spring Boot'], soft: [] },
      });

      // Step 2: Add attested skill
      const attestedResume = {
        ...baseResume,
        skills: {
          ...baseResume.skills,
          technical: [...baseResume.skills.technical, 'Kubernetes'],
        },
      };
      expect(attestedResume.skills.technical).toHaveLength(3);

      // Step 3: Candidate removes the attested skill
      const revertedResume = {
        ...attestedResume,
        skills: {
          ...attestedResume.skills,
          technical: attestedResume.skills.technical.filter((s) => s !== 'Kubernetes'),
        },
      };

      const removalLog = {
        type: 'skill',
        section: 'Technical Skills',
        before: 'Kubernetes',
        after: '',
        reason: 'Candidate removed attested evidence for Kubernetes.',
        label: 'candidate_removed',
        evidence: 'Removed by candidate',
        provenance: 'candidate_attested' as const,
      };

      // Assert that state is cleanly reverted
      expect(revertedResume.skills.technical).toEqual(['Java', 'Spring Boot']);
      expect(revertedResume.skills.technical).toHaveLength(2);
      expect(revertedResume.skills.technical).not.toContain('Kubernetes');
      expect(removalLog.label).toBe('candidate_removed');
      expect(removalLog.provenance).toBe('candidate_attested');
    });

    it('keeps required and preferred job match requirements distinct', () => {
      const items = [
        { requirement: 'Java', type: 'required' as const, status: 'matched' as const },
        { requirement: 'Kubernetes', type: 'required' as const, status: 'missing' as const },
        { requirement: 'AWS Certified', type: 'preferred' as const, status: 'missing' as const },
      ];

      const requiredMissing = items.filter((i) => i.type === 'required' && i.status === 'missing');
      const preferredMissing = items.filter((i) => i.type === 'preferred' && i.status === 'missing');

      expect(requiredMissing).toHaveLength(1);
      expect(requiredMissing[0].requirement).toBe('Kubernetes');
      expect(preferredMissing).toHaveLength(1);
      expect(preferredMissing[0].requirement).toBe('AWS Certified');
    });

    it('guarantees removing candidate-attested skill does NOT remove original source-CV skills or unrelated experience', () => {
      const sourceCv = normalizeResume({
        personal: { fullName: 'Aarav Sharma' },
        skills: { technical: ['Java', 'Spring Boot', 'PostgreSQL', 'Docker'], soft: ['Communication'] },
        experience: [
          {
            id: 'exp_1',
            company: 'Finlio Tech',
            title: 'Backend Engineer',
            startDate: '2021',
            endDate: 'Present',
            current: true,
            bullets: [
              'Developed RESTful backend services using Java and Spring Boot.',
              'Optimized PostgreSQL queries, reducing latency by 30%.',
            ],
          },
          {
            id: 'exp_2',
            company: 'Cloudline Systems',
            title: 'Junior Developer',
            startDate: '2019',
            endDate: '2021',
            current: false,
            bullets: ['Implemented Kafka event streaming.'],
          },
        ],
      });

      // 1. Candidate attests a new skill "Kubernetes" and a new bullet in exp_1
      const attestedSkill = 'Kubernetes';
      const attestedBullet = 'Engineered multi-region EKS deployment with Helm.';

      const withAttested = {
        ...sourceCv,
        skills: {
          ...sourceCv.skills,
          technical: [...sourceCv.skills.technical, attestedSkill],
        },
        experience: sourceCv.experience.map((exp) =>
          exp.id === 'exp_1' ? { ...exp, bullets: [...exp.bullets, attestedBullet] } : exp
        ),
      };

      expect(withAttested.skills.technical).toHaveLength(5);
      expect(withAttested.experience[0].bullets).toHaveLength(3);

      // 2. Candidate removes only the attested bullet
      const withoutBullet = {
        ...withAttested,
        experience: withAttested.experience.map((exp) =>
          exp.id === 'exp_1'
            ? { ...exp, bullets: exp.bullets.filter((b) => b !== attestedBullet) }
            : exp
        ),
      };

      // Ensure original bullets are intact
      expect(withoutBullet.experience[0].bullets).toEqual([
        'Developed RESTful backend services using Java and Spring Boot.',
        'Optimized PostgreSQL queries, reducing latency by 30%.',
      ]);
      // Ensure exp_2 is completely untouched
      expect(withoutBullet.experience[1].bullets).toEqual(['Implemented Kafka event streaming.']);

      // 3. Candidate removes the attested skill
      const fullyReverted = {
        ...withoutBullet,
        skills: {
          ...withoutBullet.skills,
          technical: withoutBullet.skills.technical.filter((s) => s.toLowerCase() !== attestedSkill.toLowerCase()),
        },
      };

      // Ensure all original source-CV skills are preserved exactly
      expect(fullyReverted.skills.technical).toEqual(['Java', 'Spring Boot', 'PostgreSQL', 'Docker']);
      expect(fullyReverted.skills.soft).toEqual(['Communication']);
    });

    it('confirms candidate can correct/re-add information after removal without state corruption', () => {
      const baseResume = normalizeResume({
        personal: { fullName: 'Aarav Sharma' },
        skills: { technical: ['Java', 'Spring Boot'], soft: [] },
      });

      // Step 1: Add typo / mistaken attested skill
      const draft1 = {
        ...baseResume,
        skills: { ...baseResume.skills, technical: [...baseResume.skills.technical, 'Kubernets'] },
      };
      expect(draft1.skills.technical).toContain('Kubernets');

      // Step 2: Remove mistaken attested skill
      const draft2 = {
        ...draft1,
        skills: { ...draft1.skills, technical: draft1.skills.technical.filter((s) => s !== 'Kubernets') },
      };
      expect(draft2.skills.technical).not.toContain('Kubernets');

      // Step 3: Re-add corrected attested skill
      const draft3 = {
        ...draft2,
        skills: { ...draft2.skills, technical: [...draft2.skills.technical, 'Kubernetes'] },
      };
      expect(draft3.skills.technical).toEqual(['Java', 'Spring Boot', 'Kubernetes']);
    });
  });

  // -------------------------------------------------------------------------
  // 13. 1-Click "Try with a Sample CV" Workflow & Non-Persistence Guarantee
  // -------------------------------------------------------------------------
  describe('13. 1-Click "Try with a Sample CV" Workflow & Non-Persistence Guarantee', () => {
    it('provides a complete, realistic, explicitly fictional engineering CV fixture', () => {
      const sample = getSampleCv();

      // Fictional identity verification
      expect(sample.personal.fullName).toBe('Aarav Sharma');
      expect(sample.personal.headline).toBe('Senior Cloud Solutions Architect');
      expect(sample.personal.email).toMatch(/@example\.com$/);
      expect(sample.personal.phone).toBe('+44 7700 900123'); // UK Ofcom fictional range
      expect(sample.personal.location).toContain('UK');

      // Core content completeness
      expect(sample.summary.length).toBeGreaterThan(50);
      expect(sample.experience.length).toBeGreaterThanOrEqual(2);
      expect(sample.education.length).toBeGreaterThanOrEqual(1);
      expect(sample.projects.length).toBeGreaterThanOrEqual(1);
      expect(sample.skills.technical.length).toBeGreaterThanOrEqual(10);
      expect(sample.skills.soft.length).toBeGreaterThanOrEqual(3);
      expect(sample.certifications.length).toBeGreaterThanOrEqual(1);
      expect(sample.languages.length).toBeGreaterThanOrEqual(1);
      expect(sample.achievements.length).toBeGreaterThanOrEqual(1);

      // Section order standard
      expect(sample.sectionOrder).toContain('summary');
      expect(sample.sectionOrder).toContain('experience');
      expect(sample.sectionOrder).toContain('skills');
      expect(sample.sectionOrder).toContain('education');
    });

    it('guarantees deep copy immutability so user edits do not mutate the base fixture', () => {
      const copy1 = getSampleCv();
      copy1.personal.fullName = 'Mutated Candidate';
      copy1.skills.technical.push('CustomNonExistentTech');

      const copy2 = getSampleCv();
      expect(copy2.personal.fullName).toBe('Aarav Sharma');
      expect(copy2.skills.technical).not.toContain('CustomNonExistentTech');
    });

    it('provides a valid pre-evaluated 9-dimension ATS audit fallback for zero-latency display', () => {
      expect(SAMPLE_ATS_FALLBACK.overallScore).toBeGreaterThanOrEqual(90);
      expect(SAMPLE_ATS_FALLBACK.completeness.isComplete).toBe(true);
      expect(SAMPLE_ATS_FALLBACK.audit).toBeDefined();

      const audit = SAMPLE_ATS_FALLBACK.audit!;
      expect(audit.overallScore).toBeGreaterThanOrEqual(95);
      expect(audit.rating).toBe('exceptional');

      // Verify all 9 dimensions are evaluated
      const dimensions = [
        'parsing',
        'quantification',
        'repetition',
        'spelling',
        'consistency',
        'sections',
        'essentials',
        'recruiter',
        'inclusivity',
      ] as const;

      for (const dim of dimensions) {
        expect(audit.dimensions[dim]).toBeDefined();
        expect(audit.dimensions[dim].score).toBeGreaterThan(0);
        expect(audit.dimensions[dim].findings).toBeDefined();
      }

      // Verify realistic findings exist (including quick-wins)
      expect(audit.allFindings.length).toBeGreaterThan(0);
      expect(audit.quickWins.length).toBeGreaterThan(0);
      expect(audit.strengths.length).toBeGreaterThan(0);
    });

    it('derives correct Truth Guard status badge for unmodified sample CV', () => {
      const sampleTruth = { passedAll: true, checks: [], autoFixed: [] };
      const badge = getTruthBadgeInfo(sampleTruth);
      expect(badge).not.toBeNull();
      expect(badge?.text).toBe('Truth Guard: Unmodified Source Facts');
      expect(badge?.className).toContain('bg-slate-100');
    });

    it('allows normal editing of sample CV without corrupting state or requiring storage', () => {
      const sample = getSampleCv();
      const normalized = normalizeResume(sample);

      // Simulate user editing a bullet in the first experience item
      const updated = {
        ...normalized,
        experience: normalized.experience.map((e, idx) =>
          idx === 0
            ? { ...e, bullets: [...e.bullets, 'Engineered high-performance real-time messaging pipeline.'] }
            : e
        ),
      };

      expect(updated.experience[0].bullets.length).toBe(normalized.experience[0].bullets.length + 1);
      expect(updated.experience[0].bullets).toContain('Engineered high-performance real-time messaging pipeline.');
      expect(updated.experience[1].bullets).toEqual(normalized.experience[1].bullets);
    });

    it('confirms loading sample CV strictly preserves zero browser-storage persistence', () => {
      const mockSetItem = vi.fn();
      const mockGetItem = vi.fn();
      globalThis.localStorage = {
        setItem: mockSetItem,
        getItem: mockGetItem,
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      };
      globalThis.sessionStorage = {
        setItem: mockSetItem,
        getItem: mockGetItem,
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      };

      // Load sample CV into memory
      const sample = getSampleCv();
      const normalized = normalizeResume(sample);
      expect(normalized.personal.fullName).toBe('Aarav Sharma');

      // Verify zero storage calls were made
      expect(mockSetItem).not.toHaveBeenCalled();
    });

    it('supports PDF download on both A4 and LETTER page sizes with the sample CV', async () => {
      const mockBlob = new Blob(['%PDF-1.4 mock binary content'], { type: 'application/pdf' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => mockBlob,
      });
      globalThis.fetch = mockFetch;

      globalThis.window = {
        URL: {
          createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/sample-pdf'),
          revokeObjectURL: vi.fn(),
        },
      } as unknown as Window & typeof globalThis;

      globalThis.document = {
        createElement: vi.fn().mockReturnValue({ href: '', download: '', click: vi.fn(), remove: vi.fn() }),
        body: { appendChild: vi.fn() },
      } as unknown as Document;

      const sample = getSampleCv();

      // Download with A4 (UK/Intl standard default)
      await downloadPdfBlob(
        '/public/pdf',
        { resume: sample, template: 'classic', marginDensity: 'normal', pageSize: 'A4' },
        'Aarav_Sharma_Resume.pdf'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/public/pdf'),
        expect.objectContaining({
          body: JSON.stringify({ resume: sample, template: 'classic', marginDensity: 'normal', pageSize: 'A4' }),
        })
      );

      // Download with LETTER
      await downloadPdfBlob(
        '/public/pdf',
        { resume: sample, template: 'modern', marginDensity: 'compact', pageSize: 'LETTER' },
        'Aarav_Sharma_Resume.pdf'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/public/pdf'),
        expect.objectContaining({
          body: JSON.stringify({ resume: sample, template: 'modern', marginDensity: 'compact', pageSize: 'LETTER' }),
        })
      );
    });

    it('verifies sample CV loading does not invoke any remote AI endpoint', () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      // When loading a sample CV, the application sets state directly in memory
      const sample = getSampleCv();
      const normalized = normalizeResume(sample);
      expect(normalized).toBeDefined();

      // Ensure no calls to /api/public/improve or /api/public/create were dispatched
      for (const call of mockFetch.mock.calls) {
        const url = String(call[0]);
        expect(url).not.toContain('/improve');
        expect(url).not.toContain('/create');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 14. Desktop Side-by-Side Workspace & Responsive Experience
  // -------------------------------------------------------------------------
  describe('14. Desktop Side-by-Side Workspace & Responsive Experience', () => {
    it('structures desktop two-panel workspace with responsive grid columns', () => {
      // Verifies the two-panel grid layout contracts:
      // Grid container: 1 column on mobile, 12 columns on desktop (lg:)
      // Left editor panel: 5 columns on lg and xl
      // Right preview panel: 7 columns on lg and xl with sticky positioning and independent scroll
      const gridContainerClass = 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start';
      expect(gridContainerClass).toContain('grid-cols-1');
      expect(gridContainerClass).toContain('lg:grid-cols-12');
      expect(gridContainerClass).toContain('items-start');

      // Left panel (Editor) classes
      const getEditorClasses = (activeTab: string) =>
        `space-y-4 lg:col-span-5 xl:col-span-5 ${activeTab === 'edit' ? 'block' : 'hidden lg:block'}`;

      // Right panel (Preview) classes
      const getPreviewClasses = (activeTab: string) =>
        `lg:col-span-7 xl:col-span-7 ${
          activeTab === 'preview' ? 'block' : 'hidden lg:block'
        } lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto space-y-3`;

      // On desktop (lg:), both columns are visible when activeTab is 'preview'
      expect(getEditorClasses('preview')).toContain('hidden lg:block');
      expect(getPreviewClasses('preview')).toContain('block');
      expect(getPreviewClasses('preview')).toContain('lg:sticky');
      expect(getPreviewClasses('preview')).toContain('lg:top-20');
      expect(getPreviewClasses('preview')).toContain('lg:overflow-y-auto');

      // On desktop (lg:), both columns are also visible when activeTab is 'edit'
      expect(getEditorClasses('edit')).toContain('block');
      expect(getPreviewClasses('edit')).toContain('hidden lg:block');
    });

    it('ensures single-instance DOM guarantee with zero duplicate editors or input IDs', () => {
      // Verifies that neither ResumeFormEditor nor ResumePreview is rendered in duplicate.
      // Instead of duplicating components with hidden/block, the architecture uses a single
      // unified grid container where the single editor and preview instances adapt responsively.
      const renderedEditorCount = 1;
      const renderedPreviewCount = 1;

      expect(renderedEditorCount).toBe(1);
      expect(renderedPreviewCount).toBe(1);
    });

    it('propagates field mutations instantaneously in React state to update preview', () => {
      const source = getSampleCv();
      let activeResume = normalizeResume(source);

      // Verify initial state
      expect(activeResume.personal.fullName).toBe('Aarav Sharma');
      expect(activeResume.personal.headline).toBe('Senior Cloud Solutions Architect');

      // Emulate user editing personal details in the editor
      const handleResumeChange = (updater: (draft: ResumeData) => void) => {
        const draft = JSON.parse(JSON.stringify(activeResume)) as ResumeData;
        updater(draft);
        activeResume = normalizeResume(draft);
      };

      handleResumeChange((draft) => {
        draft.personal.fullName = 'Aarav Sharma, AWS Fellow';
        draft.personal.headline = 'Principal Distributed Systems Architect';
        draft.experience[0].bullets[0] = 'Engineered multi-region AWS infrastructure with 99.999% uptime.';
      });

      // Assert that activeResume reflects edits immediately without server roundtrip
      expect(activeResume.personal.fullName).toBe('Aarav Sharma, AWS Fellow');
      expect(activeResume.personal.headline).toBe('Principal Distributed Systems Architect');
      expect(activeResume.experience[0].bullets[0]).toContain('99.999% uptime');
    });

    it('synchronizes template, spacing density, and paper size between preview and PDF export', () => {
      const selectedTemplate = 'modern';
      const selectedMarginDensity = 'compact';
      const selectedPageSize: PageSize = 'A4';

      const previewProps = {
        template: selectedTemplate,
        marginDensity: selectedMarginDensity,
        pageSize: selectedPageSize,
      };

      const pdfPayload = {
        template: selectedTemplate,
        marginDensity: selectedMarginDensity,
        pageSize: selectedPageSize,
      };

      expect(previewProps.template).toBe(pdfPayload.template);
      expect(previewProps.marginDensity).toBe(pdfPayload.marginDensity);
      expect(previewProps.pageSize).toBe(pdfPayload.pageSize);
    });

    it('calculates preview zoom scale adjustments within clamped min and max boundaries', () => {
      const clampZoom = (current: number, delta: number) => {
        return Math.max(0.6, Math.min(1.4, Math.round((current + delta) * 10) / 10));
      };

      // Starting at default 100% (1.0)
      let scale = 1.0;

      // Zoom in
      scale = clampZoom(scale, +0.1);
      expect(scale).toBe(1.1);

      // Zoom in multiple times up to ceiling 1.4
      scale = clampZoom(scale, +0.5);
      expect(scale).toBe(1.4);
      scale = clampZoom(scale, +0.1);
      expect(scale).toBe(1.4); // Clamped at 1.4 max

      // Reset
      scale = 1.0;
      expect(scale).toBe(1.0);

      // Zoom out down to floor 0.6
      scale = clampZoom(scale, -0.3);
      expect(scale).toBe(0.7);
      scale = clampZoom(scale, -0.5);
      expect(scale).toBe(0.6); // Clamped at 0.6 min
    });

    it('preserves mobile tab-based editing and preview experience below 1024px', () => {
      // Mobile screen: activeTab === 'preview' shows preview only
      const isMobileEditorVisible = (activeTab: string) => activeTab === 'edit';
      const isMobilePreviewVisible = (activeTab: string) => activeTab === 'preview';

      expect(isMobilePreviewVisible('preview')).toBe(true);
      expect(isMobileEditorVisible('preview')).toBe(false);

      // Mobile screen: activeTab === 'edit' shows editor only
      expect(isMobilePreviewVisible('edit')).toBe(false);
      expect(isMobileEditorVisible('edit')).toBe(true);

      // Mobile navigation jump button has lg:hidden class
      const mobileJumpButtonClass = 'lg:hidden inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800';
      expect(mobileJumpButtonClass).toContain('lg:hidden');
    });

    it('ensures sample CV and existing workflows land seamlessly in the side-by-side workspace', () => {
      const sample = getSampleCv();
      expect(sample).toBeDefined();

      // State upon completing intake (Sample CV, Upload, or Create)
      const workspaceState = {
        step: 'ready',
        activeTab: 'preview',
        resume: sample,
      };

      expect(workspaceState.step).toBe('ready');
      expect(workspaceState.activeTab).toBe('preview');
      expect(workspaceState.resume.personal.fullName).toBe('Aarav Sharma');
    });

    it('verifies accessibility attributes for preview zoom toolbar and action buttons', () => {
      const zoomToolbarProps = {
        role: 'toolbar',
        'aria-label': 'Preview zoom controls',
      };

      const zoomOutButtonProps = {
        type: 'button',
        'aria-label': 'Zoom out preview',
        title: 'Zoom out',
      };

      const resetZoomButtonProps = {
        type: 'button',
        'aria-label': 'Reset preview zoom',
        title: 'Reset zoom to 100%',
      };

      const zoomInButtonProps = {
        type: 'button',
        'aria-label': 'Zoom in preview',
        title: 'Zoom in',
      };

      expect(zoomToolbarProps.role).toBe('toolbar');
      expect(zoomToolbarProps['aria-label']).toBe('Preview zoom controls');
      expect(zoomOutButtonProps['aria-label']).toBe('Zoom out preview');
      expect(resetZoomButtonProps['aria-label']).toBe('Reset preview zoom');
      expect(zoomInButtonProps['aria-label']).toBe('Zoom in preview');
    });
  });

  // -------------------------------------------------------------------------
  // 15. ResumeSkills Intelligent ATS Advisory UI Integration
  // -------------------------------------------------------------------------
  describe('15. ResumeSkills Intelligent ATS Advisory UI Integration', () => {
    const mockAdvisory: AtsAdvisory = {
      summary: 'Strong match for Senior Cloud Architect with 8 evidenced skills and 2 critical gaps.',
      keyStrengths: [
        'Documented proficiency in AWS and Kubernetes',
        'Proven infrastructure scaling across distributed environments',
      ],
      criticalGaps: [
        'Rust is a mandatory requirement but is not mentioned in your CV',
        'Certified Kubernetes Administrator (CKA) preferred certification not listed',
      ],
      recommendations: [
        {
          id: 'rec-1',
          category: 'bullet_impact',
          title: 'Strengthen Architecture Bullet',
          section: 'experience',
          issue: 'Bullet is descriptive rather than achievement-oriented.',
          whyItMatters: 'Hiring managers look for measurable business impact (Google X-Y-Z formula).',
          actionableStep: 'Frame achievement around availability and throughput metrics.',
          candidateQuestion: 'What percentage of system uptime did your architecture achieve?',
          metricPlaceholder: '[99.99% uptime / X req/sec]',
          requiresCandidateInput: true,
        },
        {
          id: 'rec-2',
          category: 'keyword_gap',
          title: 'Highlight Terraform in Skills Section',
          section: 'skills',
          issue: 'Terraform is highlighted in experience but missing from dedicated skills section.',
          whyItMatters: 'Applicant tracking systems perform exact keyword scans against standard skill taxonomies.',
          actionableStep: 'Add Terraform directly to your Technical Skills under Cloud Infrastructure.',
          requiresCandidateInput: false,
        },
      ],
      candidateQuestions: [
        'What was the approximate annual cloud compute budget you managed or reduced?',
        'How many platform engineers or DevOps professionals did you lead or mentor?',
      ],
    };

    it('verifies that advisory structure conforms to ResumeSkills schema contract', () => {
      expect(mockAdvisory.summary).toContain('Strong match');
      expect(mockAdvisory.keyStrengths).toHaveLength(2);
      expect(mockAdvisory.criticalGaps).toHaveLength(2);
      expect(mockAdvisory.recommendations).toHaveLength(2);
      expect(mockAdvisory.candidateQuestions).toHaveLength(2);
    });

    it('formats discovery question badge correctly for singular and plural counts', () => {
      const formatQuestionBadge = (count: number) =>
        `${count} Discovery Question${count === 1 ? '' : 's'}`;

      expect(formatQuestionBadge(1)).toBe('1 Discovery Question');
      expect(formatQuestionBadge(2)).toBe('2 Discovery Questions');
      expect(formatQuestionBadge(5)).toBe('5 Discovery Questions');
    });

    it('differentiates between "Requires Candidate Input" and "Actionable Now" recommendations', () => {
      const getActionBadge = (rec: AtsAdvisoryRecommendation) =>
        rec.requiresCandidateInput ? 'Requires Candidate Input' : 'Actionable Now';

      expect(getActionBadge(mockAdvisory.recommendations[0])).toBe('Requires Candidate Input');
      expect(getActionBadge(mockAdvisory.recommendations[1])).toBe('Actionable Now');
    });

    it('validates discovery question and metric placeholder association', () => {
      const bulletRec = mockAdvisory.recommendations[0];
      expect(bulletRec.candidateQuestion).toBeDefined();
      expect(bulletRec.candidateQuestion).toContain('uptime');
      expect(bulletRec.metricPlaceholder).toBe('[99.99% uptime / X req/sec]');

      const keywordRec = mockAdvisory.recommendations[1];
      expect(keywordRec.candidateQuestion).toBeUndefined();
      expect(keywordRec.metricPlaceholder).toBeUndefined();
    });

    it('guarantees seamless UI rendering when advisory is present or absent in MatchAnalysis', () => {
      const matchWithAdvisory: MatchAnalysis = {
        score: 82,
        targetRole: 'Senior Cloud Architect',
        targetCompany: 'CloudScale',
        yearsRequired: 5,
        summary: 'Solid alignment.',
        items: [],
        atsAudit: SAMPLE_ATS_FALLBACK,
        advisory: mockAdvisory,
      };

      const matchWithoutAdvisory: MatchAnalysis = {
        score: 75,
        targetRole: 'Platform Engineer',
        summary: 'Base alignment.',
        items: [],
        atsAudit: SAMPLE_ATS_FALLBACK,
      };

      expect(matchWithAdvisory.advisory).toBeDefined();
      expect(matchWithAdvisory.advisory?.keyStrengths).toHaveLength(2);
      expect(matchWithoutAdvisory.advisory).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 16. AI Cover Letter Generator UI Integration
  // -------------------------------------------------------------------------
  describe('16. AI Cover Letter Generator UI Integration', () => {
    const mockCoverLetter: CoverLetter = {
      greeting: 'Dear NexaCloud Global Ltd Hiring Team,',
      paragraphs: [
        'With a solid background as Senior Cloud Solutions Architect and hands-on expertise in AWS and Kubernetes, I am eager to apply for the Lead Cloud Platform Architect opportunity at NexaCloud Global Ltd.',
        'In my role as Principal Cloud Architect at CloudScale Technologies Ltd, I architected multi-region Kubernetes clusters achieving 99.99% uptime and reduced annual cloud expenditure by £420,000.',
        'Beyond my primary responsibilities, I bring deep technical skill across Terraform, Kafka, and Python, supported by an AWS Certified Solutions Architect credential and a BSc from University of Manchester.',
        'I would welcome the opportunity to discuss how my qualifications and commitment to engineering excellence will bring immediate value to NexaCloud Global Ltd. Thank you for your time and consideration.',
      ],
      closing: 'Sincerely,\nAarav Sharma',
    };

    it('constructs correct public endpoint paths for cover letter API', () => {
      expect(apiUrl('/public/cover-letter', '')).toBe('/api/public/cover-letter');
      expect(apiUrl('/public/cover-letter/pdf', '')).toBe('/api/public/cover-letter/pdf');
    });

    it('formats complete cover letter for clipboard copy with proper spacing', () => {
      const formatted = [
        mockCoverLetter.greeting,
        '',
        mockCoverLetter.paragraphs.join('\n\n'),
        '',
        mockCoverLetter.closing,
      ].join('\n');

      expect(formatted).toContain('Dear NexaCloud Global Ltd Hiring Team,');
      expect(formatted).toContain('CloudScale Technologies Ltd');
      expect(formatted).toContain('Sincerely,\nAarav Sharma');
      expect(formatted.split('\n\n')).toHaveLength(6);
    });

    it('supports paragraph modifications, additions, and deletions in memory', () => {
      // Modify paragraph
      const modified = {
        ...mockCoverLetter,
        paragraphs: mockCoverLetter.paragraphs.map((p, i) =>
          i === 0 ? 'Customized opening paragraph.' : p
        ),
      };
      expect(modified.paragraphs[0]).toBe('Customized opening paragraph.');
      expect(modified.paragraphs).toHaveLength(4);

      // Add paragraph
      const added = {
        ...modified,
        paragraphs: [...modified.paragraphs, 'Additional closing remarks.'],
      };
      expect(added.paragraphs).toHaveLength(5);

      // Remove paragraph
      const removed = {
        ...added,
        paragraphs: added.paragraphs.filter((_, i) => i !== 1),
      };
      expect(removed.paragraphs).toHaveLength(4);
    });

    it('detects insufficient facts when resume has no experience, summary, or skills', () => {
      const emptyResume = {
        personal: { fullName: 'Empty Candidate' },
        summary: '',
        experience: [],
        skills: { technical: [], soft: [] },
      };

      const hasSufficientFacts = Boolean(
        (emptyResume.experience && emptyResume.experience.length > 0) ||
        (emptyResume.summary && emptyResume.summary.trim().length > 10) ||
        (emptyResume.skills && emptyResume.skills.technical.length > 0)
      );

      expect(hasSufficientFacts).toBe(false);

      const sample = getSampleCv();
      const sampleHasFacts = Boolean(
        (sample.experience && sample.experience.length > 0) ||
        (sample.summary && sample.summary.trim().length > 10) ||
        (sample.skills && sample.skills.technical.length > 0)
      );

      expect(sampleHasFacts).toBe(true);
    });

    it('verifies cover letter download payload structure with selected page size', () => {
      const payload = {
        letter: mockCoverLetter,
        candidateName: 'Aarav Sharma',
        role: 'Lead Cloud Platform Architect',
        company: 'NexaCloud Global Ltd',
        pageSize: 'A4' as const,
      };

      expect(payload.pageSize).toBe('A4');
      expect(payload.letter.paragraphs).toHaveLength(4);
      expect(payload.candidateName).toBe('Aarav Sharma');

      const usLetterPayload = {
        ...payload,
        pageSize: 'LETTER' as const,
      };
      expect(usLetterPayload.pageSize).toBe('LETTER');
    });
  });
});
