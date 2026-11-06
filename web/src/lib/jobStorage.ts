// Curevo AI — Local Job & Application Storage Manager (Phase 9E)
//
// 100% Client-Side Persistence via localStorage.
// Implements:
//   - Saved Jobs management
//   - Kanban Application Tracking across 5 stages: SAVED, APPLIED, INTERVIEW, OFFER, REJECTED
//   - Editing, deleting, and status transitions
//   - CSV and JSON exports
//   - Safe corruption recovery & QuotaExceededError protection

import type { CuratedJob } from '../data/curatedJobs';
import type { ResumeData } from '../types';

export type ApplicationStage = 'SAVED' | 'APPLIED' | 'INTERVIEW' | 'OFFER' | 'REJECTED';

export interface SavedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  remote_type: 'remote' | 'hybrid' | 'on-site' | string;
  employment_type: string;
  url: string;
  source: string;
  posted_at: string;
  description: string;
  requirements: string;
  technologies: string[];
  saved_at: string;
  match_score?: number | null;
  matched_skills?: string[];
  missing_skills?: string[];
  notes?: string;
}

export interface TrackedApplication {
  id: string;
  job_id?: string;
  company: string;
  role: string;
  location: string;
  salary: string;
  job_url: string;
  status: ApplicationStage;
  applied_date: string;
  interview_date?: string;
  offer_details?: string;
  rejection_reason?: string;
  notes: string;
  match_score?: number | null;
  resume_version_label?: string;
  job_description?: string;
  technologies?: string[];
  created_at: string;
  updated_at: string;
}

export const SAVED_JOBS_KEY = 'curevo_saved_jobs_v1';
export const APPLICATIONS_KEY = 'curevo_applications_v1';

function getStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('[Curevo Storage] Corrupted JSON in localStorage. Discarding.', err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 1. Saved Jobs
// ---------------------------------------------------------------------------

export function getSavedJobs(): SavedJob[] {
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(SAVED_JOBS_KEY);
  const list = safeParse<unknown[]>(raw, []);
  if (!Array.isArray(list)) return [];

  // Filter valid items
  return list.filter((item): item is SavedJob => {
    return Boolean(
      item &&
        typeof item === 'object' &&
        typeof (item as any).id === 'string' &&
        typeof (item as any).title === 'string'
    );
  });
}

export function saveJob(job: SavedJob): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const existing = getSavedJobs();
    const idx = existing.findIndex((j) => j.id === job.id);
    let updated: SavedJob[];
    if (idx >= 0) {
      updated = [...existing];
      updated[idx] = { ...job, saved_at: existing[idx].saved_at || new Date().toISOString() };
    } else {
      updated = [{ ...job, saved_at: job.saved_at || new Date().toISOString() }, ...existing];
    }
    storage.setItem(SAVED_JOBS_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('[Curevo Storage] Failed to save job to localStorage:', err);
    return false;
  }
}

export function removeSavedJob(id: string): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const existing = getSavedJobs();
    const updated = existing.filter((j) => j.id !== id);
    storage.setItem(SAVED_JOBS_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('[Curevo Storage] Failed to remove saved job:', err);
    return false;
  }
}

export function isJobSaved(id: string): boolean {
  const jobs = getSavedJobs();
  return jobs.some((j) => j.id === id);
}

export function clearSavedJobs(): void {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(SAVED_JOBS_KEY);
  }
}

// ---------------------------------------------------------------------------
// 2. Applications (Kanban Tracker)
// ---------------------------------------------------------------------------

export function getApplications(): TrackedApplication[] {
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(APPLICATIONS_KEY);
  const list = safeParse<unknown[]>(raw, []);
  if (!Array.isArray(list)) return [];

  return list
    .filter((item): item is TrackedApplication => {
      return Boolean(
        item &&
          typeof item === 'object' &&
          typeof (item as any).id === 'string' &&
          typeof (item as any).company === 'string' &&
          typeof (item as any).role === 'string' &&
          typeof (item as any).status === 'string'
      );
    })
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
}

export function saveApplication(app: TrackedApplication): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const existing = getApplications();
    const now = new Date().toISOString();
    const idx = existing.findIndex((a) => a.id === app.id);
    let updated: TrackedApplication[];

    if (idx >= 0) {
      updated = [...existing];
      updated[idx] = { ...app, updated_at: now };
    } else {
      updated = [{ ...app, created_at: app.created_at || now, updated_at: now }, ...existing];
    }
    storage.setItem(APPLICATIONS_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('[Curevo Storage] Failed to save application:', err);
    return false;
  }
}

export function updateApplicationStatus(id: string, newStatus: ApplicationStage): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const existing = getApplications();
    const item = existing.find((a) => a.id === id);
    if (!item) return false;

    const now = new Date().toISOString();
    item.status = newStatus;
    item.updated_at = now;
    if (newStatus === 'APPLIED' && !item.applied_date) {
      item.applied_date = now.split('T')[0];
    }

    storage.setItem(APPLICATIONS_KEY, JSON.stringify(existing));
    return true;
  } catch (err) {
    console.error('[Curevo Storage] Failed to update application status:', err);
    return false;
  }
}

export function deleteApplication(id: string): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const existing = getApplications();
    const updated = existing.filter((a) => a.id !== id);
    storage.setItem(APPLICATIONS_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('[Curevo Storage] Failed to delete application:', err);
    return false;
  }
}

export function clearApplications(): void {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(APPLICATIONS_KEY);
  }
}

export function createApplicationFromJob(
  job: SavedJob | CuratedJob,
  initialStatus: ApplicationStage = 'SAVED'
): TrackedApplication {
  const now = new Date().toISOString();
  const id = `app_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  const app: TrackedApplication = {
    id,
    job_id: job.id,
    company: job.company,
    role: job.title,
    location: job.location,
    salary: job.salary || '',
    job_url: job.url || '',
    status: initialStatus,
    applied_date: initialStatus === 'APPLIED' ? now.split('T')[0] : '',
    notes: '',
    match_score: (job as SavedJob).match_score ?? null,
    job_description: job.description || '',
    technologies: job.technologies || [],
    created_at: now,
    updated_at: now,
  };
  saveApplication(app);
  return app;
}

// ---------------------------------------------------------------------------
// 3. Export Utilities (JSON & CSV)
// ---------------------------------------------------------------------------

export function generateApplicationsCsv(apps: TrackedApplication[]): string {
  const headers = [
    'Company',
    'Role',
    'Status',
    'Location',
    'Salary',
    'Applied Date',
    'Interview Date',
    'Match Score',
    'Job URL',
    'Notes',
    'Created At',
  ];

  const escapeCsv = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '""';
    const clean = String(str).replace(/"/g, '""');
    return `"${clean}"`;
  };

  const rows = apps.map((a) => [
    escapeCsv(a.company),
    escapeCsv(a.role),
    escapeCsv(a.status),
    escapeCsv(a.location),
    escapeCsv(a.salary),
    escapeCsv(a.applied_date),
    escapeCsv(a.interview_date || ''),
    escapeCsv(a.match_score !== null && a.match_score !== undefined ? `${a.match_score}%` : ''),
    escapeCsv(a.job_url),
    escapeCsv(a.notes),
    escapeCsv(a.created_at),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

export function downloadFile(content: string, fileName: string, mimeType: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function exportApplicationsCsv(): void {
  const apps = getApplications();
  const csv = generateApplicationsCsv(apps);
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(csv, `curevo-job-applications-${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

export function exportApplicationsJson(): void {
  const apps = getApplications();
  const payload = {
    exported_at: new Date().toISOString(),
    version: '1.0',
    count: apps.length,
    applications: apps,
  };
  const json = JSON.stringify(payload, null, 2);
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(json, `curevo-job-applications-${dateStr}.json`, 'application/json');
}

export function loadActiveDraftResume(): { resume: ResumeData; name: string; role: string } | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw =
      window.localStorage.getItem('curevo_builder_draft_v1_anonymous') ||
      window.localStorage.getItem('curevo_builder_draft_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const resume = parsed.resume || parsed.data?.resume;
    if (resume && typeof resume === 'object') {
      const name = resume.personal?.fullName || 'Active Draft CV';
      const role = resume.personal?.headline || parsed.activeTargetRole || 'Software Professional';
      return { resume: resume as ResumeData, name, role };
    }
  } catch {
    // ignore
  }
  return null;
}
