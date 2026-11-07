// Curevo AI — Browser LocalStorage Draft Persistence Manager
//
// Encapsulates debounced automatic saving, schema versioning, corrupt-data
// recovery, storage quota protection, and safe hydration for PublicBuilder.
//
// Invariants:
// 1. Never stores binary data, PDF buffers, or secrets/tokens.
// 2. Strict schema versioning (discards corrupted or incompatible schema formats).
// 3. Gracefully fails without crashing when localStorage is disabled (private browsing)
//    or full (quota exceeded).
// 4. Stale saves are rejected if an older sequence/timestamp resolves after a newer one.
// 5. Account isolation: drafts are scoped by owner ID (`curevo_builder_draft_v1_usr_${userId}`
//    vs `curevo_builder_draft_v1_anonymous`). Drafts never leak between accounts.

import type {
  ResumeData,
  ATSAnalysis,
  TruthReport,
  ChangeLogEntry,
  MatchAnalysis,
  CoverLetter,
  CoverLetterTone,
  PageSize,
  SectionKey,
  CertificationItem,
  LanguageItem,
  CustomSection,
} from '../types';

export const ANONYMOUS_DRAFT_KEY = 'curevo_builder_draft_v1_anonymous';
export const LEGACY_DRAFT_KEY = 'curevo_builder_draft_v1';
export const DRAFT_STORAGE_KEY = ANONYMOUS_DRAFT_KEY;
export const CURRENT_DRAFT_VERSION = 1;

/**
 * Returns the scoped localStorage key for a given user account or anonymous session.
 */
export function getDraftStorageKey(ownerId?: string | null): string {
  if (ownerId && typeof ownerId === 'string' && ownerId.trim()) {
    const clean = ownerId.trim().replace(/^usr_/, '');
    return `curevo_builder_draft_v1_usr_${clean}`;
  }
  return ANONYMOUS_DRAFT_KEY;
}

const VALID_SECTIONS: readonly SectionKey[] = [
  'summary',
  'experience',
  'projects',
  'education',
  'skills',
  'certifications',
  'languages',
  'achievements',
];

function isSectionKey(k: any): k is SectionKey {
  return typeof k === 'string' && VALID_SECTIONS.includes(k as SectionKey);
}

export interface CreateFormDraft {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  portfolio: string;
  linkedin: string;
  github: string;
  careerTitle: string;
  skillsRaw: string;
  experiences: Array<{
    company: string;
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string;
  }>;
  educations: Array<{
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
    grade: string;
  }>;
  projects: Array<{
    name: string;
    description: string;
    tech: string;
    link: string;
  }>;
  certs: Array<{
    name: string;
    issuer: string;
    year: string;
  }>;
}

export interface BuilderDraft {
  version: typeof CURRENT_DRAFT_VERSION;
  savedAt: number; // Unix timestamp in ms
  seq: number;     // Monotonic sequence number to prevent out-of-order writes
  ownerId?: string; // Optional user account ID for multi-user isolation
  mode: 'improve' | 'create' | 'ats';
  step: 'idle' | 'processing' | 'ready';
  activeTab: 'preview' | 'edit' | 'ats' | 'match' | 'cover' | 'truth' | 'changelog';
  selectedTemplate: string;
  selectedMarginDensity: 'compact' | 'normal' | 'spacious';
  selectedPageSize: PageSize;
  activeJobText: string;
  activeTargetRole: string;
  isSampleCv?: boolean;
  resume: ResumeData | null;
  ats: ATSAnalysis | null;
  truth: TruthReport | null;
  changeLog: ChangeLogEntry[];
  match: MatchAnalysis | null;
  coverLetter: CoverLetter | null;
  coverRole: string;
  coverCompany: string;
  coverJdText: string;
  coverTone: CoverLetterTone;
  createForm?: CreateFormDraft;
}

export type SaveResult =
  | { success: true; savedAt: number }
  | { success: false; reason: 'quota_exceeded' | 'unavailable' | 'stale' | 'invalid_payload'; message?: string };

let currentSeq = 0;
const lastPersistedTimestamps = new Map<string, number>();

/** Check if localStorage is available and writable. */
export function isStorageAvailable(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  try {
    const testKey = '__curevo_storage_probe__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/** Sanitize and validate resume structure before storing or after reading. */
export function validateDraftResume(r: unknown): ResumeData | null {
  if (!r || typeof r !== 'object') return null;
  const raw = r as Record<string, any>;
  if (!raw.personal || typeof raw.personal !== 'object') return null;

  return {
    personal: {
      fullName: String(raw.personal.fullName || '').slice(0, 150),
      email: String(raw.personal.email || '').slice(0, 150),
      phone: String(raw.personal.phone || '').slice(0, 80),
      location: String(raw.personal.location || '').slice(0, 150),
      linkedin: raw.personal.linkedin ? String(raw.personal.linkedin).slice(0, 200) : undefined,
      github: raw.personal.github ? String(raw.personal.github).slice(0, 200) : undefined,
      portfolio: raw.personal.portfolio ? String(raw.personal.portfolio).slice(0, 200) : undefined,
      headline: raw.personal.headline ? String(raw.personal.headline).slice(0, 200) : undefined,
      otherLinks: Array.isArray(raw.personal.otherLinks) ? raw.personal.otherLinks.map((l: any) => String(l).slice(0, 200)) : [],
    },
    summary: String(raw.summary || '').slice(0, 5000),
    experience: Array.isArray(raw.experience)
      ? raw.experience.map((e: any) => ({
          id: String(e.id || ''),
          company: String(e.company || '').slice(0, 150),
          title: String(e.title || '').slice(0, 150),
          location: e.location ? String(e.location).slice(0, 150) : undefined,
          startDate: String(e.startDate || '').slice(0, 50),
          endDate: String(e.endDate || '').slice(0, 50),
          current: Boolean(e.current),
          bullets: Array.isArray(e.bullets) ? e.bullets.map((b: any) => String(b).slice(0, 2000)) : [],
          dateDisplay: e.dateDisplay ? String(e.dateDisplay).slice(0, 80) : undefined,
        }))
      : [],
    education: Array.isArray(raw.education)
      ? raw.education.map((ed: any) => ({
          id: String(ed.id || ''),
          institution: String(ed.institution || '').slice(0, 150),
          degree: String(ed.degree || '').slice(0, 150),
          field: String(ed.field || '').slice(0, 150),
          startDate: String(ed.startDate || '').slice(0, 50),
          endDate: String(ed.endDate || '').slice(0, 50),
          grade: ed.grade ? String(ed.grade).slice(0, 50) : undefined,
          dateDisplay: ed.dateDisplay ? String(ed.dateDisplay).slice(0, 80) : undefined,
        }))
      : [],
    projects: Array.isArray(raw.projects)
      ? raw.projects.map((p: any) => ({
          id: String(p.id || ''),
          name: String(p.name || '').slice(0, 150),
          description: p.description ? String(p.description).slice(0, 2000) : undefined,
          link: p.link ? String(p.link).slice(0, 200) : undefined,
          tech: Array.isArray(p.tech) ? p.tech.map((t: any) => String(t).slice(0, 80)) : [],
          bullets: Array.isArray(p.bullets) ? p.bullets.map((b: any) => String(b).slice(0, 2000)) : [],
        }))
      : [],
    skills: {
      technical: Array.isArray(raw.skills?.technical)
        ? raw.skills.technical.map((s: any) => String(s).slice(0, 80))
        : [],
      soft: Array.isArray(raw.skills?.soft) ? raw.skills.soft.map((s: any) => String(s).slice(0, 80)) : [],
    },
    certifications: Array.isArray(raw.certifications)
      ? raw.certifications.map((c: any, idx: number): CertificationItem => ({
          id: String(c.id || `cert_${idx}`),
          name: String(c.name || '').slice(0, 150),
          issuer: c.issuer ? String(c.issuer).slice(0, 150) : undefined,
          year: c.year ? String(c.year).slice(0, 50) : undefined,
        }))
      : [],
    languages: Array.isArray(raw.languages)
      ? raw.languages.map((l: any, idx: number): LanguageItem => {
          if (typeof l === 'string') {
            return { id: `lang_${idx}`, name: l.slice(0, 80) };
          }
          return {
            id: String(l.id || `lang_${idx}`),
            name: String(l.name || '').slice(0, 80),
            proficiency: l.proficiency ? String(l.proficiency).slice(0, 50) : undefined,
          };
        })
      : [],
    achievements: Array.isArray(raw.achievements) ? raw.achievements.map((a: any) => String(a).slice(0, 500)) : [],
    customSections: Array.isArray(raw.customSections)
      ? raw.customSections.map((cs: any, idx: number): CustomSection => ({
          id: String(cs.id || `custom_${idx}`),
          title: String(cs.title || cs.heading || '').slice(0, 100),
          bullets: Array.isArray(cs.bullets)
            ? cs.bullets.map((b: any) => String(b).slice(0, 500))
            : Array.isArray(cs.items)
            ? cs.items.map((i: any) => String(i).slice(0, 500))
            : [],
        }))
      : [],
    sectionOrder: Array.isArray(raw.sectionOrder)
      ? (raw.sectionOrder.filter(isSectionKey) as SectionKey[])
      : [...VALID_SECTIONS],
    hiddenSections: Array.isArray(raw.hiddenSections)
      ? (raw.hiddenSections.filter(isSectionKey) as SectionKey[])
      : [],
  };
}

/** Validate full draft payload before storing or restoring. */
export function validateDraft(raw: unknown): BuilderDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, any>;

  // Schema version guard: Discard unversioned or incompatible drafts
  if (d.version !== CURRENT_DRAFT_VERSION) {
    return null;
  }

  // Must have a valid timestamp
  const savedAt = Number(d.savedAt);
  if (Number.isNaN(savedAt) || savedAt <= 0) {
    return null;
  }

  const mode = d.mode === 'create' || d.mode === 'ats' ? d.mode : 'improve';
  const step = d.step === 'ready' ? 'ready' : 'idle';
  const activeTab = ['preview', 'edit', 'ats', 'match', 'cover', 'truth', 'changelog'].includes(d.activeTab)
    ? d.activeTab
    : 'preview';

  const resume = d.resume ? validateDraftResume(d.resume) : null;

  return {
    version: CURRENT_DRAFT_VERSION,
    savedAt,
    seq: Number(d.seq) || 0,
    ownerId: typeof d.ownerId === 'string' ? d.ownerId.slice(0, 100) : undefined,
    mode,
    step,
    activeTab,
    selectedTemplate: String(d.selectedTemplate || 'classic').slice(0, 40),
    selectedMarginDensity: ['compact', 'normal', 'spacious'].includes(d.selectedMarginDensity)
      ? d.selectedMarginDensity
      : 'normal',
    selectedPageSize: d.selectedPageSize === 'LETTER' ? 'LETTER' : 'A4',
    activeJobText: String(d.activeJobText || '').slice(0, 20_000),
    activeTargetRole: String(d.activeTargetRole || '').slice(0, 150),
    isSampleCv: Boolean(d.isSampleCv),
    resume,
    ats: d.ats && typeof d.ats === 'object' ? d.ats : null,
    truth: d.truth && typeof d.truth === 'object' ? d.truth : null,
    changeLog: Array.isArray(d.changeLog) ? d.changeLog : [],
    match: d.match && typeof d.match === 'object' ? d.match : null,
    coverLetter:
      d.coverLetter && typeof d.coverLetter === 'object' && Array.isArray(d.coverLetter.paragraphs)
        ? {
            greeting: String(d.coverLetter.greeting || '').slice(0, 120),
            paragraphs: d.coverLetter.paragraphs.map((p: any) => String(p).slice(0, 3000)),
            closing: String(d.coverLetter.closing || '').slice(0, 120),
          }
        : null,
    coverRole: String(d.coverRole || '').slice(0, 150),
    coverCompany: String(d.coverCompany || '').slice(0, 150),
    coverJdText: String(d.coverJdText || '').slice(0, 20_000),
    coverTone: ['professional', 'enthusiastic', 'confident', 'succinct'].includes(d.coverTone)
      ? d.coverTone
      : 'professional',
    createForm: d.createForm && typeof d.createForm === 'object' ? d.createForm : undefined,
  };
}

/**
 * Persist the current builder draft to localStorage with monotonic sequence protection
 * and account-level key isolation.
 */
export function saveDraft(
  draftData: Omit<BuilderDraft, 'version' | 'savedAt' | 'seq'>,
  timestamp = Date.now(),
  ownerId?: string | null,
): SaveResult {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { success: false, reason: 'unavailable' };
  }

  const key = getDraftStorageKey(ownerId);
  const lastTimestamp = lastPersistedTimestamps.get(key) || 0;

  // Stale save protection: ensure older asynchronous saves cannot overwrite newer state
  if (timestamp < lastTimestamp) {
    return { success: false, reason: 'stale' };
  }

  currentSeq++;
  const fullDraft: BuilderDraft = {
    ...draftData,
    version: CURRENT_DRAFT_VERSION,
    savedAt: timestamp,
    seq: currentSeq,
    ownerId: ownerId || undefined,
  };

  const validated = validateDraft(fullDraft);
  if (!validated) {
    return { success: false, reason: 'invalid_payload' };
  }

  try {
    const serialized = JSON.stringify(validated);
    window.localStorage.setItem(key, serialized);
    lastPersistedTimestamps.set(key, timestamp);
    return { success: true, savedAt: timestamp };
  } catch (err: any) {
    const isQuota =
      err?.name === 'QuotaExceededError' ||
      err?.code === 22 ||
      err?.code === 1014 ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED';

    if (isQuota) {
      console.warn('[Curevo Draft] Storage quota exceeded. Unable to save local draft.');
      return { success: false, reason: 'quota_exceeded', message: 'Browser storage quota exceeded.' };
    }

    console.warn('[Curevo Draft] Local storage write failed:', err?.message || err);
    return { success: false, reason: 'unavailable', message: err?.message };
  }
}

/**
 * Retrieve and validate the saved draft from localStorage for a specific account or anonymous session.
 * Automatically clears corrupted or invalid drafts to prevent crash loops.
 */
export function loadDraft(ownerId?: string | null): BuilderDraft | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  const key = getDraftStorageKey(ownerId);
  try {
    let raw = window.localStorage.getItem(key);

    // Fallback for anonymous users: if nothing at ANONYMOUS_DRAFT_KEY, check legacy key
    if (!raw && key === ANONYMOUS_DRAFT_KEY) {
      raw = window.localStorage.getItem(LEGACY_DRAFT_KEY);
    }

    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[Curevo Draft] Malformed JSON in localStorage. Discarding corrupt draft.');
      clearDraft(ownerId);
      return null;
    }

    const validated = validateDraft(parsed);
    if (!validated) {
      console.warn('[Curevo Draft] Incompatible or invalid draft structure. Clearing.');
      clearDraft(ownerId);
      return null;
    }

    const prev = lastPersistedTimestamps.get(key) || 0;
    lastPersistedTimestamps.set(key, Math.max(prev, validated.savedAt));
    return validated;
  } catch (err: any) {
    console.warn('[Curevo Draft] Could not read localStorage:', err?.message || err);
    return null;
  }
}

/** Check if a valid draft exists in localStorage without full parsing overhead. */
export function hasStoredDraft(ownerId?: string | null): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  const key = getDraftStorageKey(ownerId);
  try {
    const exists = Boolean(window.localStorage.getItem(key));
    if (!exists && key === ANONYMOUS_DRAFT_KEY) {
      return Boolean(window.localStorage.getItem(LEGACY_DRAFT_KEY));
    }
    return exists;
  } catch {
    return false;
  }
}

/**
 * Manually clear the stored draft from localStorage for a specific account or anonymous session.
 */
export function clearDraft(ownerId?: string | null): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  const key = getDraftStorageKey(ownerId);
  try {
    window.localStorage.removeItem(key);
    if (key === ANONYMOUS_DRAFT_KEY) {
      window.localStorage.removeItem(LEGACY_DRAFT_KEY);
    }
    lastPersistedTimestamps.delete(key);
    return true;
  } catch {
    return false;
  }
}

/** Check if an anonymous (unauthenticated) draft exists. */
export function hasAnonymousDraft(): boolean {
  return hasStoredDraft(null);
}

/** Retrieve an anonymous (unauthenticated) draft if present. */
export function getAnonymousDraft(): BuilderDraft | null {
  return loadDraft(null);
}

/** Discard any pending anonymous draft. */
export function discardAnonymousDraft(): boolean {
  return clearDraft(null);
}

export interface ImportResult {
  success: boolean;
  reason?: 'no_anonymous_draft' | 'save_failed';
  draft?: BuilderDraft;
}

/**
 * Explicitly import an anonymous draft into an authenticated user's account.
 * Atomically persists the draft under the user's account key and cleans up the anonymous draft.
 */
export function importAnonymousDraftToAccount(ownerId: string): ImportResult {
  if (!ownerId || !ownerId.trim()) {
    return { success: false, reason: 'no_anonymous_draft' };
  }

  const anonDraft = loadDraft(null);
  if (!anonDraft) {
    return { success: false, reason: 'no_anonymous_draft' };
  }

  // Save under the user's account key
  const saveRes = saveDraft(anonDraft, Date.now(), ownerId);
  if (!saveRes.success) {
    return { success: false, reason: 'save_failed' };
  }

  // Successfully imported: clear the anonymous draft
  discardAnonymousDraft();
  return { success: true, draft: anonDraft };
}

/** Test hook: reset in-memory sequence and timestamps. */
export function __resetDraftStorageForTests(): void {
  currentSeq = 0;
  lastPersistedTimestamps.clear();
}
