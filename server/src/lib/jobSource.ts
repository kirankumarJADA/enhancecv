// Job source provider abstraction for job discovery.
//
// Providers are configured purely via environment variables:
//   JOBS_API_URL      — generic JSON source; `{query}` placeholder replaced
//                       with the URL-encoded search preferences; expected to
//                       return an array of job objects (normalised below).
//   JOBS_API_KEY      — optional bearer token.
// With no configuration, discovery returns an honest
// JOB_SOURCE_NOT_CONFIGURED error — never fabricated listings.
//
// The normaliser accepts several common field spellings and always produces
// the internal schema. Jobs are informational data; Curevo never ranks one
// job as "best".

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
}

export interface JobSourceProvider {
  id: string;
  search(preferences: JobSearchPreferences, limit: number): Promise<DiscoveredJob[]>;
}

class NoneProvider implements JobSourceProvider {
  id = 'none';
  async search(): Promise<DiscoveredJob[]> {
    throw new Error('JOB_SOURCE_NOT_CONFIGURED');
  }
}

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
    remote_type: /remote/i.test(asString(raw.remote_type ?? remoteHint(description, locationless(raw)))) ? 'remote' : asString(raw.remote_type).slice(0, 40),
    url: asString(raw.url ?? raw.link ?? raw.job_url ?? raw.apply_url).slice(0, 500),
    source: asString(raw.source) || source,
    posted_at: asString(raw.posted_at ?? raw.created ?? raw.date ?? raw.publication_date).slice(0, 40),
    description: description.slice(0, 20000),
    requirements: asString(raw.requirements ?? raw.qualifications).slice(0, 5000),
    technologies: Array.isArray(tech) ? tech.map((t) => asString(t)).filter(Boolean).slice(0, 30) : asString(tech).split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 30),
  };
}

function locationless(raw: Record<string, unknown>): string {
  return asString(raw.location ?? '');
}
function remoteHint(description: string, location: string): string {
  return /remote|work from home|wfh/i.test(`${description} ${location}`) ? 'remote' : '';
}

function buildQuery(p: JobSearchPreferences): string {
  return [p.title, p.keywords, p.location, p.remoteType, p.employmentType, p.industry, p.experienceLevel ? `${p.experienceLevel} level` : '']
    .filter(Boolean)
    .join(' ');
}

class GenericHttpProvider implements JobSourceProvider {
  id = 'generic-http';
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
      : Array.isArray((data as { jobs?: unknown[]; results?: unknown[]; data?: unknown[] }).jobs)
        ? (data as { jobs: unknown[] }).jobs
        : Array.isArray((data as { results?: unknown[] }).results)
          ? (data as { results: unknown[] }).results
          : Array.isArray((data as { data?: unknown[] }).data)
            ? (data as { data: unknown[] }).data
            : [];
    return list.slice(0, limit).map((j) => normaliseJob(j as Record<string, unknown>, 'external-api'));
  }
}

let provider: JobSourceProvider | null = null;

export function getJobSourceProvider(): JobSourceProvider {
  if (provider) return provider;
  if (process.env.JOBS_API_URL) {
    provider = new GenericHttpProvider();
  } else {
    provider = new NoneProvider();
  }
  return provider;
}

export function isJobSourceConfigured(): boolean {
  return !(getJobSourceProvider() instanceof NoneProvider);
}

/** Tests only. */
export function __setJobSourceProviderForTests(p: JobSourceProvider | null): void {
  provider = p;
}

export { buildQuery };
