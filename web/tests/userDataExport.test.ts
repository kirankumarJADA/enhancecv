import { describe, it, expect, beforeEach } from 'vitest';
import {
  exportAllCurevoData,
  importAllCurevoData,
  clearAllCurevoData,
  STORAGE_KEYS,
  CUSTOM_AI_KEY_STORAGE,
} from '../src/lib/userDataExport';

describe('Curevo AI — User Data Sovereignty & Portability (Phase 9P)', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    (globalThis as any).localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
    };
  });

  it('exports empty state cleanly when no data exists', () => {
    const exported = exportAllCurevoData();
    expect(exported.version).toBe(1);
    expect(exported.source).toContain('Curevo AI');
    expect(exported.data.savedJobs).toEqual([]);
    expect(exported.data.applications).toEqual([]);
  });

  it('exports stored user records across all tools', () => {
    localStorage.setItem(
      'curevo_saved_jobs_v1',
      JSON.stringify([{ id: 'job_1', title: 'Staff SRE', company: 'CloudCo' }])
    );
    localStorage.setItem(
      'curevo_applications_v1',
      JSON.stringify([{ id: 'app_1', title: 'Staff SRE', status: 'interview' }])
    );

    const exported = exportAllCurevoData();
    expect(exported.data.savedJobs?.length).toBe(1);
    expect(exported.data.applications?.length).toBe(1);
  });

  it('imports valid backup and restores all data keys', () => {
    const backupJson = JSON.stringify({
      version: 1,
      exportedAt: '2026-11-06T18:00:00.000Z',
      source: 'Curevo AI Data Portability Hub',
      data: {
        savedJobs: [{ id: 'job_import', title: 'Lead Architect', company: 'FinTech' }],
        applications: [{ id: 'app_import', title: 'Lead Architect', status: 'offer' }],
      },
    });

    const result = importAllCurevoData(backupJson);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);

    const restoredJobs = JSON.parse(localStorage.getItem('curevo_saved_jobs_v1') || '[]');
    expect(restoredJobs.length).toBe(1);
    expect(restoredJobs[0].title).toBe('Lead Architect');
  });

  it('rejects invalid or corrupted backup payloads', () => {
    const result1 = importAllCurevoData('not-json');
    expect(result1.ok).toBe(false);

    const result2 = importAllCurevoData(JSON.stringify({ version: 99, data: {} }));
    expect(result2.ok).toBe(false);
    expect(result2.message).toContain('incompatible backup format');
  });

  it('clears all user data completely on request including custom AI key and legacy draft keys', () => {
    localStorage.setItem(STORAGE_KEYS.savedJobs, JSON.stringify([{ id: 'job_1' }]));
    localStorage.setItem(STORAGE_KEYS.applications, JSON.stringify([{ id: 'app_1' }]));
    localStorage.setItem(STORAGE_KEYS.resumeDraft, JSON.stringify({ version: 1, mode: 'create' }));
    localStorage.setItem('curevo_draft_anonymous_v1', JSON.stringify({ version: 1, legacy: true }));
    localStorage.setItem('curevo_builder_draft_v1', JSON.stringify({ version: 1, legacy: true }));
    localStorage.setItem(CUSTOM_AI_KEY_STORAGE, 'nvapi-user-custom-secret');

    clearAllCurevoData();

    expect(localStorage.getItem(STORAGE_KEYS.savedJobs)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.applications)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.resumeDraft)).toBeNull();
    expect(localStorage.getItem('curevo_draft_anonymous_v1')).toBeNull();
    expect(localStorage.getItem('curevo_builder_draft_v1')).toBeNull();
    expect(localStorage.getItem(CUSTOM_AI_KEY_STORAGE)).toBeNull();
  });

  it('exports canonical draft key and supports legacy key fallback', () => {
    expect(STORAGE_KEYS.resumeDraft).toBe('curevo_builder_draft_v1_anonymous');

    // Case A: Saved under canonical key
    localStorage.setItem('curevo_builder_draft_v1_anonymous', JSON.stringify({ version: 1, title: 'Canonical Draft' }));
    let exported = exportAllCurevoData();
    expect((exported.data.resumeDrafts as any)?.title).toBe('Canonical Draft');

    // Case B: Fallback to legacy key if canonical not set
    localStorage.removeItem('curevo_builder_draft_v1_anonymous');
    localStorage.setItem('curevo_draft_anonymous_v1', JSON.stringify({ version: 1, title: 'Legacy Draft' }));
    exported = exportAllCurevoData();
    expect((exported.data.resumeDrafts as any)?.title).toBe('Legacy Draft');
  });
});
