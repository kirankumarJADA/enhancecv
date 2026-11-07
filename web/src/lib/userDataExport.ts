// Curevo AI — Privacy, Portability & Full User Data Manager (Phase 9P)
//
// 100% Client-Side Data Sovereignty:
// Users own 100% of their data in browser localStorage.
// Provides complete unified JSON export, safe validation, corruption recovery,
// and single-click total data purging.

export interface CurevoUserDataExport {
  version: 1;
  exportedAt: string;
  source: 'Curevo AI Data Portability Hub';
  data: {
    resumeDrafts?: unknown;
    savedJobs?: unknown[];
    applications?: unknown[];
    interviewSessions?: unknown[];
    starStories?: unknown[];
    linkedinProfile?: unknown;
    linkedinHistory?: unknown[];
    companyResearch?: unknown;
  };
}

const STORAGE_KEYS = {
  resumeDraft: 'curevo_draft_anonymous_v1',
  savedJobs: 'curevo_saved_jobs_v1',
  applications: 'curevo_applications_v1',
  interviewSessions: 'curevo_interview_sessions_v1',
  starStories: 'curevo_star_stories_v1',
  linkedinProfile: 'curevo_linkedin_profile_v1',
  linkedinHistory: 'curevo_linkedin_history_v1',
  companyResearch: 'curevo_company_research_v1',
};

function safeGet(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function exportAllCurevoData(): CurevoUserDataExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'Curevo AI Data Portability Hub',
    data: {
      resumeDrafts: safeGet(STORAGE_KEYS.resumeDraft),
      savedJobs: (safeGet(STORAGE_KEYS.savedJobs) as unknown[]) || [],
      applications: (safeGet(STORAGE_KEYS.applications) as unknown[]) || [],
      interviewSessions: (safeGet(STORAGE_KEYS.interviewSessions) as unknown[]) || [],
      starStories: (safeGet(STORAGE_KEYS.starStories) as unknown[]) || [],
      linkedinProfile: safeGet(STORAGE_KEYS.linkedinProfile),
      linkedinHistory: (safeGet(STORAGE_KEYS.linkedinHistory) as unknown[]) || [],
      companyResearch: safeGet(STORAGE_KEYS.companyResearch),
    },
  };
}

export function downloadAllCurevoDataJson(): void {
  const data = exportAllCurevoData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `curevo_complete_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importAllCurevoData(jsonText: string): { ok: boolean; message: string; count: number } {
  try {
    const parsed = JSON.parse(jsonText) as Partial<CurevoUserDataExport>;
    if (!parsed || parsed.version !== 1 || !parsed.data) {
      return { ok: false, message: 'Invalid or incompatible backup format. Expected Curevo format version 1.', count: 0 };
    }

    let restoredCount = 0;
    const { data } = parsed;

    if (data.resumeDrafts) {
      localStorage.setItem(STORAGE_KEYS.resumeDraft, JSON.stringify(data.resumeDrafts));
      restoredCount++;
    }
    if (Array.isArray(data.savedJobs) && data.savedJobs.length > 0) {
      localStorage.setItem(STORAGE_KEYS.savedJobs, JSON.stringify(data.savedJobs));
      restoredCount += data.savedJobs.length;
    }
    if (Array.isArray(data.applications) && data.applications.length > 0) {
      localStorage.setItem(STORAGE_KEYS.applications, JSON.stringify(data.applications));
      restoredCount += data.applications.length;
    }
    if (Array.isArray(data.interviewSessions) && data.interviewSessions.length > 0) {
      localStorage.setItem(STORAGE_KEYS.interviewSessions, JSON.stringify(data.interviewSessions));
      restoredCount += data.interviewSessions.length;
    }
    if (Array.isArray(data.starStories) && data.starStories.length > 0) {
      localStorage.setItem(STORAGE_KEYS.starStories, JSON.stringify(data.starStories));
      restoredCount += data.starStories.length;
    }
    if (data.linkedinProfile) {
      localStorage.setItem(STORAGE_KEYS.linkedinProfile, JSON.stringify(data.linkedinProfile));
      restoredCount++;
    }
    if (Array.isArray(data.linkedinHistory) && data.linkedinHistory.length > 0) {
      localStorage.setItem(STORAGE_KEYS.linkedinHistory, JSON.stringify(data.linkedinHistory));
      restoredCount += data.linkedinHistory.length;
    }
    if (data.companyResearch) {
      localStorage.setItem(STORAGE_KEYS.companyResearch, JSON.stringify(data.companyResearch));
      restoredCount++;
    }

    return { ok: true, message: `Successfully restored ${restoredCount} career records from backup!`, count: restoredCount };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Failed to parse backup JSON file.', count: 0 };
  }
}

export function clearAllCurevoData(): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Safe ignore
    }
  }
}
