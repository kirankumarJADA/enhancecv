import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  hasStoredDraft,
  isStorageAvailable,
  validateDraft,
  validateDraftResume,
  DRAFT_STORAGE_KEY,
  CURRENT_DRAFT_VERSION,
  __resetDraftStorageForTests,
  type BuilderDraft,
} from '../src/lib/draftStorage';

describe('Curevo AI — Browser Draft Storage Manager', () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    __resetDraftStorageForTests();

    const mockLocalStorage = {
      getItem: vi.fn((key: string) => mockStore[key] || null),
      setItem: vi.fn((key: string, val: string) => {
        mockStore[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStore[key];
      }),
      clear: vi.fn(() => {
        mockStore = {};
      }),
      length: 0,
      key: vi.fn(),
    };

    globalThis.localStorage = mockLocalStorage as unknown as Storage;
    globalThis.window = { localStorage: mockLocalStorage } as unknown as Window & typeof globalThis;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. checks storage availability accurately', () => {
    expect(isStorageAvailable()).toBe(true);

    // When setItem throws (private mode)
    (globalThis.localStorage.setItem as any).mockImplementationOnce(() => {
      throw new Error('Access denied');
    });
    expect(isStorageAvailable()).toBe(false);
  });

  it('2. saves and restores a valid builder draft cleanly', () => {
    const draftPayload: Omit<BuilderDraft, 'version' | 'savedAt' | 'seq'> = {
      mode: 'improve',
      step: 'ready',
      activeTab: 'preview',
      selectedTemplate: 'classic',
      selectedMarginDensity: 'normal',
      selectedPageSize: 'A4',
      activeJobText: 'Looking for a Senior TypeScript Engineer with React experience.',
      activeTargetRole: 'Senior TypeScript Engineer',
      isSampleCv: false,
      resume: {
        personal: {
          fullName: 'Devon Miller',
          email: 'devon@example.com',
          phone: '+1 555-0199',
          location: 'San Francisco, CA',
        },
        summary: 'Experienced software engineer.',
        experience: [
          {
            id: 'exp_1',
            company: 'TechCorp',
            title: 'Lead Frontend Developer',
            startDate: '2021',
            endDate: 'Present',
            current: true,
            bullets: ['Led React application rewrite improving page speed by 40%.'],
          },
        ],
        education: [],
        skills: { technical: ['TypeScript', 'React', 'Node.js'], soft: ['Communication'] },
        projects: [],
        certifications: [],
        languages: [],
        achievements: [],
        customSections: [],
        sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
        hiddenSections: [],
      },
      ats: {
        score: 92,
        breakdown: { keywordMatch: 90, formatScore: 95, experienceRelevance: 90 },
      } as any,
      truth: { passedAll: true, checks: [], autoFixed: [] } as any,
      changeLog: [],
      match: null,
      coverLetter: {
        greeting: 'Dear Hiring Team,',
        paragraphs: ['I am excited to apply for the Senior TypeScript Engineer position.'],
        closing: 'Sincerely, Devon Miller',
      },
      coverRole: 'Senior TypeScript Engineer',
      coverCompany: 'TechCorp',
      coverJdText: '',
      coverTone: 'professional',
    };

    const now = Date.now();
    const saveRes = saveDraft(draftPayload, now);
    expect(saveRes.success).toBe(true);
    expect(hasStoredDraft()).toBe(true);

    const loaded = loadDraft();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(CURRENT_DRAFT_VERSION);
    expect(loaded?.resume?.personal.fullName).toBe('Devon Miller');
    expect(loaded?.activeTargetRole).toBe('Senior TypeScript Engineer');
    expect(loaded?.coverLetter?.paragraphs[0]).toContain('Senior TypeScript Engineer');
    expect(loaded?.savedAt).toBe(now);
  });

  it('3. rejects and purges corrupted JSON safely without throwing', () => {
    mockStore[DRAFT_STORAGE_KEY] = '{invalid json syntax';

    const loaded = loadDraft();
    expect(loaded).toBeNull();
    expect(mockStore[DRAFT_STORAGE_KEY]).toBeUndefined(); // Cleared
  });

  it('4. rejects incompatible schema versions and clears outdated draft', () => {
    mockStore[DRAFT_STORAGE_KEY] = JSON.stringify({
      version: 999, // Unknown future/outdated version
      savedAt: Date.now(),
      resume: { personal: { fullName: 'Old User' } },
    });

    const loaded = loadDraft();
    expect(loaded).toBeNull();
    expect(mockStore[DRAFT_STORAGE_KEY]).toBeUndefined();
  });

  it('5. handles QuotaExceededError gracefully without crashing', () => {
    (globalThis.localStorage.setItem as any).mockImplementationOnce(() => {
      const err = new Error('Quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    });

    const res = saveDraft({
      mode: 'ats',
      step: 'idle',
      activeTab: 'preview',
      selectedTemplate: 'classic',
      selectedMarginDensity: 'normal',
      selectedPageSize: 'A4',
      activeJobText: '',
      activeTargetRole: '',
      resume: null,
      ats: null,
      truth: null,
      changeLog: [],
      match: null,
      coverLetter: null,
      coverRole: '',
      coverCompany: '',
      coverJdText: '',
      coverTone: 'professional',
    });

    expect(res.success).toBe(false);
    expect(res.reason).toBe('quota_exceeded');
  });

  it('6. prevents stale asynchronous saves from overwriting newer drafts', () => {
    const t1 = 1000;
    const t2 = 2000;

    const baseDraft = {
      mode: 'improve' as const,
      step: 'ready' as const,
      activeTab: 'preview' as const,
      selectedTemplate: 'classic',
      selectedMarginDensity: 'normal' as const,
      selectedPageSize: 'A4' as const,
      activeJobText: '',
      activeTargetRole: '',
      resume: null,
      ats: null,
      truth: null,
      changeLog: [],
      match: null,
      coverLetter: null,
      coverRole: '',
      coverCompany: '',
      coverJdText: '',
      coverTone: 'professional' as const,
    };

    // Save newer state first at t2
    const res2 = saveDraft({ ...baseDraft, activeTargetRole: 'New Role' }, t2);
    expect(res2.success).toBe(true);

    // Out-of-order save arrives later with timestamp t1 < t2
    const res1 = saveDraft({ ...baseDraft, activeTargetRole: 'Old Stale Role' }, t1);
    expect(res1.success).toBe(false);
    expect(res1.reason).toBe('stale');

    // The newer draft must remain intact
    const loaded = loadDraft();
    expect(loaded?.activeTargetRole).toBe('New Role');
  });

  it('7. clears draft and resets state correctly', () => {
    mockStore[DRAFT_STORAGE_KEY] = JSON.stringify({
      version: CURRENT_DRAFT_VERSION,
      savedAt: Date.now(),
      mode: 'improve',
      step: 'idle',
      activeTab: 'preview',
      selectedTemplate: 'classic',
      selectedMarginDensity: 'normal',
      selectedPageSize: 'A4',
      activeJobText: '',
      activeTargetRole: '',
      resume: null,
      ats: null,
      truth: null,
      changeLog: [],
      match: null,
      coverLetter: null,
      coverRole: '',
      coverCompany: '',
      coverJdText: '',
      coverTone: 'professional',
    });

    expect(hasStoredDraft()).toBe(true);
    const cleared = clearDraft();
    expect(cleared).toBe(true);
    expect(hasStoredDraft()).toBe(false);
    expect(loadDraft()).toBeNull();
  });

  it('8. validates and sanitizes resume structure strictly', () => {
    const invalidResume = validateDraftResume({ invalid: 'object' });
    expect(invalidResume).toBeNull();

    const sanitized = validateDraftResume({
      personal: {
        fullName: 'A'.repeat(500), // Exceeds 150 chars limit
        email: 'test@example.com',
      },
      summary: 'A'.repeat(10_000), // Exceeds 5000 chars limit
      experience: [
        {
          company: 'Acme',
          title: 'Dev',
          startDate: '2020',
          endDate: '2022',
          current: false,
          bullets: ['Built app'],
        },
      ],
    });

    expect(sanitized).not.toBeNull();
    expect(sanitized?.personal.fullName.length).toBe(150);
    expect(sanitized?.summary.length).toBe(5000);
    expect(sanitized?.experience[0].company).toBe('Acme');
  });
});
