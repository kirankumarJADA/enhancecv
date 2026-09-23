import { Router } from 'express';
import { getDb } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { computeCompleteness, getMasterRow, resumeRowToData } from './master';
import { analyseATS } from '../engine/ats';
import { JobAnalysis } from '../types';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const uid = req.user!.uid;

  const user = db.prepare('SELECT name, email, target_role, onboarded FROM users WHERE id = ?').get(uid) as
    | { name: string; email: string; target_role: string; onboarded: number }
    | undefined;

  const masterRow = getMasterRow(db, uid);
  let master: { id: string; completeness: number; atsScore: number | null; updatedAt: string } | null = null;
  let ats: ReturnType<typeof analyseATS> | null = null;
  if (masterRow) {
    const resume = resumeRowToData(masterRow);
    ats = analyseATS(resume);
    master = {
      id: masterRow.id,
      completeness: computeCompleteness(resume),
      atsScore: ats.overallScore,
      updatedAt: masterRow.updated_at,
    };
  }

  const resumes = db.prepare("SELECT id, kind, title, ats_score, updated_at FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 6").all(uid) as
    { id: string; kind: 'master' | 'tailored'; title: string; ats_score: number | null; updated_at: string }[];

  const jobs = db.prepare(`
    SELECT j.id, j.title, j.company, j.created_at, ma.score AS match_score
    FROM job_descriptions j
    LEFT JOIN (
      SELECT job_id, score, ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY created_at DESC) AS rn
      FROM match_analyses
    ) ma ON ma.job_id = j.id AND ma.rn = 1
    WHERE j.user_id = ?
    ORDER BY j.created_at DESC LIMIT 5
  `).all(uid) as { id: string; title: string; company: string; created_at: string; match_score: number | null }[];

  const latestAnalysisRows = db.prepare(`
    SELECT ja.job_id, ja.analysis FROM job_analyses ja
    INNER JOIN (
      SELECT job_id, MAX(created_at) AS mx FROM job_analyses GROUP BY job_id
    ) latest ON latest.job_id = ja.job_id AND latest.mx = ja.created_at
    WHERE ja.user_id = ?
  `).all(uid) as { job_id: string; analysis: string }[];
  const requiredSkillCounts = new Map<string, number>();
  for (const row of latestAnalysisRows) {
    const ja = JSON.parse(row.analysis) as JobAnalysis;
    requiredSkillCounts.set(row.job_id, ja.requiredSkills.length);
  }

  const recentRun = db.prepare('SELECT id, job_id, version_id, before_ats, after_ats, before_match, after_match, truth_passed, created_at FROM tailoring_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(uid) as
    | { id: string; job_id: string; version_id: string; before_ats: number; after_ats: number; before_match: number; after_match: number; truth_passed: number; created_at: string }
    | undefined;

  res.json({
    user: user ? { name: user.name, email: user.email, targetRole: user.target_role, onboarded: !!user.onboarded } : null,
    master,
    ats: ats
      ? {
          overallScore: ats.overallScore,
          formattingScore: ats.formattingScore,
          structureScore: ats.structureScore,
          contentScore: ats.contentScore,
          skillsScore: ats.skillsScore,
          readabilityScore: ats.readabilityScore,
          issues: ats.issues.slice(0, 4),
          working: ats.working.slice(0, 4),
        }
      : null,
    resumes: resumes.filter((r) => r.kind === 'tailored').slice(0, 4).map((r) => ({ id: r.id, title: r.title, atsScore: r.ats_score, updatedAt: r.updated_at })),
    jobs: jobs.map((j) => ({ id: j.id, title: j.title, company: j.company, matchScore: j.match_score, createdAt: j.created_at })),
    requiredSkillCounts: Object.fromEntries(requiredSkillCounts),
    recentRun: recentRun || null,
  });
});

export default router;
