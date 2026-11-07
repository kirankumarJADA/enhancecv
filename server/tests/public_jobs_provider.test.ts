import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import {
  getJobSourceProvider,
  isJobSourceConfigured,
  searchJobsWithCache,
  __setJobSourceProviderForTests,
  type JobSourceProvider,
  type DiscoveredJob,
  type JobSearchPreferences,
} from '../src/lib/jobSource';

describe('Public Job Source Providers & Caching (Phase 9I)', () => {
  let app: any;

  beforeEach(async () => {
    app = await buildApp();
    __setJobSourceProviderForTests(null);
  });

  afterEach(() => {
    __setJobSourceProviderForTests(null);
  });

  it('reports unconfigured status and curated fallback when no provider env is set', async () => {
    const res = await request(app).get('/api/public/jobs/status');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.configured).toBe(false);
    expect(res.body.provider).toBe('curated-presets');
    expect(res.body.message).toContain('curated benchmark');
  });

  it('serves curated benchmark jobs from discover endpoint when unconfigured', async () => {
    const res = await request(app)
      .post('/api/public/jobs/discover')
      .send({ query: 'engineer', limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.source).toBe('curated-presets');
    expect(res.body.jobs.length).toBeGreaterThan(0);
    expect(res.body.jobs[0]).toHaveProperty('title');
    expect(res.body.jobs[0]).toHaveProperty('company');
  });

  it('delegates to custom provider and caches repeated search calls', async () => {
    let callCount = 0;
    const mockProvider: JobSourceProvider = {
      id: 'mock-adzuna',
      name: 'Mock Adzuna API',
      async search(prefs: JobSearchPreferences, limit: number): Promise<DiscoveredJob[]> {
        callCount++;
        return [
          {
            company: 'Acme Cloud UK',
            title: 'Lead SRE',
            location: 'London',
            salary: '£90,000 - £110,000',
            employment_type: 'Full-time',
            remote_type: 'hybrid',
            url: 'https://example.com/job/1',
            source: 'Mock Adzuna API',
            posted_at: '2026-11-06',
            description: 'Leading site reliability engineering teams.',
            requirements: 'Kubernetes, Terraform, AWS',
            technologies: ['Kubernetes', 'Terraform', 'AWS'],
          },
        ];
      },
    };

    __setJobSourceProviderForTests(mockProvider);

    expect(isJobSourceConfigured()).toBe(true);
    expect(getJobSourceProvider().id).toBe('mock-adzuna');

    // First search call
    const results1 = await searchJobsWithCache({ keywords: 'sre' }, 10);
    expect(results1.length).toBe(1);
    expect(callCount).toBe(1);

    // Second search call with identical params should hit cache
    const results2 = await searchJobsWithCache({ keywords: 'sre' }, 10);
    expect(results2.length).toBe(1);
    expect(callCount).toBe(1); // Call count didn't increase

    // API Discover endpoint should return live provider metadata
    const res = await request(app)
      .post('/api/public/jobs/discover')
      .send({ query: 'sre' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.source).toBe('mock-adzuna');
    expect(res.body.providerName).toBe('Mock Adzuna API');
    expect(res.body.jobs[0].company).toBe('Acme Cloud UK');
  });
});
