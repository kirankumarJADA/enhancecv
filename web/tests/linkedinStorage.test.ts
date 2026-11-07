import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSavedLinkedInProfile,
  saveLinkedInProfile,
  getLinkedInHistory,
  saveLinkedInOptimization,
  deleteLinkedInOptimization,
  clearLinkedInHistory,
  exportLinkedInDataJson,
  importLinkedInDataJson,
  type LinkedInOptimizationRecord,
} from '../src/lib/linkedinStorage';

describe('Curevo AI — LinkedIn Storage Manager (Phase 9G)', () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};

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

  it('1. saves and retrieves a LinkedIn profile draft', () => {
    expect(getSavedLinkedInProfile()).toBeNull();

    saveLinkedInProfile({
      headline: 'Senior Full Stack Engineer',
      about: 'Passionate about distributed systems.',
      targetRole: 'Lead Engineer',
      industry: 'FinTech',
      skills: ['TypeScript', 'Node.js'],
    });

    const loaded = getSavedLinkedInProfile();
    expect(loaded).not.toBeNull();
    expect(loaded?.headline).toBe('Senior Full Stack Engineer');
    expect(loaded?.skills).toEqual(['TypeScript', 'Node.js']);
  });

  it('2. records and retrieves optimization history', () => {
    const record: LinkedInOptimizationRecord = {
      id: 'opt_123',
      timestamp: new Date().toISOString(),
      headline: 'Tech Lead',
      targetRole: 'Staff Engineer',
      scores: {
        overallScore: 85,
        headlineScore: 90,
        aboutScore: 80,
        experienceScore: 85,
        skillsScore: 90,
        searchabilityScore: 88,
        completenessScore: 85,
      },
      analysis: {
        strengths: ['Clear title'],
        weaknesses: ['Add more metrics'],
        profileCompletenessFeedback: 'Great profile',
        positioningReview: 'Strong fit',
      },
      headlineOptions: [
        { type: 'Impact-Driven', headline: 'Impactful Engineer', rationale: 'Strong metric focus' },
      ],
      improvedAbout: {
        text: 'Hello world',
        hook: 'Hook',
        coreStory: 'Story',
        keyAccomplishments: ['Accomplished X'],
        specialtiesBlock: 'TypeScript',
        callToAction: 'Connect with me',
      },
      experienceEnhancements: [],
      skillsRecommendations: {
        verifiedExisting: ['TypeScript'],
        recommendedAdditions: ['AWS'],
        topIndustryPicks: ['Architecture'],
      },
      recruiterKeywords: [
        {
          keyword: 'TypeScript',
          category: 'Hard Skill',
          impactLevel: 'high',
          relevanceExplanation: 'Top keyword',
        },
      ],
      provider: 'deterministic-engine',
      model: 'curevo-rules-v1',
    };

    saveLinkedInOptimization(record);
    const history = getLinkedInHistory();
    expect(history.length).toBe(1);
    expect(history[0].id).toBe('opt_123');

    deleteLinkedInOptimization('opt_123');
    expect(getLinkedInHistory().length).toBe(0);
  });

  it('3. exports and imports JSON backups cleanly', () => {
    saveLinkedInProfile({ headline: 'Staff Developer' });
    const exported = exportLinkedInDataJson();
    expect(exported).toContain('Staff Developer');

    mockStore = {};
    const result = importLinkedInDataJson(exported);
    expect(result.success).toBe(true);
    expect(getSavedLinkedInProfile()?.headline).toBe('Staff Developer');
  });

  it('4. recovers gracefully from corrupted JSON in localStorage', () => {
    mockStore['curevo_linkedin_history_v1'] = 'corrupted{json';
    const history = getLinkedInHistory();
    expect(history).toEqual([]);
  });
});
