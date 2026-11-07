// Curevo AI — Resumes & Tailored Resume Versions Routes
//
// Invariant: Tailored resumes are independent outputs from the Master CV.
// Tailoring actions and edits to tailored resumes NEVER silently alter the Master CV.

import { Router } from 'express';
import { z } from 'zod';
import { getDb, newId, TS_TEXT } from '../db/db';
import { MasterCvRepository, TailoredResumeRecord } from '../db/masterCvRepository';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { analyseATS } from '../engine/ats';
import { computeJobMatch } from '../engine/match';
import { generateSuggestions } from '../engine/tailor';
import { renderResumePdf, pdfFileName } from '../engine/pdf';
import { getAiProvider } from '../ai/provider';
import { sanitizeResumeData, resumeRowToData } from './master';
import { analyseJobDescription } from '../engine/jd';
import { isValidTemplate } from '../lib/templates';
import { track } from '../lib/analytics';
import { JobAnalysis, ResumeData } from '../types';

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

async function findLegacyResume(id: string, userId: string): Promise<ResumeRow | null> {
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
  if (!row) return null;
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

/**
 * List all resumes for the user: Master CV summary + tailored versions.
 * Retains backward-compatible format for existing UI.
 */
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user!.uid;
  const master = await MasterCvRepository.get(userId);
  const tailored = await MasterCvRepository.listTailoredResumes(userId);

  // Check legacy resumes table as well for backwards compatibility
  const db = getDb();
  const legacyRows = (await db.query(
    `SELECT id, user_id, kind, title, content, job_id, ats_score, template_id,
            ${TS_TEXT('created_at')} AS created_at,
            ${TS_TEXT('updated_at')} AS updated_at
     FROM resumes
     WHERE user_id = $1 AND kind = 'tailored'
     ORDER BY updated_at DESC`,
    [userId],
  )).rows as unknown as ResumeRow[];

  const masterSummary = master
    ? {
        id: master.id,
        kind: 'master' as const,
        title: master.title,
        atsScore: master.atsScore,
        jobId: null,
        jobTitle: null,
        templateId: 'classic',
        createdAt: master.createdAt,
        updatedAt: master.updatedAt,
      }
    : null;

  const tailoredSummaries = tailored.map((t) => ({
    id: t.id,
    kind: 'tailored' as const,
    title: t.title,
    atsScore: t.atsScore,
    jobId: null,
    jobTitle: t.targetCompany ? `${t.targetRole} at ${t.targetCompany}` : t.targetRole || null,
    templateId: 'classic',
    targetRole: t.targetRole,
    targetCompany: t.targetCompany,
    truthGuardResult: t.truthGuardResult,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  const legacySummaries = legacyRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    atsScore: r.ats_score,
    jobId: r.job_id,
    jobTitle: null,
    templateId: r.template_id || 'classic',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const allResumes = [
    ...(masterSummary ? [masterSummary] : []),
    ...tailoredSummaries,
    ...legacySummaries.filter((l) => !tailoredSummaries.some((t) => t.id === l.id)),
  ];

  res.json({
    resumes: allResumes,
    master,
    tailored,
  });
});

// --------------------------------------------------------------------------
// Tailored Resumes CRUD Endpoints
// --------------------------------------------------------------------------

/** List tailored resume versions. */
router.get('/tailored', requireAuth, async (req, res) => {
  const resumes = await MasterCvRepository.listTailoredResumes(req.user!.uid);
  res.json({ resumes });
});

/** Save (create or update) a tailored resume version. */
router.post('/tailored', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const body = z.object({
    id: z.string().max(64).optional(),
    masterCvVersionId: z.string().max(64).optional(),
    title: z.string().min(1).max(160),
    targetRole: z.string().max(160).optional(),
    targetCompany: z.string().max(160).optional(),
    jobDescription: z.string().max(30000).optional(),
    resume: z.unknown(),
    atsScore: z.number().optional(),
    atsBreakdown: z.unknown().optional(),
    truthGuardResult: z.unknown().optional(),
  }).parse(req.body);

  const resume = sanitizeResumeData(body.resume);
  const ats = body.atsScore !== undefined ? { overallScore: body.atsScore } : analyseATS(resume);

  const tailoredResume = await MasterCvRepository.saveTailoredResume(req.user!.uid, {
    id: body.id,
    masterCvVersionId: body.masterCvVersionId,
    title: body.title,
    targetRole: body.targetRole,
    targetCompany: body.targetCompany,
    jobDescriptionSnapshot: body.jobDescription,
    resumeContent: resume,
    atsScore: ats.overallScore,
    atsBreakdown: body.atsBreakdown || ats,
    truthGuardResult: body.truthGuardResult,
  });

  track(req.user!.uid, 'tailored_resume_saved', { id: tailoredResume.id, atsScore: tailoredResume.atsScore });

  res.status(body.id ? 200 : 201).json({
    ok: true,
    resume: tailoredResume,
  });
});

/** Get a tailored resume version. */
router.get('/tailored/:id', requireAuth, async (req, res) => {
  const resume = await MasterCvRepository.getTailoredResume(req.user!.uid, req.params.id);
  if (!resume) throw new AppError('NOT_FOUND', 'Tailored resume not found.', 404);
  res.json({ resume });
});

/** Delete a tailored resume version. */
router.delete('/tailored/:id', requireAuth, async (req, res) => {
  const deleted = await MasterCvRepository.deleteTailoredResume(req.user!.uid, req.params.id);
  if (!deleted) throw new AppError('NOT_FOUND', 'Tailored resume not found.', 404);
  track(req.user!.uid, 'tailored_resume_deleted', { id: req.params.id });
  res.json({ ok: true });
});

/** Download PDF for tailored resume version (POST or GET). */
const handleTailoredPdf = async (req: any, res: any) => {
  const resume = await MasterCvRepository.getTailoredResume(req.user!.uid, req.params.id);
  if (!resume) throw new AppError('NOT_FOUND', 'Tailored resume not found.', 404);

  const requestedTemplate = (req.query.template || req.body?.template) ? String(req.query.template || req.body?.template) : 'classic';
  const template = isValidTemplate(requestedTemplate) ? requestedTemplate : 'classic';

  track(req.user!.uid, 'tailored_resume_downloaded', { id: resume.id, template });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(resume.resumeContent, resume.targetRole)}"`);

  const stream = renderResumePdf(resume.resumeContent, { titleSuffix: resume.targetRole, template });
  stream.pipe(res);
};

router.post('/tailored/:id/pdf', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), handleTailoredPdf);
router.get('/tailored/:id/pdf', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), handleTailoredPdf);

// --------------------------------------------------------------------------
// Generic / Backward-Compatible Resume Routes
// --------------------------------------------------------------------------

router.get('/:id', requireAuth, async (req, res) => {
  const userId = req.user!.uid;
  const id = req.params.id;

  // 1. Is it the Master CV?
  if (id === 'master') {
    const master = await MasterCvRepository.get(userId);
    if (!master) throw new AppError('NOT_FOUND', 'Master CV not found.', 404);
    res.json({
      resume: {
        id: master.id,
        kind: 'master',
        title: master.title,
        content: master.content,
        atsScore: master.atsScore,
        templateId: 'classic',
        createdAt: master.createdAt,
        updatedAt: master.updatedAt,
      },
    });
    return;
  }

  // 2. Is it in tailored_resume_versions?
  const tailored = await MasterCvRepository.getTailoredResume(userId, id);
  if (tailored) {
    res.json({
      resume: {
        id: tailored.id,
        kind: 'tailored',
        title: tailored.title,
        content: tailored.resumeContent,
        atsScore: tailored.atsScore,
        templateId: 'classic',
        targetRole: tailored.targetRole,
        targetCompany: tailored.targetCompany,
        truthGuardResult: tailored.truthGuardResult,
        createdAt: tailored.createdAt,
        updatedAt: tailored.updatedAt,
      },
    });
    return;
  }

  // 3. Fallback to legacy resumes table
  const legacy = await findLegacyResume(id, userId);
  if (!legacy) throw new AppError('NOT_FOUND', 'Resume not found.', 404);
  res.json({
    resume: {
      id: legacy.id,
      kind: legacy.kind,
      title: legacy.title,
      content: resumeRowToData(legacy),
      jobId: legacy.job_id,
      atsScore: legacy.ats_score,
      templateId: legacy.template_id || 'classic',
      createdAt: legacy.created_at,
      updatedAt: legacy.updated_at,
    },
  });
});

router.put('/:id', requireAuth, rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
  const userId = req.user!.uid;
  const id = req.params.id;
  const body = z.object({
    resume: z.unknown(),
    title: z.string().max(120).optional(),
    templateId: z.string().max(40).optional(),
  }).parse(req.body);

  if (body.templateId && !isValidTemplate(body.templateId)) {
    throw new AppError('VALIDATION', 'Unknown template.', 400);
  }

  // Check tailored_resume_versions
  const tailored = await MasterCvRepository.getTailoredResume(userId, id);
  if (tailored) {
    const sanitized = sanitizeResumeData(body.resume);
    const ats = analyseATS(sanitized);
    const updated = await MasterCvRepository.saveTailoredResume(userId, {
      id: tailored.id,
      title: body.title || tailored.title,
      targetRole: tailored.targetRole,
      targetCompany: tailored.targetCompany,
      jobDescriptionSnapshot: tailored.jobDescriptionSnapshot,
      resumeContent: sanitized,
      atsScore: ats.overallScore,
      atsBreakdown: ats,
      truthGuardResult: tailored.truthGuardResult,
    });
    res.json({ id: updated.id, atsScore: updated.atsScore, title: updated.title, templateId: body.templateId || 'classic' });
    return;
  }

  // Fallback to legacy resumes
  const row = await findLegacyResume(id, userId);
  if (!row) throw new AppError('NOT_FOUND', 'Resume not found.', 404);
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
  res.json({ id: row.id, atsScore: ats.overallScore, title: body.title || row.title, templateId: body.templateId || row.template_id || 'classic' });
});

router.post('/:id/duplicate', requireAuth, async (req, res) => {
  const userId = req.user!.uid;
  const id = req.params.id;
  const body = z.object({ title: z.string().max(120).optional() }).parse(req.body ?? {});

  const tailored = await MasterCvRepository.getTailoredResume(userId, id);
  if (tailored) {
    const duplicated = await MasterCvRepository.saveTailoredResume(userId, {
      title: body.title || `Copy of ${tailored.title}`,
      targetRole: tailored.targetRole,
      targetCompany: tailored.targetCompany,
      jobDescriptionSnapshot: tailored.jobDescriptionSnapshot,
      resumeContent: tailored.resumeContent,
      atsScore: tailored.atsScore,
      atsBreakdown: tailored.atsBreakdown,
      truthGuardResult: tailored.truthGuardResult,
    });
    res.status(201).json({ id: duplicated.id });
    return;
  }

  const row = await findLegacyResume(id, userId);
  if (!row) throw new AppError('NOT_FOUND', 'Resume not found.', 404);
  const newResumeId = newId('res');
  const db = getDb();
  await db.query(
    `INSERT INTO resumes (id, user_id, kind, title, content, job_id, ats_score)
     VALUES ($1, $2, 'tailored', $3, $4, $5, $6)`,
    [newResumeId, userId, body.title || `Copy of ${row.title}`, row.content, row.job_id, row.ats_score],
  );
  res.status(201).json({ id: newResumeId });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.user!.uid;
  const id = req.params.id;

  const deletedTailored = await MasterCvRepository.deleteTailoredResume(userId, id);
  if (deletedTailored) {
    res.json({ ok: true });
    return;
  }

  const row = await findLegacyResume(id, userId);
  if (!row) throw new AppError('NOT_FOUND', 'Resume not found.', 404);
  if (row.kind === 'master') throw new AppError('FORBIDDEN', 'The Master CV cannot be deleted from here. Use DELETE /api/master.', 403);
  const db = getDb();
  await db.query('DELETE FROM resumes WHERE id = $1', [row.id]);
  res.json({ ok: true });
});

/** Download PDF. Works for Master CV ('master' or master id) or tailored resumes. */
router.get('/:id/pdf', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const userId = req.user!.uid;
  const id = req.params.id;

  let resumeData: ResumeData | null = null;
  let role: string | undefined;

  // Check if Master CV requested
  if (id === 'master') {
    const master = await MasterCvRepository.get(userId);
    if (!master) throw new AppError('NOT_FOUND', 'Master CV not found.', 404);
    resumeData = master.content;
    role = master.targetRole || undefined;
  }

  // Check if tailored resume
  if (!resumeData) {
    const tailored = await MasterCvRepository.getTailoredResume(userId, id);
    if (tailored) {
      resumeData = tailored.resumeContent;
      role = tailored.targetRole || undefined;
    }
  }

  // Check legacy resumes
  if (!resumeData) {
    const legacy = await findLegacyResume(id, userId);
    if (legacy) {
      resumeData = resumeRowToData(legacy);
      if (legacy.job_id) {
        const db = getDb();
        const j = (await db.query(
          'SELECT title FROM job_descriptions WHERE id = $1',
          [legacy.job_id],
        )).rows[0] as { title: string } | undefined;
        if (j && j.title !== 'Unknown Title') role = j.title;
      }
    }
  }

  if (!resumeData) {
    throw new AppError('NOT_FOUND', 'Resume not found.', 404);
  }

  const requestedTemplate = req.query.template ? String(req.query.template) : 'classic';
  const template = isValidTemplate(requestedTemplate) ? requestedTemplate : 'classic';

  track(userId, 'resume_downloaded', { id, template });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(resumeData, role)}"`);
  const stream = renderResumePdf(resumeData, { titleSuffix: role, template });
  stream.pipe(res);
});

export default router;
