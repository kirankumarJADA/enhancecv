// Curevo AI — LinkedIn Optimization Storage Manager (Phase 9G)
//
// 100% Client-side, privacy-respecting localStorage persistence.
// Zero login required. Features automatic schema validation, quota handling,
// corruption recovery, and full JSON backup/restore.

export interface SavedLinkedInProfile {
  headline: string;
  about: string;
  targetRole: string;
  industry: string;
  skills: string[];
  experience: Array<{
    title: string;
    company: string;
    period?: string;
    bullets: string[];
  }>;
  updatedAt: string;
}

export interface LinkedInOptimizationRecord {
  id: string;
  timestamp: string;
  headline: string;
  targetRole: string;
  scores: {
    overallScore: number;
    headlineScore: number;
    aboutScore: number;
    experienceScore: number;
    skillsScore: number;
    searchabilityScore: number;
    completenessScore: number;
  };
  analysis: {
    strengths: string[];
    weaknesses: string[];
    profileCompletenessFeedback: string;
    positioningReview: string;
  };
  headlineOptions: Array<{
    type: string;
    headline: string;
    rationale: string;
  }>;
  improvedAbout: {
    text: string;
    hook: string;
    coreStory: string;
    keyAccomplishments: string[];
    specialtiesBlock: string;
    callToAction: string;
  };
  experienceEnhancements: Array<{
    company: string;
    role: string;
    originalBullet: string;
    enhancedBullet: string;
    metricImpact: string;
    truthSafe: boolean;
  }>;
  skillsRecommendations: {
    verifiedExisting: string[];
    recommendedAdditions: string[];
    topIndustryPicks: string[];
  };
  recruiterKeywords: Array<{
    keyword: string;
    category: string;
    impactLevel: string;
    relevanceExplanation: string;
  }>;
  provider: string;
  model: string;
}

const STORAGE_KEYS = {
  PROFILE: 'curevo_linkedin_profile_v1',
  HISTORY: 'curevo_linkedin_history_v1',
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('[LinkedIn Storage] Corrupted JSON in localStorage. Discarding.', err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 1. Profile Draft Persistence
// ---------------------------------------------------------------------------

export function getSavedLinkedInProfile(): SavedLinkedInProfile | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return safeParse<SavedLinkedInProfile | null>(localStorage.getItem(STORAGE_KEYS.PROFILE), null);
}

export function saveLinkedInProfile(profile: Partial<SavedLinkedInProfile>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const current = getSavedLinkedInProfile() || {
    headline: '',
    about: '',
    targetRole: '',
    industry: '',
    skills: [],
    experience: [],
    updatedAt: new Date().toISOString(),
  };

  const updated: SavedLinkedInProfile = {
    ...current,
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(updated));
  } catch (err) {
    console.warn('[LinkedIn Storage] Failed to save profile to localStorage:', err);
  }
}

// ---------------------------------------------------------------------------
// 2. Optimization History
// ---------------------------------------------------------------------------

export function getLinkedInHistory(): LinkedInOptimizationRecord[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const list = safeParse<LinkedInOptimizationRecord[]>(localStorage.getItem(STORAGE_KEYS.HISTORY), []);
  return Array.isArray(list) ? list : [];
}

export function saveLinkedInOptimization(record: LinkedInOptimizationRecord): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const history = getLinkedInHistory();
  const existingIdx = history.findIndex((h) => h.id === record.id);

  let updated: LinkedInOptimizationRecord[];
  if (existingIdx >= 0) {
    updated = [...history];
    updated[existingIdx] = record;
  } else {
    updated = [record, ...history].slice(0, 30); // Cap at 30 recent runs
  }

  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[LinkedIn Storage] Failed to save optimization history:', err);
  }
}

export function deleteLinkedInOptimization(id: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const history = getLinkedInHistory().filter((h) => h.id !== id);
  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  } catch (err) {
    console.warn('[LinkedIn Storage] Failed to delete optimization:', err);
  }
}

export function clearLinkedInHistory(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  localStorage.removeItem(STORAGE_KEYS.HISTORY);
}

// ---------------------------------------------------------------------------
// 3. Import & Export
// ---------------------------------------------------------------------------

export function exportLinkedInDataJson(): string {
  const data = {
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    profile: getSavedLinkedInProfile(),
    history: getLinkedInHistory(),
  };
  return JSON.stringify(data, null, 2);
}

export function importLinkedInDataJson(jsonStr: string): { success: boolean; count: number; error?: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, count: 0, error: 'Invalid JSON file format.' };
    }

    if (parsed.profile) {
      saveLinkedInProfile(parsed.profile);
    }

    let count = 0;
    if (Array.isArray(parsed.history)) {
      const current = getLinkedInHistory();
      const map = new Map<string, LinkedInOptimizationRecord>();
      current.forEach((item) => map.set(item.id, item));
      parsed.history.forEach((item: any) => {
        if (item && item.id && item.headline) {
          map.set(item.id, item);
          count++;
        }
      });
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(Array.from(map.values())));
    }

    return { success: true, count };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message || 'Corrupt JSON data' };
  }
}
