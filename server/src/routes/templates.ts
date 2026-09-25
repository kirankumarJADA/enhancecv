// Template catalogue + deterministic recommendations.
// Template selection is stored per resume (resumes.template_id) and as a user
// default (users.template_id) — content and presentation stay separate.

import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { TEMPLATES, recommendTemplate, getTemplate } from '../lib/templates';
import { getMasterRow, resumeRowToData } from './master';
import { analyseATS } from '../engine/ats';
import { analyseJobDescription } from '../engine/jd';
import { yearsOfExperienceHint } from './templatesUtil';
import { track } from '../lib/analytics';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const row = (await getDb().query('SELECT template_id FROM users WHERE id = $1', [req.user!.uid])).rows[0] as
    | { template_id: string }
    | undefined;
  res.json({ templates: TEMPLATES, selected: row?.template_id || 'classic' });
});

/** Select the user's default template. */
router.put('/select', requireAuth, async (req, res) => {
  const body = z.object({ templateId: z.string().max(40) }).parse(req.body);
  if (!TEMPLATES.some((t) => t.id === body.templateId)) {
    throw new AppError('VALIDATION', 'Unknown template.', 400);
  }
  await getDb().query('UPDATE users SET template_id = $1 WHERE id = $2', [body.templateId, req.user!.uid]);
  track(req.user!.uid, 'template_selected', { templateId: body.templateId, scope: 'default' });
  res.json({ ok: true, selected: body.templateId });
});

/**
 * Deterministic recommendation for a resume (+ optional job). Uses the
 * existing deterministic analyses only — no AI, no scores invented.
 */
router.get('/recommendation', requireAuth, async (req, res) => {
  const db = getDb();
  const masterRow = await getMasterRow(db, req.user!.uid);
  if (!masterRow) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);
  const master = resumeRowToData(masterRow);
  const ats = analyseATS(master);

  const jobId = req.query.jobId ? String(req.query.jobId) : null;
  let jobTitle: string | undefined;
  let seniority: string | undefined;
  let requiredSkills: string[] | undefined;
  if (jobId) {
    const job = (await db.query('SELECT id, user_id, raw_text FROM job_descriptions WHERE id = $1', [jobId])).rows[0] as
      | { id: string; user_id: string; raw_text: string }
      | undefined;
    if (!job) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
    if (job.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
    const analysis = (await db.query('SELECT analysis FROM job_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1', [job.id])).rows[0] as { analysis: string } | undefined;
    const jd = analysis ? (JSON.parse(analysis.analysis) as { title: string; seniority: string; requiredSkills: string[] }) : analyseJobDescription(job.raw_text);
    jobTitle = jd.title;
    seniority = jd.seniority;
    requiredSkills = jd.requiredSkills;
  }

  const recommendation = recommendTemplate({
    jobTitle,
    seniority,
    requiredSkills,
    technicalSkillCount: master.skills.technical.length,
    experienceCount: master.experience.length,
    yearsExperience: yearsOfExperienceHint(master),
  });

  const template = getTemplate(recommendation.templateId);
  res.json({
    templateId: recommendation.templateId,
    reason: recommendation.reason,
    template,
    atsSafe: template.atsSafe,
  });
});

export default router;
