import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  hasStoredDraft,
  getDraftStorageKey,
  hasAnonymousDraft,
  getAnonymousDraft,
  discardAnonymousDraft,
  importAnonymousDraftToAccount,
  ANONYMOUS_DRAFT_KEY,
  LEGACY_DRAFT_KEY,
  __resetDraftStorageForTests,
  type BuilderDraft,
} from '../src/lib/draftStorage';

describe('Curevo AI — Multi-User Account Draft Isolation & Import', () => {
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

  const samplePayload: Omit<BuilderDraft, 'version' | 'savedAt' | 'seq'> = {
    mode: 'improve',
    step: 'ready',
    activeTab: 'preview',
    selectedTemplate: 'modern',
    selectedMarginDensity: 'normal',
    selectedPageSize: 'A4',
    activeJobText: 'Lead Full-Stack Architect with TypeScript and PostgreSQL expertise.',
    activeTargetRole: 'Principal Architect',
    isSampleCv: false,
    resume: {
      personal: {
        fullName: 'Jordan Taylor',
        email: 'jordan@example.com',
        phone: '+1 555-0100',
        location: 'London, UK',
      },
      summary: 'Architect with 10 years experience.',
      experience: [
        {
          id: 'exp_01',
          company: 'Acme Corp',
          title: 'Senior Engineer',
          startDate: '2020',
          endDate: 'Present',
          current: true,
          bullets: ['Engineered scalable microservices reducing p99 latency by 35%.'],
        },
      ],
      education: [],
      skills: { technical: ['TypeScript', 'Node.js', 'PostgreSQL'], soft: ['Leadership'] },
      projects: [],
      certifications: [],
      languages: [],
      achievements: [],
      customSections: [],
      sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
      hiddenSections: [],
    },
    ats: null,
    truth: null,
    changeLog: [],
    match: null,
    coverLetter: null,
    coverRole: '',
    coverCompany: '',
    coverJdText: '',
    coverTone: 'professional',
  };

  it('1. computes correct scoped keys for users and anonymous sessions', () => {
    expect(getDraftStorageKey(null)).toBe(ANONYMOUS_DRAFT_KEY);
    expect(getDraftStorageKey(undefined)).toBe(ANONYMOUS_DRAFT_KEY);
    expect(getDraftStorageKey('')).toBe(ANONYMOUS_DRAFT_KEY);
    expect(getDraftStorageKey('   ')).toBe(ANONYMOUS_DRAFT_KEY);
    expect(getDraftStorageKey('usr_alice123')).toBe('curevo_builder_draft_v1_usr_alice123');
    expect(getDraftStorageKey('bob456')).toBe('curevo_builder_draft_v1_usr_bob456');
  });

  it('2. isolates drafts strictly between User A and User B', () => {
    const userA = 'usr_alice_1';
    const userB = 'usr_bob_2';

    // Alice saves her draft
    const aliceDraft = {
      ...samplePayload,
      activeTargetRole: 'Staff Frontend Engineer',
      resume: {
        ...samplePayload.resume!,
        personal: { ...samplePayload.resume!.personal, fullName: 'Alice Smith' },
      },
    };
    saveDraft(aliceDraft, Date.now(), userA);

    // Bob saves his draft
    const bobDraft = {
      ...samplePayload,
      activeTargetRole: 'Senior DevOps Specialist',
      resume: {
        ...samplePayload.resume!,
        personal: { ...samplePayload.resume!.personal, fullName: 'Bob Jones' },
      },
    };
    saveDraft(bobDraft, Date.now() + 10, userB);

    // Verify localStorage has two separate distinct keys
    expect(hasStoredDraft(userA)).toBe(true);
    expect(hasStoredDraft(userB)).toBe(true);
    expect(hasStoredDraft(null)).toBe(false);

    // Verify Alice loads only Alice's data
    const loadedAlice = loadDraft(userA);
    expect(loadedAlice).not.toBeNull();
    expect(loadedAlice?.resume?.personal.fullName).toBe('Alice Smith');
    expect(loadedAlice?.activeTargetRole).toBe('Staff Frontend Engineer');

    // Verify Bob loads only Bob's data
    const loadedBob = loadDraft(userB);
    expect(loadedBob).not.toBeNull();
    expect(loadedBob?.resume?.personal.fullName).toBe('Bob Jones');
    expect(loadedBob?.activeTargetRole).toBe('Senior DevOps Specialist');

    // Clearing Alice's draft does not touch Bob's draft
    clearDraft(userA);
    expect(hasStoredDraft(userA)).toBe(false);
    expect(loadDraft(userA)).toBeNull();
    expect(hasStoredDraft(userB)).toBe(true);
    expect(loadDraft(userB)?.resume?.personal.fullName).toBe('Bob Jones');
  });

  it('3. isolates anonymous drafts from authenticated accounts', () => {
    const userA = 'usr_alice_1';

    // Anonymous visitor creates a draft
    saveDraft(samplePayload, Date.now(), null);

    expect(hasAnonymousDraft()).toBe(true);
    expect(hasStoredDraft(null)).toBe(true);
    expect(hasStoredDraft(userA)).toBe(false);
    expect(loadDraft(userA)).toBeNull();

    // Anonymous visitor can retrieve their draft
    const anon = getAnonymousDraft();
    expect(anon).not.toBeNull();
    expect(anon?.resume?.personal.fullName).toBe('Jordan Taylor');
  });

  it('4. imports anonymous drafts to authenticated user account safely', () => {
    const userA = 'usr_charlie_3';

    // Save an anonymous draft
    saveDraft(samplePayload, Date.now(), null);
    expect(hasAnonymousDraft()).toBe(true);

    // Import into Charlie's account
    const importResult = importAnonymousDraftToAccount(userA);
    expect(importResult.success).toBe(true);
    expect(importResult.draft).toBeDefined();
    expect(importResult.draft?.resume?.personal.fullName).toBe('Jordan Taylor');

    // Verify anonymous draft was cleanly cleared after import
    expect(hasAnonymousDraft()).toBe(false);
    expect(hasStoredDraft(null)).toBe(false);

    // Verify Charlie's account now has the draft
    expect(hasStoredDraft(userA)).toBe(true);
    const charlieDraft = loadDraft(userA);
    expect(charlieDraft?.resume?.personal.fullName).toBe('Jordan Taylor');

    // Attempting duplicate import fails gracefully with no_anonymous_draft
    const duplicate = importAnonymousDraftToAccount(userA);
    expect(duplicate.success).toBe(false);
    expect(duplicate.reason).toBe('no_anonymous_draft');
  });

  it('5. discards anonymous drafts without affecting existing accounts', () => {
    const userA = 'usr_david_4';
    saveDraft(samplePayload, Date.now(), userA);
    saveDraft({ ...samplePayload, activeTargetRole: 'Temporary Guest' }, Date.now(), null);

    expect(hasStoredDraft(userA)).toBe(true);
    expect(hasAnonymousDraft()).toBe(true);

    // Discard anonymous draft
    const ok = discardAnonymousDraft();
    expect(ok).toBe(true);

    expect(hasAnonymousDraft()).toBe(false);
    expect(hasStoredDraft(userA)).toBe(true);
    expect(loadDraft(userA)).not.toBeNull();
  });

  it('6. provides backward-compatible fallback for legacy un-scoped draft key', () => {
    // Simulate a draft stored under the legacy key before multi-user isolation
    mockStore[LEGACY_DRAFT_KEY] = JSON.stringify({
      version: 1,
      savedAt: 1700000000000,
      seq: 1,
      mode: 'improve',
      step: 'ready',
      activeTab: 'preview',
      selectedTemplate: 'classic',
      selectedMarginDensity: 'normal',
      selectedPageSize: 'A4',
      activeJobText: 'Legacy JD',
      activeTargetRole: 'Legacy Role',
      resume: samplePayload.resume,
      changeLog: [],
    });

    expect(hasStoredDraft(null)).toBe(true);
    expect(hasAnonymousDraft()).toBe(true);

    const loaded = loadDraft(null);
    expect(loaded).not.toBeNull();
    expect(loaded?.activeTargetRole).toBe('Legacy Role');

    // Clearing anonymous draft cleans up legacy key as well
    clearDraft(null);
    expect(mockStore[LEGACY_DRAFT_KEY]).toBeUndefined();
    expect(hasAnonymousDraft()).toBe(false);
  });
});
