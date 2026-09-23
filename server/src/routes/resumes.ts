import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db';
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
  created_at: string;
  updated_at: string;
}

function findResume(db: ReturnType<typeof getDb>, id: string, userId: string): ResumeRow {
  const row = db.prepare('SELECT id, user_id, kind, title, content, job_id, ats_score, created_at, updated_at FROM resumes WHERE id = ?').get(id) as ResumeRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Resume not found.', 404);
  if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  return row;
}

/** List all resume versions for the user (master + tailored). */
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, user_id, kind, title, content, job_id, ats_score, created_at, updated_at FROM resumes WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.uid) as unknown as ResumeRow[];
  const jobs = new Map<string, { title: string; company: string }>();
  for (const r of rows) {
    if (r.job_id && !jobs.has(r.job_id)) {
      const j = db.prepare('SELECT title, company FROM job_descriptions WHERE id = ?').get(r.job_id) as { title: string; company: string } | undefined;
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
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = findResume(db, req.params.id, req.user!.uid);
  res.json({
    resume: {
      id: row.id,
      kind: row.kind,
      title: row.title,
      content: resumeRowToData(row),
      jobId: row.job_id,
      atsScore: row.ats_score,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

router.put('/:id', requireAuth, rateLimit({ windowMs: 60_000, max: 60 }), (req, res) => {
  const body = z.object({
    resume: z.unknown(),
    title: z.string().max(120).optional(),
  }).parse(req.body);
  const db = getDb();
  const row = findResume(db, req.params.id, req.user!.uid);
  const resume = sanitizeResumeData(body.resume);
  const ats = analyseATS(resume);
  db.prepare("UPDATE resumes SET content = ?, title = COALESCE(?, title), ats_score = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(resume), body.title ?? null, ats.overallScore, row.id);
  res.json({ id: row.id, atsScore: ats.overallScore, title: body.title || row.title });
});

router.post('/:id/duplicate', requireAuth, (req, res) => {
  const db = getDb();
  const row = findResume(db, req.params.id, req.user!.uid);
  const body = z.object({ title: z.string().max(120).optional() }).parse(req.body ?? {});
  const newId = `res_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(
    "INSERT INTO resumes (id, user_id, kind, title, content, job_id, ats_score) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(newId, req.user!.uid, 'tailored', body.title || `Copy of ${row.title}`, row.content, row.job_id, row.ats_score);
  res.status(201).json({ id: newId });
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = findResume(db, req.params.id, req.user!.uid);
  if (row.kind === 'master') throw new AppError('FORBIDDEN', 'The Master CV cannot be deleted. Edit it instead.', 403);
  db.prepare('DELETE FROM resumes WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

/** ATS analysis for any resume version. */
router.get('/:id/ats', requireAuth, (req, res) => {
  const db = getDb();
  const row = findResume(db, req.params.id, req.user!.uid);
  const resume = resumeRowToData(row);
  const analysis = analyseATS(resume);
  db.prepare('UPDATE resumes SET ats_score = ? WHERE id = ?').run(analysis.overallScore, row.id);
  res.json({ analysis });
});

/** Match analysis of this resume (tailored) against its source job. */
router.get('/:id/match', requireAuth, (req, res) => {
  const db = getDb();
  const row = findResume(db, req.params.id, req.user!.uid);
  if (!row.job_id) throw new AppError('NOT_FOUND', 'This resume is not linked to a job description.', 404);
  const job = db.prepare('SELECT raw_text FROM job_descriptions WHERE id = ?').get(row.job_id) as { raw_text: string } | undefined;
  if (!job) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
  const analysisRow = db.prepare('SELECT analysis FROM job_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(row.job_id) as { analysis: string } | undefined;
  const jd: JobAnalysis = analysisRow ? JSON.parse(analysisRow.analysis) : analyseJobDescription(job.raw_text);
  const resume = resumeRowToData(row);
  const match = computeJobMatch(resume, jd);
  res.json({ match });
});

/** AI suggestions for the editor panel (deterministic; truth-safe by construction). */
router.get('/:id/suggestions', requireAuth, (req, res) => {
  const db = getDb();
  const row = findResume(db, req.params.id, req.user!.uid);
  const resume = resumeRowToData(row);
  let job: JobAnalysis | null = null;
  if (row.job_id) {
    const analysisRow = db.prepare('SELECT analysis FROM job_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(row.job_id) as { analysis: string } | undefined;
    if (analysisRow) job = JSON.parse(analysisRow.analysis);
  }
  const suggestions = generateSuggestions(resume, job || undefined, getAiProvider());
  res.json({ suggestions });
});

/** Download ATS-friendly PDF. */
router.get('/:id/pdf', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), (req, res) => {
  const db = getDb();
  const row = findResume(db, req.params.id, req.user!.uid);
  const resume = resumeRowToData(row);
  let role: string | undefined;
  if (row.job_id) {
    const j = db.prepare('SELECT title FROM job_descriptions WHERE id = ?').get(row.job_id) as { title: string } | undefined;
    if (j && j.title !== 'Unknown Title') role = j.title;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(resume, role)}"`);
  const stream = renderResumePdf(resume, { titleSuffix: role });
  stream.pipe(res);
});

export default router;
