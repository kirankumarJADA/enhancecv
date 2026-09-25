// Admin dashboard APIs — protected by SERVER-SIDE role checks (users.role).
// Aggregate, privacy-conscious data only: counts and metadata, never resume
// content, job descriptions or AI prompts.

import { Router } from 'express';
import { getDb } from '../db/db';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', async (_req, res) => {
  const db = getDb();
  const one = async (sql: string): Promise<number> => {
    const r = await db.query(sql);
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) return 0;
    const v = Object.values(row)[0];
    return typeof v === 'number' ? v : parseInt(String(v), 10) || 0;
  };

  const [
    totalUsers,
    verifiedUsers,
    adminUsers,
    masterCvs,
    jobDescriptions,
    resumeVersions,
    aiRuns,
    aiRunsFailed,
    coverLetters,
    linkedinGenerations,
    applications,
    pdfDownloads,
    subscriptionsActive,
  ] = await Promise.all([
    one("SELECT COUNT(*) FROM users"),
    one("SELECT COUNT(*) FROM users WHERE email_verified = TRUE"),
    one("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'"),
    one("SELECT COUNT(*) FROM resumes WHERE kind = 'master'"),
    one("SELECT COUNT(*) FROM job_descriptions"),
    one("SELECT COUNT(*) FROM resumes WHERE kind = 'tailored'"),
    one("SELECT COUNT(*) FROM ai_runs"),
    one("SELECT COUNT(*) FROM ai_runs WHERE status = 'fallback'"),
    one("SELECT COUNT(*) FROM cover_letters"),
    one("SELECT COUNT(*) FROM linkedin_generations"),
    one("SELECT COUNT(*) FROM applications"),
    one("SELECT COUNT(*) FROM analytics_events WHERE event = 'resume_downloaded'"),
    one("SELECT COUNT(*) FROM subscriptions WHERE status IN ('active','trialing')"),
  ]);

  res.json({
    users: { total: totalUsers, verified: verifiedUsers, admins: adminUsers },
    content: { masterCvs, jobDescriptions, resumeVersions },
    ai: { runs: aiRuns, fallbackRuns: aiRunsFailed },
    artifacts: { coverLetters, linkedinGenerations, applications, pdfDownloads },
    subscriptions: { active: subscriptionsActive },
  });
});

router.get('/users', async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(50, Math.max(5, parseInt(String(req.query.pageSize || '20'), 10) || 20));
  const db = getDb();
  const total = ((await db.query('SELECT COUNT(*) AS n FROM users')).rows[0] as { n: number }).n;
  const rows = (await db.query(
    `SELECT u.id, u.email, u.name, u.role, u.email_verified, u.onboarded,
            to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
            s.plan, s.status AS subscription_status,
            (SELECT COUNT(*) FROM resumes r WHERE r.user_id = u.id) AS resume_count,
            (SELECT COUNT(*) FROM ai_runs ar WHERE ar.user_id = u.id) AS ai_runs
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id
     ORDER BY u.created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  )).rows;

  res.json({ page, pageSize, total, users: rows });
});

router.get('/usage', async (_req, res) => {
  const db = getDb();
  const byFeature = (await db.query(
    `SELECT feature, COUNT(*)::int AS uses FROM usage_records
     WHERE period = to_char(NOW(), 'YYYY-MM')
     GROUP BY feature ORDER BY uses DESC`,
  )).rows;
  const byPlan = (await db.query(
    `SELECT COALESCE(s.plan, 'FREE') AS plan, COUNT(DISTINCT u.id)::int AS users
     FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status IN ('active','trialing','past_due')
     GROUP BY COALESCE(s.plan, 'FREE')`,
  )).rows;
  const topEvents = (await db.query(
    `SELECT event, COUNT(*)::int AS count FROM analytics_events
     WHERE created_at > NOW() - INTERVAL '30 days'
     GROUP BY event ORDER BY count DESC LIMIT 15`,
  )).rows;
  res.json({ byFeature, byPlan, topEvents });
});

router.get('/errors', async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(50, Math.max(5, parseInt(String(req.query.pageSize || '20'), 10) || 20));
  const db = getDb();
  const total = ((await db.query('SELECT COUNT(*) AS n FROM error_events')).rows[0] as { n: number }).n;
  const rows = (await db.query(
    `SELECT id, code, message, request_id, user_id,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at
     FROM error_events ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  )).rows;
  res.json({ page, pageSize, total, errors: rows });
});

export default router;
