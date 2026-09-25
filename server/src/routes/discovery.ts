// Job discovery: provider-based search, URL import (SSRF-safe) and the saved
// jobs store. Every discovered/imported job is run through the deterministic
// JD analysis + CV/JD match so the user sees transparent fit fields — never a
// "best job" ranking.

import { Router } from 'express';
import { z } from 'zod';
import { getDb, newId, TS_TEXT } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { getJobSourceProvider, type JobSearchPreferences } from '../lib/jobSource';
import { getPageFetcher } from '../lib/urlFetch';
import { analyseJobDescription } from '../engine/jd';
import { computeJobMatch } from '../engine/match';
import { analyseATS } from '../engine/ats';
import { getMasterRow, resumeRowToData } from './master';
import { enforceQuota, recordUsage } from '../lib/plans';
import { track } from '../lib/analytics';

const router = Router();

const SAVED_FIELDS = `id, user_id, company, title, location, salary, employment_type, remote_type, url, source, posted_at,
  description, requirements, technologies, status, match_score,
  ${TS_TEXT('created_at')} AS created_at`;

async function getMaster(userId: string) {
  const row = await getMasterRow(getDb(), userId);
  if (!row) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);
  return resumeRowToData(row);
}

interface SavedJobRow {
  id: string;
  user_id: string;
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
  technologies: string;
  status: 'SAVED' | 'DISMISSED';
  match_score: number | null;
  created_at: string;
}

function fitSummary(master: ReturnType<typeof resumeRowToData>, masterAts: number, description: string, requirements: string, tech: string[]): object {
  // Transparent informational fields — not recommendations.
  const jd = analyseJobDescription(`${description}\n${requirements}\n${tech.join(', ')}`);
  const match = computeJobMatch(master, jd);
  return {
    matchPercentage: match.score,
    matchedRequirements: match.matchedSkills,
    missingRequirements: match.missingSkills,
    partialRequirements: match.partialSkills,
    relevantEvidence: match.items.filter((i) => i.status === 'matched').slice(0, 6).map((i) => ({ requirement: i.requirement, evidence: i.evidence })),
    experienceGaps: match.items.filter((i) => i.type === 'required' && i.status === 'missing').slice(0, 6).map((i) => i.requirement),
    atsObservation: `Your Master CV ATS compatibility is ${masterAts}/100 (deterministic measure of the document, not of this job listing). Keyword coverage for this posting: ${match.keywordCoverage.percent}%.`,
  };
}

// --- discovery search -----------------------------------------------------------

router.post('/discover', requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const body = z.object({
    title: z.string().max(120).optional(),
    keywords: z.string().max(200).optional(),
    location: z.string().max(120).optional(),
    remoteType: z.string().max(40).optional(),
    salary: z.string().max(80).optional(),
    experienceLevel: z.string().max(40).optional(),
    employmentType: z.string().max(40).optional(),
    industry: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(20).optional().default(10),
  }).parse(req.body);
  const uid = req.user!.uid;

  await enforceQuota(uid, 'jobSearch');
  const master = await getMaster(uid);
  const masterAts = analyseATS(master).overallScore;

  const provider = getJobSourceProvider();
  let discovered;
  try {
    discovered = await provider.search(body as JobSearchPreferences, body.limit);
  } catch (err) {
    if (err instanceof Error && err.message === 'JOB_SOURCE_NOT_CONFIGURED') {
      throw new AppError('JOB_SOURCE_NOT_CONFIGURED', 'No job source is configured for this deployment. Configure JOBS_API_URL to enable discovery — or import a job by URL / paste instead.', 503);
    }
    throw new AppError('JOB_SEARCH_FAILED', 'The job source could not be reached. Try again shortly.', 502);
  }

  // Score each job against the Master CV and persist as saved jobs.
  const results = [];
  for (const job of discovered) {
    if (!job.title) continue;
    const fit = fitSummary(master, masterAts, job.description, job.requirements, job.technologies);
    const id = newId('job');
    await getDb().query(
      `INSERT INTO saved_jobs (id, user_id, company, title, location, salary, employment_type, remote_type, url, source, posted_at, description, requirements, technologies, status, match_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'SAVED',$15)`,
      [id, uid, job.company, job.title, job.location, job.salary, job.employment_type, job.remote_type, job.url, job.source, job.posted_at, job.description, job.requirements, job.technologies.join(', '), (fit as { matchPercentage: number }).matchPercentage],
    );
    results.push({ id, ...job, technologies: job.technologies, fit, status: 'SAVED' });
  }

  await getDb().query('INSERT INTO job_searches (id, user_id, preferences, results_returned, provider) VALUES ($1,$2,$3,$4,$5)', [
    newId('jsr'), uid, JSON.stringify(body), results.length, provider.id,
  ]);
  await recordUsage(uid, 'jobSearch');
  track(uid, 'job_search_completed', { results: results.length, provider: provider.id });

  res.status(201).json({ results, provider: provider.id, note: 'Fit fields are informational measurements, not a ranking or recommendation.' });
});

// --- URL import -----------------------------------------------------------------

interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  requirements: string;
}

function metaContent(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i');
  return html.match(re)?.[1] || '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n'))
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Extract job fields from HTML: JSON-LD JobPosting first, then meta/OG, then heuristics. */
export function extractJobFromHtml(html: string): ExtractedJob {
  const out: ExtractedJob = { title: '', company: '', location: '', salary: '', description: '', requirements: '' };

  // 1. JSON-LD (schema.org JobPosting)
  const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldMatches) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...((parsed['@graph'] as unknown[]) || [])];
      const posting = candidates.find((c) => c && typeof c === 'object' && String((c as Record<string, unknown>)['@type']).includes('JobPosting')) as Record<string, unknown> | undefined;
      if (posting) {
        out.title = asStringSafe(posting.title);
        const org = posting.hiringOrganization as Record<string, unknown> | undefined;
        out.company = asStringSafe(org?.name);
        const loc = posting.jobLocation as Record<string, unknown> | undefined;
        const addr = (loc && (loc.address as Record<string, unknown>)) || undefined;
        out.location = asStringSafe([addr?.addressLocality, addr?.addressRegion, addr?.addressCountry].filter(Boolean).join(', '));
        const sal = posting.baseSalary as Record<string, unknown> | undefined;
        const val = sal?.value as Record<string, unknown> | undefined;
        out.salary = val ? `${asStringSafe(val.minValue)}${val.maxValue && val.maxValue !== val.minValue ? `–${asStringSafe(val.maxValue)}` : ''} ${asStringSafe(sal?.currency)}`.trim() : '';
        out.description = stripTags(asStringSafe(posting.description));
        break;
      }
    } catch {
      // malformed JSON-LD — fall through to heuristics
    }
  }

  // 2. Meta / OpenGraph
  if (!out.title) out.title = decodeEntities(metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '')).replace(/\s*[|–-]\s*(LinkedIn|Indeed|Glassdoor).*$/i, '').trim();
  if (!out.company) out.company = decodeEntities(metaContent(html, 'og:site_name'));
  if (!out.description) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) out.description = stripTags(bodyMatch[1]).slice(0, 20000);
  }
  // 3. Salary heuristic
  if (!out.salary) {
    const sm = out.description.match(/(£|\$|€)\s?\d{2,3}[,.]?\d{0,3}(?:[,.]\d{3})?\s*(?:[-–—to]{1,3}\s*(?:£|\$|€)?\s?\d{2,3}[,.]?\d{0,3}(?:[,.]\d{3})?)?\s*(?:k)?\s*(?:per\s*(?:annum|year)|pa|\/year|\/annum)?/i);
    if (sm) out.salary = sm[0].trim();
  }
  if (out.title.length > 200) out.title = out.title.slice(0, 200);
  return out;
}

function asStringSafe(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return typeof v === 'string' ? decodeEntities(v.replace(/<[^>]+>/g, '')).trim() : '';
}

router.post('/import-url', requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const body = z.object({ url: z.string().min(8).max(600) }).parse(req.body);
  const uid = req.user!.uid;
  await enforceQuota(uid, 'urlImport');
  const master = await getMaster(uid);
  const masterAts = analyseATS(master).overallScore;

  const page = await getPageFetcher()(body.url);
  const extracted = extractJobFromHtml(page.body);
  if (!extracted.title || extracted.description.length < 100) {
    throw new AppError('IMPORT_FAILED', 'Could not extract a job posting from this page. The page may require JavaScript or login — paste the job description manually instead.', 422);
  }

  const fit = fitSummary(master, masterAts, extracted.description, extracted.requirements, []);
  const id = newId('job');
  await getDb().query(
    `INSERT INTO saved_jobs (id, user_id, company, title, location, salary, url, source, description, status, match_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'url-import',$8,'SAVED',$9)`,
    [id, uid, extracted.company, extracted.title, extracted.location, extracted.salary, page.url, extracted.description, (fit as { matchPercentage: number }).matchPercentage],
  );
  await recordUsage(uid, 'urlImport');
  track(uid, 'job_url_imported', { hasTitle: !!extracted.title });

  res.status(201).json({
    id,
    job: { ...extracted, url: page.url, source: 'url-import' },
    fit,
  });
});

// --- saved jobs -------------------------------------------------------------------

router.get('/saved', requireAuth, async (req, res) => {
  const status = req.query.status === 'DISMISSED' ? 'DISMISSED' : 'SAVED';
  const rows = (await getDb().query(
    `SELECT ${SAVED_FIELDS} FROM saved_jobs WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 100`,
    [req.user!.uid, status],
  )).rows as unknown as SavedJobRow[];
  res.json({
    savedJobs: rows.map((r) => ({
      ...r,
      technologies: r.technologies ? r.technologies.split(', ').filter(Boolean) : [],
    })),
  });
});

router.patch('/saved/:id', requireAuth, async (req, res) => {
  const body = z.object({ status: z.enum(['SAVED', 'DISMISSED']) }).parse(req.body);
  const row = (await getDb().query('SELECT id, user_id FROM saved_jobs WHERE id = $1', [req.params.id])).rows[0] as
    | { id: string; user_id: string }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Saved job not found.', 404);
  if (row.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  await getDb().query('UPDATE saved_jobs SET status = $1 WHERE id = $2', [body.status, row.id]);
  res.json({ ok: true });
});

router.delete('/saved/:id', requireAuth, async (req, res) => {
  const row = (await getDb().query('SELECT id, user_id FROM saved_jobs WHERE id = $1', [req.params.id])).rows[0] as
    | { id: string; user_id: string }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Saved job not found.', 404);
  if (row.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  await getDb().query('DELETE FROM saved_jobs WHERE id = $1', [row.id]);
  res.json({ ok: true });
});

/** Analyse a saved job through the full deterministic pipeline (JD + fit). */
router.post('/saved/:id/analyse', requireAuth, rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const row = (await getDb().query('SELECT id, user_id, description, requirements, technologies FROM saved_jobs WHERE id = $1', [req.params.id])).rows[0] as
    | { id: string; user_id: string; description: string; requirements: string; technologies: string }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Saved job not found.', 404);
  if (row.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  const master = await getMaster(req.user!.uid);
  const masterAts = analyseATS(master).overallScore;
  const fit = fitSummary(master, masterAts, row.description, row.requirements, row.technologies ? row.technologies.split(', ') : []);
  res.json({ fit });
});


/** Import a job from user-provided fields (browser extension extraction or manual paste). */
router.post('/import-paste', requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const body = z.object({
    url: z.string().max(600).optional().default(''),
    title: z.string().trim().min(3).max(200),
    company: z.string().trim().max(160).optional().default(''),
    location: z.string().trim().max(160).optional().default(''),
    salary: z.string().trim().max(120).optional().default(''),
    description: z.string().trim().min(100).max(40000),
  }).parse(req.body);
  const uid = req.user!.uid;
  await enforceQuota(uid, 'urlImport');
  const master = await getMaster(uid);
  const masterAts = analyseATS(master).overallScore;

  if (body.url) {
    // Validate user-supplied URL through the same SSRF guard (stored, not fetched).
    const { assertSafeUrl } = await import('../lib/urlFetch');
    assertSafeUrl(body.url);
  }

  const fit = fitSummary(master, masterAts, body.description, '', []);
  const id = newId('job');
  await getDb().query(
    `INSERT INTO saved_jobs (id, user_id, company, title, location, salary, url, source, description, status, match_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'extension',$8,'SAVED',$9)`,
    [id, uid, body.company, body.title, body.location, body.salary, body.url, body.description, (fit as { matchPercentage: number }).matchPercentage],
  );
  await recordUsage(uid, 'urlImport');
  track(uid, 'job_url_imported', { viaExtension: true });

  res.status(201).json({ id, job: { ...body, source: 'extension' }, fit });
});

export default router;
