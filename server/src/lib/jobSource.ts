// Curevo AI — Live Job Discovery Provider Abstraction (Phase 9I)
//
// 100% Truth-grounded job search engine.
// Supports multiple real job API providers:
//   1. Adzuna UK API (via ADZUNA_APP_ID & ADZUNA_APP_KEY)
//   2. Reed UK API (via REED_API_KEY)
//   3. Generic HTTP JSON provider (via JOBS_API_URL & optional JOBS_API_KEY)
//   4. NoneProvider (returns honest unconfigured status + curated benchmarks)
//
// Invariants:
// - Never scrape websites or violate provider terms of service.
// - Never fabricate live vacancies.
// - Transparent source attribution on every listing.
// - In-memory query caching & deduplication to respect provider rate limits.

export interface DiscoveredJob {
  company: string;
  title: string;
  location: string;
  salary: string;
  employment_type: string;
  remote_type: string;
  url: string;
  source: string;
  posted_at: string;
  description: string;
  requirements: string;
  technologies: string[];
}

export interface JobSearchPreferences {
  title?: string;
  keywords?: string;
  location?: string;
  remoteType?: string; // remote | hybrid | on-site
  salary?: string;
  experienceLevel?: string;
  employmentType?: string;
  industry?: string;
  page?: number;
}

export interface JobSourceProvider {
  id: string;
  name: string;
  search(preferences: JobSearchPreferences, limit: number): Promise<DiscoveredJob[]>;
}

// ---------------------------------------------------------------------------
// 1. NoneProvider (Fallback)
// ---------------------------------------------------------------------------

class NoneProvider implements JobSourceProvider {
  id = 'none';
  name = 'Curated Presets Fallback';
  async search(): Promise<DiscoveredJob[]> {
    throw new Error('JOB_SOURCE_NOT_CONFIGURED');
  }
}

// ---------------------------------------------------------------------------
// 2. Adzuna UK Provider
// ---------------------------------------------------------------------------

export class AdzunaProvider implements JobSourceProvider {
  id = 'adzuna';
  name = 'Adzuna UK API';

  private appId: string;
  private appKey: string;
  private country: string;

  constructor(appId: string, appKey: string, country = 'gb') {
    this.appId = appId;
    this.appKey = appKey;
    this.country = country;
  }

  async search(preferences: JobSearchPreferences, limit: number): Promise<DiscoveredJob[]> {
    const page = preferences.page || 1;
    const what = [preferences.title, preferences.keywords, preferences.industry].filter(Boolean).join(' ');
    const where = preferences.location || '';

    const params = new URLSearchParams({
      app_id: this.appId,
      app_key: this.appKey,
      results_per_page: String(Math.min(limit, 50)),
      'content-type': 'application/json',
    });

    if (what) params.set('what', what);
    if (where) params.set('where', where);
    if (preferences.employmentType === 'full-time' || preferences.employmentType === 'permanent') {
      params.set('full_time', '1');
    } else if (preferences.employmentType === 'contract') {
      params.set('contract', '1');
    }

    const endpoint = `https://api.adzuna.com/v1/api/jobs/${this.country}/search/${page}?${params.toString()}`;

    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Adzuna API returned status ${res.status}`);
    }

    const data = (await res.json()) as { results?: any[] };
    const rawList = Array.isArray(data.results) ? data.results : [];

    return deduplicateJobs(
      rawList.map((j) => {
        const title = String(j.title || '').replace(/<[^>]+>/g, '').trim();
        const description = String(j.description || '').replace(/<[^>]+>/g, '').trim();
        const company = String(j.company?.display_name || 'Direct Employer').trim();
        const loc = String(j.location?.display_name || preferences.location || 'UK').trim();

        // Salary formatting
        let salaryStr = '';
        if (j.salary_min && j.salary_max) {
          salaryStr = `£${Math.round(j.salary_min).toLocaleString()} - £${Math.round(j.salary_max).toLocaleString()}`;
        } else if (j.salary_min) {
          salaryStr = `From £${Math.round(j.salary_min).toLocaleString()}`;
        } else if (j.salary_is_predicted === '1') {
          salaryStr = 'Competitive';
        }

        const isRemote =
          /remote|work from home|wfh/i.test(`${title} ${description} ${loc}`) ||
          preferences.remoteType === 'remote';

        return {
          company: company.slice(0, 160),
          title: title.slice(0, 200),
          location: loc.slice(0, 160),
          salary: salaryStr || 'Competitive',
          employment_type: j.contract_type === 'contract' ? 'Contract' : 'Full-time',
          remote_type: isRemote ? 'remote' : 'on-site',
          url: String(j.redirect_url || ''),
          source: 'Adzuna UK',
          posted_at: String(j.created || new Date().toISOString().slice(0, 10)),
          description: description.slice(0, 20_000),
          requirements: extractRequirementsSnippet(description),
          technologies: extractTechKeywords(`${title} ${description}`),
        };
      })
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Reed UK Provider
// ---------------------------------------------------------------------------

export class ReedProvider implements JobSourceProvider {
  id = 'reed';
  name = 'Reed UK API';

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(preferences: JobSearchPreferences, limit: number): Promise<DiscoveredJob[]> {
    const keywords = [preferences.title, preferences.keywords].filter(Boolean).join(' ');
    const params = new URLSearchParams({
      keywords,
      locationName: preferences.location || 'United Kingdom',
      resultsToTake: String(Math.min(limit, 50)),
    });

    const endpoint = `https://www.reed.co.uk/api/1.0/search?${params.toString()}`;

    const authHeader = 'Basic ' + Buffer.from(`${this.apiKey}:`).toString('base64');
    const res = await fetch(endpoint, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      throw new Error(`Reed API returned status ${res.status}`);
    }

    const data = (await res.json()) as { results?: any[] };
    const rawList = Array.isArray(data.results) ? data.results : [];

    return deduplicateJobs(
      rawList.map((j) => {
        const title = String(j.jobTitle || '').trim();
        const description = String(j.jobDescription || '').replace(/<[^>]+>/g, '').trim();
        const company = String(j.employerName || 'Direct Employer').trim();
        const loc = String(j.locationName || 'UK').trim();

        let salaryStr = '';
        if (j.minimumSalary && j.maximumSalary) {
          salaryStr = `£${Math.round(j.minimumSalary).toLocaleString()} - £${Math.round(j.maximumSalary).toLocaleString()}`;
        } else if (j.minimumSalary) {
          salaryStr = `From £${Math.round(j.minimumSalary).toLocaleString()}`;
        }

        const isRemote = /remote|work from home|wfh/i.test(`${title} ${description} ${loc}`);

        return {
          company: company.slice(0, 160),
          title: title.slice(0, 200),
          location: loc.slice(0, 160),
          salary: salaryStr || 'Competitive',
          employment_type: 'Full-time',
          remote_type: isRemote ? 'remote' : 'on-site',
          url: String(j.jobUrl || ''),
          source: 'Reed UK',
          posted_at: String(j.date || new Date().toISOString().slice(0, 10)),
          description: description.slice(0, 20_000),
          requirements: extractRequirementsSnippet(description),
          technologies: extractTechKeywords(`${title} ${description}`),
        };
      })
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Generic HTTP Provider
// ---------------------------------------------------------------------------

function asString(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(asString).filter(Boolean).join(', ');
  return String(v);
}

function normaliseJob(raw: Record<string, unknown>, source: string): DiscoveredJob {
  const title = asString(raw.title ?? raw.position ?? raw.job_title ?? raw.name);
  const description = asString(raw.description ?? raw.description_text ?? raw.body ?? raw.contents);
  const tech = raw.technologies ?? raw.tech ?? raw.skills ?? raw.key_skills;
  return {
    company: asString(raw.company ?? raw.company_name ?? raw.organization).slice(0, 160),
    title: title.slice(0, 200),
    location: asString(raw.location ?? raw.job_location ?? raw.where).slice(0, 160),
    salary: asString(raw.salary ?? raw.salary_min ?? raw.salary_max ?? raw.compensation).slice(0, 120),
    employment_type: asString(raw.employment_type ?? raw.type ?? raw.job_type).slice(0, 60),
    remote_type: /remote/i.test(asString(raw.remote_type ?? remoteHint(description, asString(raw.location))))
      ? 'remote'
      : asString(raw.remote_type).slice(0, 40),
    url: asString(raw.url ?? raw.link ?? raw.job_url ?? raw.apply_url).slice(0, 500),
    source: asString(raw.source) || source,
    posted_at: asString(raw.posted_at ?? raw.created ?? raw.date ?? raw.publication_date).slice(0, 40),
    description: description.slice(0, 20_000),
    requirements: asString(raw.requirements ?? raw.qualifications).slice(0, 5000),
    technologies: Array.isArray(tech)
      ? tech.map((t) => asString(t)).filter(Boolean).slice(0, 30)
      : asString(tech).split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 30),
  };
}

function remoteHint(description: string, location: string): string {
  return /remote|work from home|wfh/i.test(`${description} ${location}`) ? 'remote' : '';
}

function buildQuery(p: JobSearchPreferences): string {
  return [
    p.title,
    p.keywords,
    p.location,
    p.remoteType,
    p.employmentType,
    p.industry,
    p.experienceLevel ? `${p.experienceLevel} level` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export class GenericHttpProvider implements JobSourceProvider {
  id = 'generic-http';
  name = 'Custom HTTP Job Feed';

  async search(preferences: JobSearchPreferences, limit: number): Promise<DiscoveredJob[]> {
    const base = process.env.JOBS_API_URL || '';
    const url = base.replace('{query}', encodeURIComponent(buildQuery(preferences)));
    const res = await fetch(url, {
      headers: process.env.JOBS_API_KEY ? { Authorization: `Bearer ${process.env.JOBS_API_KEY}` } : {},
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new Error(`jobs api status=${res.status}`);
    }
    const data = (await res.json()) as unknown;
    const list = Array.isArray(data)
      ? data
      : Array.isArray((data as { jobs?: unknown[] }).jobs)
      ? (data as { jobs: unknown[] }).jobs
      : Array.isArray((data as { results?: unknown[] }).results)
      ? (data as { results: unknown[] }).results
      : Array.isArray((data as { data?: unknown[] }).data)
      ? (data as { data: unknown[] }).data
      : [];

    return deduplicateJobs(list.slice(0, limit).map((j) => normaliseJob(j as Record<string, unknown>, 'external-api')));
  }
}

// ---------------------------------------------------------------------------
// Helpers: Deduplication & Extraction
// ---------------------------------------------------------------------------

function deduplicateJobs(jobs: DiscoveredJob[]): DiscoveredJob[] {
  const seen = new Set<string>();
  const out: DiscoveredJob[] = [];
  for (const j of jobs) {
    const key = `${j.company.toLowerCase()}|${j.title.toLowerCase()}|${j.location.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(j);
    }
  }
  return out;
}

function extractRequirementsSnippet(desc: string): string {
  const match = desc.match(/(?:requirements|qualifications|what you need|skills required)[:\s]+([^.]+)/i);
  return match ? match[1].slice(0, 300) : desc.slice(0, 200);
}

const COMMON_TECH = [
  'TypeScript', 'JavaScript', 'React', 'Node.js', 'Python', 'Go', 'Java', 'C#',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS',
  'GCP', 'Azure', 'GraphQL', 'Next.js', 'Tailwind', 'Git', 'Linux', 'Terraform',
];

function extractTechKeywords(text: string): string[] {
  const found: string[] = [];
  for (const t of COMMON_TECH) {
    const re = new RegExp(`\\b${t.replace('.', '\\.')}\\b`, 'i');
    if (re.test(text)) found.push(t);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Provider Resolution with In-Memory Cache
// ---------------------------------------------------------------------------

const searchCache = new Map<string, { timestamp: number; jobs: DiscoveredJob[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let customProvider: JobSourceProvider | null = null;

export function getJobSourceProvider(): JobSourceProvider {
  if (customProvider) return customProvider;

  // 1. Check Adzuna UK credentials
  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    return new AdzunaProvider(process.env.ADZUNA_APP_ID, process.env.ADZUNA_APP_KEY);
  }

  // 2. Check Reed UK credentials
  if (process.env.REED_API_KEY) {
    return new ReedProvider(process.env.REED_API_KEY);
  }

  // 3. Check Generic HTTP URL
  if (process.env.JOBS_API_URL) {
    return new GenericHttpProvider();
  }

  return new NoneProvider();
}

export function isJobSourceConfigured(): boolean {
  return !(getJobSourceProvider() instanceof NoneProvider);
}

export async function searchJobsWithCache(
  preferences: JobSearchPreferences,
  limit: number
): Promise<DiscoveredJob[]> {
  const cacheKey = JSON.stringify({ ...preferences, limit });
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.jobs;
  }

  const providerInstance = getJobSourceProvider();
  const jobs = await providerInstance.search(preferences, limit);
  searchCache.set(cacheKey, { timestamp: Date.now(), jobs });
  return jobs;
}

export function __setJobSourceProviderForTests(p: JobSourceProvider | null): void {
  customProvider = p;
  searchCache.clear();
}

export { buildQuery };
