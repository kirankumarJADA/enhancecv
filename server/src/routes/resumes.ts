import { Router } from 'express';
import { z } from 'zod';
import { getDb, newId, TS_TEXT } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { analyseATS } from '../engine/ats';
import { computeJobMatch } from '../engine/match';
import { generateSuggestions } from '../engine/tailor';
import { renderResumePdf, pdfFileName } from '../engine/pdf';
import { getAiProvider } from '../ai/provider';
import { getMasterRow, resumeRowToData, sanitizeResumeData } from './master';
import { analyseJobDescription } from '../engine/jd';
import { isValidTemplate } from '../lib/templates';
import { track } from '../lib/analytics';
import { JobAnalysis } from '../types';

const router = Router();

interface ResumeRow {
  id: string;
  user_id: string;
  kind: 'master' | 'tailored';
  title: string;
  content: string;
  job_id: string | null;
  ats_score: number | null;
  template_id: string;
  created_at: string;
  updated_at: string;
}

async function findResume(id: string, userId: string): Promise<ResumeRow> {
  const db = getDb();
  const result = await db.query(
    `SELECT id, user_id, kind, title, content, job_id, ats_score, template_id,
            ${TS_TEXT('created_at')} AS created_at,
            ${TS_TEXT('updated_at')} AS updated_at
     FROM resumes
     WHERE id = $1`,
    [id],
  );
  const row = result.rows[0] as ResumeRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Resume not found.', 404);
  if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  return row;
}

async function getJobAnalysis(jobId: string, rawText: string): Promise<JobAnalysis> {
  const db = getDb();
  const analysisRow = (await db.query(
    'SELECT analysis FROM job_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
    [jobId],
  )).rows[0] as { analysis: string } | undefined;
  return analysisRow ? (JSON.parse(analysisRow.analysis) as JobAnalysis) : analyseJobDescription(rawText);
}

/** List all resume versions for the user (master + tailored). */
router.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  const rows = (await db.query(
    `SELECT id, user_id, kind, title, content, job_id, ats_score, template_id,
            ${TS_TEXT('created_at')} AS created_at,
            ${TS_TEXT('updated_at')} AS updated_at
     FROM resumes
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [req.user!.uid],
  )).rows as unknown as ResumeRow[];

  const jobs = new Map<string, { title: string; company: string }>();
  for (const r of rows) {
    if (r.job_id && !jobs.has(r.job_id)) {
      const j = (await db.query(
        'SELECT title, company FROM job_descriptions WHERE id = $1',
        [r.job_id],
      )).rows[0] as { title: string; company: string } | undefined;
      if (j) jobs.set(r.job_id, j);
    }
  }
  res.json({
    resumes: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      atsScore: r.ats_score,
      jobId: r.job_id,
      jobTitle: r.job_id ? jobs.get(r.job_id)?.title || null : null,
      templateId: r.template_id || 'classic',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

router.get('/:id', requireAuth, async (req, res) => {
  const row = await findResume(req.params.id, req.user!.uid);
  res.json({
    resume: {
      id: row.id,
      kind: row.kind,
      title: row.title,
      content: resumeRowToData(row),
      jobId: row.job_id,
      atsScore: row.ats_score,
      templateId: row.template_id || 'classic',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

router.put('/:id', requireAuth, rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
  const body = z.object({
    resume: z.unknown(),
    title: z.string().max(120).optional(),
    templateId: z.string().max(40).optional(),
  }).parse(req.body);
  if (body.templateId && !isValidTemplate(body.templateId)) {
    throw new AppError('VALIDATION', 'Unknown template.', 400);
  }
  const row = await findResume(req.params.id, req.user!.uid);
  const resume = sanitizeResumeData(body.resume);
  const ats = analyseATS(resume);
  const db = getDb();
  await db.query(
    `UPDATE resumes
     SET content = $1, title = COALESCE($2, title), ats_score = $3,
         template_id = COALESCE($4, template_id), updated_at = NOW()
     WHERE id = $5`,
    [JSON.stringify(resume), body.title ?? null, ats.overallScore, body.templateId ?? null, row.id],
  );
  if (body.templateId) track(req.user!.uid, 'template_selected', { templateId: body.templateId, scope: 'resume' });
  res.json({ id: row.id, atsScore: ats.overallScore, title: body.title || row.title, templateId: body.templateId || row.template_id || 'classic' });
});

router.post('/:id/duplicate', requireAuth, async (req, res) => {
  const row = await findResume(req.params.id, req.user!.uid);
  const body = z.object({ title: z.string().max(120).optional() }).parse(req.body ?? {});
  const id = newId('res');
  const db = getDb();
  await db.query(
    `INSERT INTO resumes (id, user_id, kind, title, content, job_id, ats_score)
     VALUES ($1, $2, 'tailored', $3, $4, $5, $6)`,
    [id, req.user!.uid, body.title || `Copy of ${row.title}`, row.content, row.job_id, row.ats_score],
  );
  res.status(201).json({ id });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const row = await findResume(req.params.id, req.user!.uid);
  if (row.kind === 'master') throw new AppError('FORBIDDEN', 'The Master CV cannot be deleted. Edit it instead.', 403);
  const db = getDb();
  await db.query('DELETE FROM resumes WHERE id = $1', [row.id]);
  res.json({ ok: true });
});

/** ATS analysis for any resume version. */
router.get('/:id/ats', requireAuth, async (req, res) => {
  const row = await findResume(req.params.id, req.user!.uid);
  const resume = resumeRowToData(row);
  const analysis = analyseATS(resume);
  const db = getDb();
  await db.query('UPDATE resumes SET ats_score = $1 WHERE id = $2', [analysis.overallScore, row.id]);
  res.json({ analysis });
});

/** Match analysis of this resume (tailored) against its source job. */
router.get('/:id/match', requireAuth, async (req, res) => {
  const row = await findResume(req.params.id, req.user!.uid);
  if (!row.job_id) throw new AppError('NOT_FOUND', 'This resume is not linked to a job description.', 404);
  const db = getDb();
  const job = (await db.query(
    'SELECT raw_text FROM job_descriptions WHERE id = $1',
    [row.job_id],
  )).rows[0] as { raw_text: string } | undefined;
  if (!job) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
  const jd = await getJobAnalysis(row.job_id, job.raw_text);
  const resume = resumeRowToData(row);
  const match = computeJobMatch(resume, jd);
  res.json({ match });
});

/** AI suggestions for the editor panel (deterministic; truth-safe by construction). */
router.get('/:id/suggestions', requireAuth, async (req, res) => {
  const row = await findResume(req.params.id, req.user!.uid);
  const resume = resumeRowToData(row);
  let job: JobAnalysis | null = null;
  if (row.job_id) {
    const db = getDb();
    const analysisRow = (await db.query(
      'SELECT analysis FROM job_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
      [row.job_id],
    )).rows[0] as { analysis: string } | undefined;
    if (analysisRow) job = JSON.parse(analysisRow.analysis);
  }
  const suggestions = generateSuggestions(resume, job || undefined, getAiProvider());
  res.json({ suggestions });
});

/** Download ATS-friendly PDF. */
router.get('/:id/pdf', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const row = await findResume(req.params.id, req.user!.uid);
  const resume = resumeRowToData(row);
  let role: string | undefined;
  if (row.job_id) {
    const db = getDb();
    const j = (await db.query(
      'SELECT title FROM job_descriptions WHERE id = $1',
      [row.job_id],
    )).rows[0] as { title: string } | undefined;
    if (j && j.title !== 'Unknown Title') role = j.title;
  }
  const requestedTemplate = req.query.template ? String(req.query.template) : row.template_id || 'classic';
  const template = isValidTemplate(requestedTemplate) ? requestedTemplate : 'classic';
  track(req.user!.uid, 'resume_downloaded', { kind: row.kind, templateId: template });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(resume, role)}"`);
  const stream = renderResumePdf(resume, { titleSuffix: role, template });
  stream.pipe(res);
});

export default router;
