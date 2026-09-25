// AI endpoints: status + on-demand critique of an existing resume version.
// The main tailoring flow stays on POST /api/jobs/:id/tailor (which uses the
// agent internally); this router adds AI-specific operations.

import { Router } from 'express';
import { z } from 'zod';
import { getDb, newId } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { getAiStatus } from '../ai/provider';
import { critiqueResume } from '../ai/resumeAgent';
import { generateCoverLetter } from '../ai/coverLetterAgent';
import { generateLinkedinSuggestions } from '../ai/linkedinAgent';
import { suggestGrammarImprovements } from '../ai/grammarAgent';
import { translateResume, SUPPORTED_LANGUAGES } from '../ai/localizationAgent';
import { researchCompany } from '../ai/companyResearchAgent';
import { resolveSearchProvider } from '../lib/webSearch';
import { getMasterRow, resumeRowToData } from './master';
import { analyseJobDescription } from '../engine/jd';
import { analyseATS } from '../engine/ats';
import { computeJobMatch } from '../engine/match';
import { enforceQuota, getUsage, recordUsage } from '../lib/plans';
import { track } from '../lib/analytics';
import { renderCoverLetterPdf } from '../engine/pdf';
import { JobAnalysis } from '../types';

const router = Router();

/** Public (auth'd) AI status — never includes credentials. */
router.get('/status', requireAuth, (_req, res) => {
  res.json(getAiStatus());
});

/** Current plan + monthly usage for the authenticated user. */
router.get('/usage', requireAuth, async (req, res) => {
  const usage = await getUsage(req.user!.uid);
  res.json({ ...usage, aiConfigured: getAiStatus().enabled });
});

// --- shared helpers -----------------------------------------------------------

async function loadResumeOwned(resumeId: string, userId: string) {
  const row = (await getDb().query('SELECT id, user_id, title, content, job_id FROM resumes WHERE id = $1', [resumeId])).rows[0] as
    | { id: string; user_id: string; title: string; content: string; job_id: string | null }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Resume not found.', 404);
  if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  return row;
}

async function loadJobOwned(jobId: string | null | undefined, userId: string): Promise<{ job: JobAnalysis | null; jdText: string | null; jobId: string | null }> {
  if (!jobId) return { job: null, jdText: null, jobId: null };
  const row = (await getDb().query('SELECT id, user_id, raw_text FROM job_descriptions WHERE id = $1', [jobId])).rows[0] as
    | { id: string; user_id: string; raw_text: string }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
  if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  const analysisRow = (
    await getDb().query('SELECT analysis FROM job_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1', [row.id])
  ).rows[0] as { analysis: string } | undefined;
  return {
    job: analysisRow ? (JSON.parse(analysisRow.analysis) as JobAnalysis) : analyseJobDescription(row.raw_text),
    jdText: row.raw_text,
    jobId: row.id,
  };
}

async function loadMaster(userId: string) {
  const masterRow = await getMasterRow(getDb(), userId);
  if (!masterRow) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);
  return resumeRowToData(masterRow);
}

// --- critique -------------------------------------------------------------------

/** Run the AI critique on an existing resume version (truth-guarded output). */
router.post('/critique', requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const body = z.object({ resumeId: z.string().min(1).max(64) }).parse(req.body);
  const db = getDb();
  const uid = req.user!.uid;

  const resumeRow = (await db.query('SELECT id, user_id, kind, title, content, job_id FROM resumes WHERE id = $1', [body.resumeId]))
    .rows[0] as { id: string; user_id: string; kind: 'master' | 'tailored'; title: string; content: string; job_id: string | null } | undefined;
  if (!resumeRow) throw new AppError('NOT_FOUND', 'Resume not found.', 404);
  if (resumeRow.user_id !== uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);

  await enforceQuota(uid, 'critique');

  const master = await loadMaster(uid);
  const resume = resumeRowToData(resumeRow);

  const { job, jdText } = await loadJobOwned(resumeRow.job_id, uid);

  const started = Date.now();
  const runId = newId('airun');
  const { critique, appliedSuggestions } = await critiqueResume(master, resume, job, jdText);

  try {
    await db.query(
      `INSERT INTO ai_runs (id, user_id, job_id, resume_id, provider, model, status, error_code, iterations, rejected_claims, duration_ms, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 1, $8, $9, NOW())`,
      [
        runId,
        uid,
        resumeRow.job_id,
        resumeRow.id,
        getAiStatus().provider,
        getAiStatus().model,
        getAiStatus().enabled ? 'succeeded' : 'fallback',
        critique.suggestions.length - appliedSuggestions.length,
        Date.now() - started,
      ],
    );
  } catch {
    // run logging must never break the user-facing operation
  }

  await recordUsage(uid, 'critique');

  res.json({
    critique: { summary: critique.summary, notes: critique.notes },
    suggestions: appliedSuggestions.map((s, i) => ({
      id: `ai_${runId}_${i}`,
      section: s.section,
      itemId: s.itemId,
      bulletIndex: s.index,
      kind: 'ai-critique',
      current: s.current,
      suggested: s.suggested,
      reason: s.reason,
    })),
  });
});

// --- cover letters -----------------------------------------------------------------

interface CoverLetterRow {
  id: string;
  user_id: string;
  job_id: string | null;
  resume_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

router.post('/cover-letter', requireAuth, rateLimit({ windowMs: 60_000, max: 6 }), async (req, res) => {
  const body = z.object({
    resumeId: z.string().min(1).max(64).optional(),
    jobId: z.string().min(1).max(64).optional(),
    tone: z.string().max(60).optional(),
  }).parse(req.body);
  const uid = req.user!.uid;

  await enforceQuota(uid, 'coverLetter');
  const master = await loadMaster(uid);

  let resumeContent = master;
  let resumeId: string | null = null;
  if (body.resumeId) {
    const row = await loadResumeOwned(body.resumeId, uid);
    resumeContent = resumeRowToData(row);
    resumeId = row.id;
  }
  const { job, jdText, jobId } = await loadJobOwned(body.jobId, uid);

  const result = await generateCoverLetter({ master, resume: resumeContent, job, jdText, tone: body.tone });
  const letterId = newId('cov');
  const title = job?.title ? `Cover letter — ${job.title}` : 'Cover letter';
  await getDb().query(
    'INSERT INTO cover_letters (id, user_id, job_id, resume_id, title, content) VALUES ($1, $2, $3, $4, $5, $6)',
    [letterId, uid, jobId, resumeId, title, JSON.stringify(result.letter)],
  );

  await recordUsage(uid, 'coverLetter');
  track(uid, 'cover_letter_generated', { rejectedClaims: result.rejectedCount, aiProvider: result.provider });

  res.status(201).json({
    id: letterId,
    title,
    letter: result.letter,
    meta: { rejectedClaims: result.rejectedCount, provider: result.provider, model: result.model, truthGuarded: true },
  });
});

router.get('/cover-letters', requireAuth, async (req, res) => {
  const rows = (await getDb().query(
    `SELECT id, user_id, job_id, resume_id, title, content,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS updated_at
     FROM cover_letters WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user!.uid],
  )).rows as unknown as CoverLetterRow[];
  res.json({
    coverLetters: rows.map((r) => ({
      id: r.id,
      title: r.title,
      letter: JSON.parse(r.content),
      jobId: r.job_id,
      resumeId: r.resume_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

router.put('/cover-letters/:id', requireAuth, async (req, res) => {
  const body = z.object({ title: z.string().max(120).optional(), letter: z.unknown() }).parse(req.body);
  const row = (await getDb().query('SELECT id, user_id, content FROM cover_letters WHERE id = $1', [req.params.id])).rows[0] as
    | { id: string; user_id: string; content: string }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Cover letter not found.', 404);
  if (row.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  // Edits are the user's own words — validate shape only.
  const letter = z.object({
    greeting: z.string().max(200),
    paragraphs: z.array(z.string().max(3000)).max(8),
    closing: z.string().max(300),
  }).parse(body.letter);
  await getDb().query(
    "UPDATE cover_letters SET content = $1, title = COALESCE($2, title), updated_at = NOW() WHERE id = $3",
    [JSON.stringify(letter), body.title ?? null, row.id],
  );
  res.json({ ok: true });
});

router.delete('/cover-letters/:id', requireAuth, async (req, res) => {
  const row = (await getDb().query('SELECT id, user_id FROM cover_letters WHERE id = $1', [req.params.id])).rows[0] as
    | { id: string; user_id: string }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Cover letter not found.', 404);
  if (row.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  await getDb().query('DELETE FROM cover_letters WHERE id = $1', [row.id]);
  res.json({ ok: true });
});

/** Download a cover letter as a clean PDF. */
router.get('/cover-letters/:id/download', requireAuth, async (req, res) => {
  const row = (await getDb().query(
    `SELECT cl.id, cl.user_id, cl.title, cl.content, u.name AS owner_name
     FROM cover_letters cl JOIN users u ON u.id = cl.user_id WHERE cl.id = $1`,
    [req.params.id],
  )).rows[0] as { id: string; user_id: string; title: string; content: string; owner_name: string } | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Cover letter not found.', 404);
  if (row.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  const letter = z.object({ greeting: z.string(), paragraphs: z.array(z.string()), closing: z.string() }).parse(JSON.parse(row.content));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Cover_Letter_EnhanceCV.pdf"`);
  renderCoverLetterPdf(letter, row.owner_name).pipe(res);
});

// --- LinkedIn ---------------------------------------------------------------------

router.post('/linkedin', requireAuth, rateLimit({ windowMs: 60_000, max: 6 }), async (req, res) => {
  const body = z.object({
    resumeId: z.string().min(1).max(64).optional(),
    jobId: z.string().min(1).max(64).optional(),
  }).parse(req.body);
  const uid = req.user!.uid;

  await enforceQuota(uid, 'linkedin');
  const master = await loadMaster(uid);

  let resumeContent = master;
  let resumeId: string | null = null;
  if (body.resumeId) {
    const row = await loadResumeOwned(body.resumeId, uid);
    resumeContent = resumeRowToData(row);
    resumeId = row.id;
  }
  const { job, jdText, jobId } = await loadJobOwned(body.jobId, uid);

  const result = await generateLinkedinSuggestions({ master, resume: resumeContent, job, jdText });
  const generationId = newId('li');
  await getDb().query(
    'INSERT INTO linkedin_generations (id, user_id, job_id, resume_id, content) VALUES ($1, $2, $3, $4, $5)',
    [generationId, uid, jobId, resumeId, JSON.stringify(result.suggestions)],
  );

  await recordUsage(uid, 'linkedin');
  track(uid, 'linkedin_generated', { rejectedClaims: result.rejectedCount, aiProvider: result.provider });

  res.status(201).json({
    id: generationId,
    suggestions: result.suggestions,
    meta: { rejectedClaims: result.rejectedCount, provider: result.provider, model: result.model, truthGuarded: true },
  });
});


// --- grammar / proofreading -----------------------------------------------------

router.post('/grammar', requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const body = z.object({ resumeId: z.string().max(64).optional() }).parse(req.body);
  const uid = req.user!.uid;

  await enforceQuota(uid, 'grammar');
  const master = await loadMaster(uid);
  let resume = master;
  if (body.resumeId) {
    const row = await loadResumeOwned(body.resumeId, uid);
    resume = resumeRowToData(row);
  }

  const result = await suggestGrammarImprovements({ master, resume });
  await recordUsage(uid, 'grammar');
  track(uid, 'grammar_run', { suggestions: result.suggestions.length, rejected: result.rejectedCount });

  res.json({
    suggestions: result.suggestions.map((s, i) => ({
      id: `gr_${Date.now().toString(36)}_${i}`,
      section: s.section,
      itemId: s.itemId,
      bulletIndex: s.index,
      kind: 'ai-critique',
      current: s.original,
      suggested: s.updated,
      reason: s.reason,
    })),
    meta: { rejectedClaims: result.rejectedCount, provider: result.provider, model: result.model, truthGuarded: true },
  });
});

// --- translation / localisation ---------------------------------------------------

router.post('/translate', requireAuth, rateLimit({ windowMs: 60_000, max: 6 }), async (req, res) => {
  const body = z.object({
    resumeId: z.string().min(1).max(64),
    language: z.enum(SUPPORTED_LANGUAGES),
    market: z.string().max(80).optional(),
  }).parse(req.body);
  const uid = req.user!.uid;

  await enforceQuota(uid, 'translate');
  const master = await loadMaster(uid);
  const row = await loadResumeOwned(body.resumeId, uid);
  const resume = resumeRowToData(row);

  const result = await translateResume(resume, body.language, body.market || '');

  // Persist as a NEW resume version — the master and the original stay intact.
  const versionId = newId('res');
  const title = `${row.title} — ${body.language}`;
  await getDb().query(
    "INSERT INTO resumes (id, user_id, kind, title, content, job_id, ats_score) VALUES ($1, $2, 'tailored', $3, $4, NULL, $5)",
    [versionId, uid, title, JSON.stringify(result.resume), analyseATS(result.resume).overallScore],
  );

  await recordUsage(uid, 'translate');
  track(uid, 'translation_run', { language: body.language, warnings: result.warnings.length });

  res.status(201).json({
    versionId,
    title,
    resume: result.resume,
    warnings: result.warnings,
    meta: { provider: result.provider, model: result.model, language: result.language },
  });
});

// --- company research ---------------------------------------------------------------

router.post('/company-research', requireAuth, rateLimit({ windowMs: 60_000, max: 6 }), async (req, res) => {
  const body = z.object({
    company: z.string().trim().min(2).max(160),
    jobId: z.string().max(64).optional(),
  }).parse(req.body);
  const uid = req.user!.uid;

  await enforceQuota(uid, 'companyResearch');

  let jdText: string | null = null;
  if (body.jobId) {
    const owned = await loadJobOwned(body.jobId, uid);
    jdText = owned.jdText;
  }

  const research = await researchCompany({ company: body.company, jdText });
  const id = newId('crs');
  await getDb().query('INSERT INTO company_research (id, user_id, company, content) VALUES ($1,$2,$3,$4)', [
    id, uid, body.company, JSON.stringify(research),
  ]);
  await recordUsage(uid, 'companyResearch');
  track(uid, 'company_research_run', { company: body.company });

  res.status(201).json({ id, company: body.company, research, searchConfigured: resolveSearchProvider().id !== 'none' });
});

router.get('/company-research', requireAuth, async (req, res) => {
  const rows = (await getDb().query(
    `SELECT id, company, content, to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') AS created_at
     FROM company_research WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [req.user!.uid],
  )).rows as { id: string; company: string; content: string; created_at: string }[];
  res.json({
    research: rows.map((r) => ({ id: r.id, company: r.company, created_at: r.created_at, research: JSON.parse(r.content) })),
  });
});

export default router;
