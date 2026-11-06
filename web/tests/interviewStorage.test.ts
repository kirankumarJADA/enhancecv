// Curevo AI — Interview Preparation & Mock Interview Coach Storage Unit Tests (Phase 9F)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getInterviewSessions,
  getInterviewSession,
  saveInterviewSession,
  deleteInterviewSession,
  clearAllInterviewSessions,
  getSavedStarStories,
  saveStarStory,
  deleteStarStory,
  importInterviewDataJson,
  INTERVIEW_SESSIONS_KEY,
  STAR_STORIES_KEY,
  type InterviewSession,
  type SavedStarStory,
} from '../src/lib/interviewStorage';

describe('Curevo AI — Interview Storage Manager (Phase 9F)', () => {
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

  const sampleSession: InterviewSession = {
    id: 'session-123',
    title: 'Prep for Monolith Financial',
    type: 'prep',
    target_role: 'Senior Backend Engineer',
    company: 'Monolith Financial',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_completed: false,
    prep_questions: [
      {
        id: 'q1',
        category: 'TECHNICAL',
        question: 'How do you structure microservices in TypeScript?',
        why_it_may_be_asked: 'Role requires TypeScript microservices expertise.',
        evidence_from_cv: 'Built microservices at CloudScale UK.',
        recommended_answer_structure: 'Situation, architecture, outcome.',
        sample_truthful_answer: 'At CloudScale UK, I led the migration of 4 monolithic services into TypeScript microservices.',
      },
    ],
    study_plan: ['Review distributed caching', 'Practice concurrency scenarios'],
  };

  const sampleStarStory: SavedStarStory = {
    id: 'star-1',
    title: 'Database Query Optimization',
    situation: 'At CloudScale UK, p99 database latency exceeded 800ms.',
    task: 'I had to optimize response times to stay within client SLAs.',
    action: 'Analyzed query execution plans, created compound indexes, and introduced Redis caching.',
    result: 'Reduced p99 query latency by 42% and supported 15,000 req/sec.',
    tags: ['performance', 'database', 'redis'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe('Interview Sessions CRUD', () => {
    it('returns empty array when no sessions are stored', () => {
      expect(getInterviewSessions()).toEqual([]);
    });

    it('saves a new interview session and retrieves it', () => {
      const saved = saveInterviewSession(sampleSession);
      expect(saved).toBe(true);

      const list = getInterviewSessions();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('session-123');
      expect(list[0].company).toBe('Monolith Financial');

      const byId = getInterviewSession('session-123');
      expect(byId).not.toBeNull();
      expect(byId?.title).toBe('Prep for Monolith Financial');
    });

    it('updates an existing session without duplicating it', () => {
      saveInterviewSession(sampleSession);
      const updated = {
        ...sampleSession,
        title: 'Completed Monolith Mock Interview',
        is_completed: true,
      };
      saveInterviewSession(updated);

      const list = getInterviewSessions();
      expect(list).toHaveLength(1);
      expect(list[0].title).toBe('Completed Monolith Mock Interview');
      expect(list[0].is_completed).toBe(true);
    });

    it('deletes an interview session by id', () => {
      saveInterviewSession(sampleSession);
      expect(getInterviewSessions()).toHaveLength(1);

      const deleted = deleteInterviewSession('session-123');
      expect(deleted).toBe(true);
      expect(getInterviewSessions()).toHaveLength(0);
    });

    it('clears all sessions', () => {
      saveInterviewSession(sampleSession);
      saveInterviewSession({ ...sampleSession, id: 'session-456' });
      expect(getInterviewSessions()).toHaveLength(2);

      clearAllInterviewSessions();
      expect(getInterviewSessions()).toHaveLength(0);
    });

    it('recovers gracefully from corrupted JSON in localStorage', () => {
      mockStore[INTERVIEW_SESSIONS_KEY] = '{{corrupted:json';
      expect(getInterviewSessions()).toEqual([]);
    });
  });

  describe('STAR Story Bank CRUD', () => {
    it('saves and retrieves STAR stories', () => {
      expect(getSavedStarStories()).toEqual([]);
      const saved = saveStarStory(sampleStarStory);
      expect(saved).toBe(true);

      const list = getSavedStarStories();
      expect(list).toHaveLength(1);
      expect(list[0].title).toBe('Database Query Optimization');
      expect(list[0].tags).toContain('redis');
    });

    it('deletes a STAR story by id', () => {
      saveStarStory(sampleStarStory);
      expect(getSavedStarStories()).toHaveLength(1);

      deleteStarStory('star-1');
      expect(getSavedStarStories()).toHaveLength(0);
    });

    it('recovers gracefully from corrupted JSON in story storage', () => {
      mockStore[STAR_STORIES_KEY] = 'not-valid-json';
      expect(getSavedStarStories()).toEqual([]);
    });
  });

  describe('Import & Backup', () => {
    it('imports sessions and STAR stories from valid JSON payload', () => {
      const payload = JSON.stringify({
        sessions: [sampleSession],
        star_stories: [sampleStarStory],
      });

      const res = importInterviewDataJson(payload);
      expect(res.success).toBe(true);
      expect(res.sessionsImported).toBe(1);
      expect(res.storiesImported).toBe(1);

      expect(getInterviewSessions()).toHaveLength(1);
      expect(getSavedStarStories()).toHaveLength(1);
    });

    it('handles invalid JSON gracefully on import', () => {
      const res = importInterviewDataJson('{broken_json');
      expect(res.success).toBe(false);
      expect(res.sessionsImported).toBe(0);
      expect(res.error).toBeDefined();
    });
  });
});
