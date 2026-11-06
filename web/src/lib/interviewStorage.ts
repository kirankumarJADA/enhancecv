// Curevo AI — Interview Preparation & Mock Interview Coach Storage (Phase 9F)
//
// 100% Client-Side Persistence via localStorage.
// Implements:
//   - Saved Interview Sessions (Prep packs and Mock interview transcripts)
//   - STAR Story Bank management
//   - Safe corruption recovery & QuotaExceededError protection
//   - JSON Export and Import capabilities

export interface InterviewPrepQuestion {
  id: string;
  category: string;
  question: string;
  why_it_may_be_asked: string;
  evidence_from_cv: string;
  recommended_answer_structure: string;
  sample_truthful_answer: string;
}

export interface StarEvaluationResult {
  relevance: { level: 'low' | 'medium' | 'high'; explanation: string };
  structureFeedback: string;
  clarityFeedback: string;
  specificityFeedback: string;
  impactFeedback: string;
  strengths: string[];
  improvements: string[];
  unsupportedClaims: string[];
  suggestedStarRefinement?: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  overallSummary: string;
  isFallback?: boolean;
}

export interface SavedStarStory {
  id: string;
  title: string;
  question?: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
  evaluation?: StarEvaluationResult;
  created_at: string;
  updated_at: string;
}

export interface MockEvaluationResult {
  relevance: { level: 'low' | 'medium' | 'high'; explanation: string };
  structure: string;
  clarity: string;
  specificity: string;
  impact: string;
  strengths: string[];
  improvements: string[];
  followUpQuestion: string;
  overallFeedback: string;
  unsupportedClaims: string[];
  isFallback?: boolean;
}

export interface MockAnswerRecord {
  questionId: string;
  category: string;
  question: string;
  answer: string;
  evaluation?: MockEvaluationResult;
  answered_at: string;
}

export interface FinalMockReportResult {
  summary: string;
  overallRating: 'exceptional' | 'proficient' | 'developing' | 'needs_practice';
  keyStrengths: string[];
  criticalAreasForImprovement: string[];
  recommendedPreparationSteps: string[];
  competencyBreakdown: {
    category: string;
    scoreLabel: string;
    feedback: string;
  }[];
  isFallback?: boolean;
}

export interface InterviewSession {
  id: string;
  title: string;
  type: 'prep' | 'mock';
  target_role: string;
  company: string;
  job_description?: string;
  difficulty?: 'entry' | 'mid' | 'senior' | 'lead';
  created_at: string;
  updated_at: string;
  prep_questions?: InterviewPrepQuestion[];
  study_plan?: string[];
  mock_answers?: MockAnswerRecord[];
  final_report?: FinalMockReportResult;
  is_completed: boolean;
}

export const INTERVIEW_SESSIONS_KEY = 'curevo_interview_sessions_v1';
export const STAR_STORIES_KEY = 'curevo_star_stories_v1';

function getStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('[Interview Storage] Corrupted JSON in localStorage. Discarding.', err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 1. Interview Sessions Management
// ---------------------------------------------------------------------------

export function getInterviewSessions(): InterviewSession[] {
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(INTERVIEW_SESSIONS_KEY);
  const list = safeParse<unknown[]>(raw, []);
  if (!Array.isArray(list)) return [];

  return list.filter((item): item is InterviewSession => {
    return Boolean(
      item &&
        typeof item === 'object' &&
        typeof (item as any).id === 'string' &&
        typeof (item as any).title === 'string' &&
        typeof (item as any).type === 'string'
    );
  });
}

export function getInterviewSession(id: string): InterviewSession | null {
  if (!id) return null;
  const sessions = getInterviewSessions();
  return sessions.find((s) => s.id === id) || null;
}

export function saveInterviewSession(session: InterviewSession): boolean {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const sessions = getInterviewSessions();
    const existingIndex = sessions.findIndex((s) => s.id === session.id);
    const updated: InterviewSession = {
      ...session,
      updated_at: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      sessions[existingIndex] = updated;
    } else {
      sessions.unshift(updated);
    }

    storage.setItem(INTERVIEW_SESSIONS_KEY, JSON.stringify(sessions));
    return true;
  } catch (err) {
    console.error('[Interview Storage] Failed to save session:', err);
    return false;
  }
}

export function deleteInterviewSession(id: string): boolean {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const sessions = getInterviewSessions().filter((s) => s.id !== id);
    storage.setItem(INTERVIEW_SESSIONS_KEY, JSON.stringify(sessions));
    return true;
  } catch (err) {
    console.error('[Interview Storage] Failed to delete session:', err);
    return false;
  }
}

export function clearAllInterviewSessions(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(INTERVIEW_SESSIONS_KEY);
}

// ---------------------------------------------------------------------------
// 2. STAR Story Bank Management
// ---------------------------------------------------------------------------

export function getSavedStarStories(): SavedStarStory[] {
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(STAR_STORIES_KEY);
  const list = safeParse<unknown[]>(raw, []);
  if (!Array.isArray(list)) return [];

  return list.filter((item): item is SavedStarStory => {
    return Boolean(
      item &&
        typeof item === 'object' &&
        typeof (item as any).id === 'string' &&
        typeof (item as any).title === 'string'
    );
  });
}

export function saveStarStory(story: SavedStarStory): boolean {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const stories = getSavedStarStories();
    const existingIndex = stories.findIndex((s) => s.id === story.id);
    const updated: SavedStarStory = {
      ...story,
      updated_at: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      stories[existingIndex] = updated;
    } else {
      stories.unshift(updated);
    }

    storage.setItem(STAR_STORIES_KEY, JSON.stringify(stories));
    return true;
  } catch (err) {
    console.error('[Interview Storage] Failed to save STAR story:', err);
    return false;
  }
}

export function deleteStarStory(id: string): boolean {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const stories = getSavedStarStories().filter((s) => s.id !== id);
    storage.setItem(STAR_STORIES_KEY, JSON.stringify(stories));
    return true;
  } catch (err) {
    console.error('[Interview Storage] Failed to delete STAR story:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 3. Export / Import Utilities
// ---------------------------------------------------------------------------

export function exportInterviewSessionJson(session: InterviewSession): void {
  if (typeof window === 'undefined') return;
  const fileName = `curevo_interview_${session.type}_${session.company ? session.company.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'session'}_${session.id.slice(-6)}.json`;
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAllInterviewDataJson(): void {
  if (typeof window === 'undefined') return;
  const exportPayload = {
    exported_at: new Date().toISOString(),
    version: '1.0',
    app: 'Curevo AI',
    sessions: getInterviewSessions(),
    star_stories: getSavedStarStories(),
  };

  const fileName = `curevo_interview_backup_${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importInterviewDataJson(
  jsonString: string
): { success: boolean; sessionsImported: number; storiesImported: number; error?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    let sessionsImported = 0;
    let storiesImported = 0;

    if (Array.isArray(parsed.sessions)) {
      const existing = getInterviewSessions();
      const existingIds = new Set(existing.map((s) => s.id));
      for (const item of parsed.sessions) {
        if (item && item.id && item.title) {
          if (!existingIds.has(item.id)) {
            existing.unshift(item);
            existingIds.add(item.id);
            sessionsImported++;
          }
        }
      }
      getStorage()?.setItem(INTERVIEW_SESSIONS_KEY, JSON.stringify(existing));
    }

    if (Array.isArray(parsed.star_stories)) {
      const existingStories = getSavedStarStories();
      const existingStoryIds = new Set(existingStories.map((s) => s.id));
      for (const item of parsed.star_stories) {
        if (item && item.id && item.title) {
          if (!existingStoryIds.has(item.id)) {
            existingStories.unshift(item);
            existingStoryIds.add(item.id);
            storiesImported++;
          }
        }
      }
      getStorage()?.setItem(STAR_STORIES_KEY, JSON.stringify(existingStories));
    }

    return { success: true, sessionsImported, storiesImported };
  } catch (err) {
    return { success: false, sessionsImported: 0, storiesImported: 0, error: (err as Error).message };
  }
}
