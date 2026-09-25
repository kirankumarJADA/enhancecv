// Descriptive career analytics + Resume Health Center.
//
// Analytics are purely descriptive (counts, rates, durations) — no causality,
// no prescriptive advice, no fabricated numbers. Empty data → honest zeros.

import { Router } from 'express';
import { z } from 'zod';
import { getDb, TS_TEXT } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { analyseATS } from '../engine/ats';
import { computeJobMatch } from '../engine/match';
import { validateTruth } from '../engine/tailor';
import { analyseJobDescription } from '../engine/jd';
import { getMasterRow, resumeRowToData, computeCompleteness } from './master';
import { isAiEnabled } from '../ai/provider';

const router = Router();

/** Descriptive application analytics for the authenticated user. */
router.get('/career', requireAuth, async (req, res) => {
  const db = getDb();
  const uid = req.user!.uid;

  const byMonth = (await db.query(
    `SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, COUNT(*)::int AS count
     FROM applications WHERE user_id = $1 AND status != 'SAVED'
     GROUP BY month ORDER BY month DESC LIMIT 12`,
    [uid],
  )).rows;

  const byStatus = (await db.query(
    'SELECT status, COUNT(*)::int AS count FROM applications WHERE user_id = $1 GROUP BY status',
    [uid],
  )).rows;

  const byTemplate = (await db.query(
    `SELECT template_id, COUNT(*)::int AS count FROM applications WHERE user_id = $1 GROUP BY template_id ORDER BY count DESC`,
    [uid],
  )).rows;

  const bySource = (await db.query(
    `SELECT COALESCE(NULLIF(job_url, ''), 'manual') AS source, COUNT(*)::int AS count
     FROM applications WHERE user_id = $1 GROUP BY COALESCE(NULLIF(job_url, ''), 'manual')`,
    [uid],
  )).rows;

  const total = ((await db.query('SELECT COUNT(*)::int AS n FROM applications WHERE user_id = $1', [uid])).rows[0] as { n: number }).n;
  const interviews = ((await db.query(
    "SELECT COUNT(*)::int AS n FROM applications WHERE user_id = $1 AND status IN ('INTERVIEW','OFFER')",
    [uid],
  )).rows[0] as { n: number }).n;
  const responses = ((await db.query(
    "SELECT COUNT(*)::int AS n FROM applications WHERE user_id = $1 AND status NOT IN ('SAVED','APPLIED','WITHDRAWN')",
    [uid],
  )).rows[0] as { n: number }).n;

  const stageDurations = (await db.query(
    `SELECT from_status, to_status,
            ROUND(AVG(dur_days)::numeric, 1) AS avg_days
     FROM (
       SELECT from_status, to_status,
              EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY application_id ORDER BY created_at))) / 86400.0 AS dur_days
       FROM application_events
       WHERE user_id = $1
     ) t
     WHERE dur_days IS NOT NULL
     GROUP BY from_status, to_status`,
    [uid],
  )).rows;

  res.json({
    applicationsByMonth: byMonth,
    applicationsByStatus: byStatus,
    applicationsByTemplate: byTemplate,
    interviewsReceived: interviews,
    totalApplications: total,
    // Transparent descriptive rates: 0 when there is no data.
    responseRate: total === 0 ? 0 : Math.round((responses / total) * 100),
    interviewRate: total === 0 ? 0 : Math.round((interviews / total) * 100),
    averageDaysBetweenStages: stageDurations,
    note: 'Descriptive statistics only — these numbers do not imply causation or predict future results.',
  });
});

/** Resume Health Center: deterministic components, clearly labelled. */
router.get('/health', requireAuth, async (req, res) => {
  const body = z.object({ resumeId: z.string().max(64).optional() }).parse(req.query);
  const db = getDb();
  const uid = req.user!.uid;

  const masterRow = await getMasterRow(db, uid);
  if (!masterRow) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);
  const master = resumeRowToData(masterRow);

  let resume = master;
  if (body.resumeId) {
    const row = (await db.query('SELECT id, user_id, content FROM resumes WHERE id = $1', [body.resumeId])).rows[0] as
      | { id: string; user_id: string; content: string }
      | undefined;
    if (!row) throw new AppError('NOT_FOUND', 'Resume not found.', 404);
    if (row.user_id !== uid) throw new AppError('FORBIDDEN', 'You do not have access to this resume.', 403);
    resume = resumeRowToData(row);
  }

  // 1. ATS compatibility (deterministic engine)
  const ats = analyseATS(resume);

  // 2. Section completeness + contact completeness (deterministic)
  const completeness = computeCompleteness(resume);
  const contact = {
    name: !!resume.personal.fullName,
    email: !!resume.personal.email,
    phone: !!resume.personal.phone,
    location: !!resume.personal.location,
    links: !!(resume.personal.linkedin || resume.personal.github || resume.personal.portfolio),
  };
  const contactScore = Math.round((Object.values(contact).filter(Boolean).length / Object.keys(contact).length) * 100);

  // 3. Truth validation vs Master CV (deterministic)
  const truth = resume === master ? { passedAll: true, checks: [], autoFixed: [] } : validateTruth(resume, master);
  const truthChecked = resume === master ? 'This is the Master CV itself — the source of truth.' : 'Every claim checked against your Master CV.';

  // 4. Format validation (deterministic ATS formatting subset)
  const formattingChecks = ats.checks.filter((c) => c.category === 'formatting' || c.category === 'readability');

  // 5. Grammar/quality heuristics (deterministic counts; AI grammar labelled separately)
  const bullets = [...resume.experience.flatMap((e) => e.bullets), ...resume.projects.flatMap((p) => p.bullets)].filter(Boolean);
  const weakBullets = bullets.filter((b) => /^\s*(worked on|worked with|helped|responsible for|involved in)/i.test(b)).length;
  const unquantified = bullets.filter((b) => !/\d/.test(b)).length;

  // 6. Optional AI label (never a score)
  const aiLabel = isAiEnabled() ? 'AI assistance available for grammar and tailoring suggestions.' : 'AI provider not configured — all scores above are deterministic.';

  res.json({
    resumeId: body.resumeId || masterRow.id,
    isMaster: resume === master,
    components: [
      {
        key: 'ats',
        label: 'ATS compatibility',
        score: ats.overallScore,
        engine: 'deterministic',
        detail: `Formatting ${ats.formattingScore}, structure ${ats.structureScore}, content ${ats.contentScore}, skills ${ats.skillsScore}, readability ${ats.readabilityScore}.`,
        issues: ats.issues.slice(0, 4),
      },
      {
        key: 'completeness',
        label: 'Section completeness',
        score: completeness,
        engine: 'deterministic',
        detail: 'Share of recommended sections and content depth present on the resume.',
      },
      {
        key: 'contact',
        label: 'Contact completeness',
        score: contactScore,
        engine: 'deterministic',
        detail: Object.entries(contact).map(([k, v]) => `${k}: ${v ? 'present' : 'missing'}`).join(' · '),
      },
      {
        key: 'truth',
        label: 'Truth validation',
        score: truth.passedAll ? 100 : Math.max(0, 100 - truth.autoFixed.length * 20),
        engine: 'deterministic',
        detail: truth.passedAll ? truthChecked : `${truth.autoFixed.length} unsupported claim(s) were auto-reverted against the Master CV.`,
      },
      {
        key: 'quality',
        label: 'Bullet quality heuristics',
        score: bullets.length === 0 ? 0 : Math.max(0, 100 - Math.round(((weakBullets * 2 + unquantified) / bullets.length) * 50)),
        engine: 'deterministic',
        detail: `${bullets.length} bullets · ${weakBullets} with weak openers · ${unquantified} without any measurable figure.`,
      },
    ],
    aiLabel,
  });
});

export default router;
