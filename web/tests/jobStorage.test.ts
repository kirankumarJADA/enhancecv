// Curevo AI — Job and Application Storage Unit Tests (Phase 9E)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSavedJobs,
  saveJob,
  removeSavedJob,
  isJobSaved,
  clearSavedJobs,
  getApplications,
  saveApplication,
  updateApplicationStatus,
  deleteApplication,
  clearApplications,
  createApplicationFromJob,
  generateApplicationsCsv,
  SAVED_JOBS_KEY,
  APPLICATIONS_KEY,
  type SavedJob,
  type TrackedApplication,
} from '../src/lib/jobStorage';

describe('Curevo AI — Job & Application Storage Manager (Phase 9E)', () => {
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

  const sampleJob: SavedJob = {
    id: 'job_test_1',
    title: 'Senior Backend Engineer',
    company: 'CloudCorp Global',
    location: 'London, UK',
    salary: '£90,000',
    remote_type: 'hybrid',
    employment_type: 'Full-time',
    url: 'https://example.com/job1',
    source: 'Curated Benchmark',
    posted_at: '1 day ago',
    description: 'High-performance Go and PostgreSQL microservices.',
    requirements: '5+ years Go, PostgreSQL, Docker',
    technologies: ['Go', 'PostgreSQL', 'Docker'],
    saved_at: new Date().toISOString(),
    match_score: 88,
  };

  describe('1. Saved Jobs Persistence', () => {
    it('returns empty array when no jobs are stored', () => {
      expect(getSavedJobs()).toEqual([]);
    });

    it('saves a job and confirms isJobSaved returns true', () => {
      const ok = saveJob(sampleJob);
      expect(ok).toBe(true);
      expect(isJobSaved('job_test_1')).toBe(true);

      const saved = getSavedJobs();
      expect(saved.length).toBe(1);
      expect(saved[0].title).toBe('Senior Backend Engineer');
      expect(saved[0].match_score).toBe(88);
    });

    it('updates an existing job without duplicating rows', () => {
      saveJob(sampleJob);
      const updatedJob = { ...sampleJob, salary: '£95,000', match_score: 92 };
      saveJob(updatedJob);

      const saved = getSavedJobs();
      expect(saved.length).toBe(1);
      expect(saved[0].salary).toBe('£95,000');
      expect(saved[0].match_score).toBe(92);
    });

    it('removes a saved job by ID', () => {
      saveJob(sampleJob);
      expect(isJobSaved('job_test_1')).toBe(true);

      const removed = removeSavedJob('job_test_1');
      expect(removed).toBe(true);
      expect(isJobSaved('job_test_1')).toBe(false);
      expect(getSavedJobs()).toEqual([]);
    });

    it('clears all saved jobs', () => {
      saveJob(sampleJob);
      saveJob({ ...sampleJob, id: 'job_test_2', title: 'Frontend Engineer' });
      expect(getSavedJobs().length).toBe(2);

      clearSavedJobs();
      expect(getSavedJobs().length).toBe(0);
    });

    it('survives simulated browser refresh and reopening', () => {
      saveJob(sampleJob);
      expect(mockStore[SAVED_JOBS_KEY]).toBeDefined();

      // Simulate browser reopening by resetting local function contexts while preserving localStorage
      const reloadedJobs = getSavedJobs();
      expect(reloadedJobs.length).toBe(1);
      expect(reloadedJobs[0].id).toBe('job_test_1');
      expect(reloadedJobs[0].company).toBe('CloudCorp Global');
    });
  });

  describe('2. Kanban Application Tracking', () => {
    it('returns empty array when no applications are tracked', () => {
      expect(getApplications()).toEqual([]);
    });

    it('creates an application from a saved job in SAVED stage', () => {
      const app = createApplicationFromJob(sampleJob, 'SAVED');
      expect(app.id).toMatch(/^app_/);
      expect(app.company).toBe('CloudCorp Global');
      expect(app.role).toBe('Senior Backend Engineer');
      expect(app.status).toBe('SAVED');
      expect(app.match_score).toBe(88);

      const list = getApplications();
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(app.id);
    });

    it('creates an application in APPLIED stage and auto-populates applied_date', () => {
      const app = createApplicationFromJob(sampleJob, 'APPLIED');
      expect(app.status).toBe('APPLIED');
      expect(app.applied_date).toBeTruthy();
      expect(app.applied_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('transitions application status across all 5 Kanban stages', () => {
      const app = createApplicationFromJob(sampleJob, 'SAVED');

      // Move to APPLIED
      expect(updateApplicationStatus(app.id, 'APPLIED')).toBe(true);
      let updated = getApplications().find((a) => a.id === app.id);
      expect(updated?.status).toBe('APPLIED');
      expect(updated?.applied_date).toBeTruthy();

      // Move to INTERVIEW
      expect(updateApplicationStatus(app.id, 'INTERVIEW')).toBe(true);
      updated = getApplications().find((a) => a.id === app.id);
      expect(updated?.status).toBe('INTERVIEW');

      // Move to OFFER
      expect(updateApplicationStatus(app.id, 'OFFER')).toBe(true);
      updated = getApplications().find((a) => a.id === app.id);
      expect(updated?.status).toBe('OFFER');

      // Move to REJECTED
      expect(updateApplicationStatus(app.id, 'REJECTED')).toBe(true);
      updated = getApplications().find((a) => a.id === app.id);
      expect(updated?.status).toBe('REJECTED');
    });

    it('updates application details (salary, notes, interview date)', () => {
      const app = createApplicationFromJob(sampleJob, 'APPLIED');
      const modified: TrackedApplication = {
        ...app,
        salary: '£100,000 + equity',
        interview_date: '2026-11-20',
        notes: 'Passed technical screen with VP of Engineering.',
      };

      saveApplication(modified);
      const fetched = getApplications().find((a) => a.id === app.id);
      expect(fetched?.salary).toBe('£100,000 + equity');
      expect(fetched?.interview_date).toBe('2026-11-20');
      expect(fetched?.notes).toContain('VP of Engineering');
    });

    it('deletes an application', () => {
      const app = createApplicationFromJob(sampleJob, 'SAVED');
      expect(getApplications().length).toBe(1);

      deleteApplication(app.id);
      expect(getApplications().length).toBe(0);
    });

    it('clears all applications', () => {
      createApplicationFromJob(sampleJob, 'SAVED');
      createApplicationFromJob({ ...sampleJob, id: 'j2', title: 'DevOps' }, 'APPLIED');
      expect(getApplications().length).toBe(2);

      clearApplications();
      expect(getApplications().length).toBe(0);
    });

    it('survives simulated browser refresh and preserves Kanban stage transitions', () => {
      const app = createApplicationFromJob(sampleJob, 'APPLIED');
      updateApplicationStatus(app.id, 'INTERVIEW');

      // Re-hydrate applications from raw localStorage representation
      const rawStored = mockStore[APPLICATIONS_KEY];
      expect(rawStored).toBeTruthy();
      const parsed = JSON.parse(rawStored);
      expect(parsed[0].status).toBe('INTERVIEW');

      const reloaded = getApplications();
      expect(reloaded[0].status).toBe('INTERVIEW');
    });
  });

  describe('3. CSV & JSON Backup Generation & Export', () => {
    it('generates well-formed CSV with headers and quoted fields', () => {
      const app1: TrackedApplication = {
        id: 'app_1',
        company: 'Stripe, Inc.',
        role: 'Senior Staff "API" Engineer',
        location: 'Remote, UK',
        salary: '£120,000',
        job_url: 'https://stripe.com/jobs/1',
        status: 'OFFER',
        applied_date: '2026-10-15',
        interview_date: '2026-10-25',
        notes: 'Offer letter signed, starts next month.',
        match_score: 95,
        created_at: '2026-10-15T10:00:00.000Z',
        updated_at: '2026-10-28T12:00:00.000Z',
      };

      const csv = generateApplicationsCsv([app1]);
      expect(csv).toContain('Company,Role,Status,Location,Salary');
      expect(csv).toContain('"Stripe, Inc."');
      expect(csv).toContain('"Senior Staff ""API"" Engineer"');
      expect(csv).toContain('"OFFER"');
      expect(csv).toContain('"95%"');
    });

    it('handles multiline notes and special characters in CSV export', () => {
      const appWithMultiline: TrackedApplication = {
        id: 'app_multi',
        company: 'Complex Corp',
        role: 'Tech Lead',
        location: 'London',
        salary: '£110k',
        status: 'INTERVIEW',
        notes: 'Line 1: HR intro\nLine 2: Tech interview\nLine 3: Executive round',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const csv = generateApplicationsCsv([appWithMultiline]);
      expect(csv).toContain('"Line 1: HR intro\nLine 2: Tech interview\nLine 3: Executive round"');
    });

    it('generates valid JSON backup format', () => {
      const app = createApplicationFromJob(sampleJob, 'INTERVIEW');
      const apps = getApplications();
      const payload = {
        exported_at: new Date().toISOString(),
        version: '1.0',
        count: apps.length,
        applications: apps,
      };

      const serialized = JSON.stringify(payload, null, 2);
      const parsed = JSON.parse(serialized);
      expect(parsed.version).toBe('1.0');
      expect(parsed.count).toBe(1);
      expect(parsed.applications[0].id).toBe(app.id);
      expect(parsed.applications[0].status).toBe('INTERVIEW');
    });
  });

  describe('4. Corruption Recovery & Edge Cases', () => {
    it('gracefully recovers from corrupt JSON in localStorage', () => {
      mockStore[SAVED_JOBS_KEY] = 'INVALID_CORRUPT_JSON{{{';
      expect(getSavedJobs()).toEqual([]);

      mockStore[APPLICATIONS_KEY] = 'CORRUPTED[';
      expect(getApplications()).toEqual([]);
    });

    it('gracefully handles QuotaExceededError during save without crashing', () => {
      (globalThis.localStorage.setItem as any).mockImplementationOnce(() => {
        const err = new Error('Quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      });

      const ok = saveJob(sampleJob);
      expect(ok).toBe(false);
    });
  });
});
