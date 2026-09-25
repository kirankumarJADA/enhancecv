import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { getDb, newId, withTransaction, asQueryable, TS_TEXT } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { analyseJobDescription } from '../engine/jd';
import { computeJobMatch } from '../engine/match';
import { tailorResume } from '../engine/tailor';
import { runResumeAgent } from '../ai/resumeAgent';
import { getAiStatus } from '../ai/provider';
import { analyseATS } from '../engine/ats';
import { getMasterRow, resumeRowToData } from './master';
import { enforceQuota, recordUsage } from '../lib/plans';
import { track } from '../lib/analytics';
import { JobAnalysis, MatchAnalysis } from '../types';

const router = Router();

const EXAMPLE_JD = `Senior Java Backend Engineer

Nomos Bank is building the next generation of its digital banking platform and looking for a Senior Java Backend Engineer to join our Payments team in Manchester (hybrid).

About the role
You will design and build high-throughput payment services used by over 2 million customers, working closely with product and platform teams.

What you'll do
- Design, build and operate REST APIs and microservices in Java 17 and Spring Boot
- Improve reliability and observability of payment flows (Kafka, Prometheus, Grafana)
- Optimise PostgreSQL data models and queries for scale
- Champion CI/CD, automated testing and code review culture
- Mentor mid-level engineers and lead design reviews

What we're looking for
- 5+ years of backend engineering experience with Java and Spring Boot
- Strong REST API design and microservices experience
- Solid PostgreSQL and query optimisation skills
- Experience with Docker and Kubernetes in production
- Experience with Kafka or similar message queues
- Bachelor's degree in Computer Science or equivalent practical experience

Nice to have
- AWS (EKS, RDS) and Terraform experience
- Experience in fintech or payments
- Kubernetes certification (CKA) is a plus

We offer competitive salary, hybrid working, and a genuine commitment to engineering culture.`;

// ---------- routes ----------

router.get('/example', requireAuth, (_req, res) => {
  res.json({ text: EXAMPLE_JD });
});

/** List the user's job descriptions with latest analysis + match scores. */
router.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  const jobsResult = await db.query(
    `SELECT id, title, company, raw_text, ${TS_TEXT('created_at')} AS created_at
     FROM job_descriptions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user!.uid],
  );
  const jobs = jobsResult.rows as { id: string; title: string; company: string; raw_text: string; created_at: string }[];

  const result = [];
  for (const j of jobs) {
    const analysis = (await db.query(
      'SELECT analysis FROM job_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
      [j.id],
    )).rows[0] as { analysis: string } | undefined;
    const match = (await db.query(
      'SELECT score FROM match_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
      [j.id],
    )).rows[0] as { score: number } | undefined;
    result.push({
      id: j.id,
      title: j.title,
      company: j.company,
      createdAt: j.created_at,
      analysis: analysis ? (JSON.parse(analysis.analysis) as JobAnalysis) : null,
      matchScore: match?.score ?? null,
    });
  }
  res.json({ jobs: result });
});

/** Analyse a pasted job description. */
router.post('/analyse', requireAuth, rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const body = z.object({ text: z.string().min(1).max(40000) }).parse(req.body);
  const text = body.text.trim();
  if (text.length < 80) throw new AppError('JD_TOO_SHORT', 'This job description looks too short to analyse. Paste the complete description.', 400);

  const db = getDb();
  const job = analyseJobDescription(text);
  const jobId = newId('job');
  const analysisId = newId('ja');

  // job description, analysis and (optional) match are one logical unit.
  const match = await withTransaction(async (client: PoolClient) => {
    await client.query(
      'INSERT INTO job_descriptions (id, user_id, title, company, raw_text) VALUES ($1, $2, $3, $4, $5)',
      [jobId, req.user!.uid, job.title, job.company, text],
    );
    await client.query(
      'INSERT INTO job_analyses (id, user_id, job_id, analysis) VALUES ($1, $2, $3, $4)',
      [analysisId, req.user!.uid, jobId, JSON.stringify(job)],
    );

    const masterRow = await getMasterRow(asQueryable(client), req.user!.uid);
    if (masterRow) {
      const master = resumeRowToData(masterRow);
      const m = computeJobMatch(master, job);
      await client.query(
        'INSERT INTO match_analyses (id, user_id, job_id, master_resume_id, analysis, score) VALUES ($1, $2, $3, $4, $5, $6)',
        [newId('ma'), req.user!.uid, jobId, masterRow.id, JSON.stringify(m), m.score],
      );
      return m;
    }
    return null;
  });

  track(req.user!.uid, 'job_analyzed', { title: job.title, requiredSkillCount: job.requiredSkills.length, hasMatch: !!match });

  res.status(201).json({ jobId, analysisId, analysis: job, match });
});

/** Get one job description with its latest analysis and match. */
router.get('/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const jobResult = await db.query(
    `SELECT id, user_id, title, company, raw_text, ${TS_TEXT('created_at')} AS created_at
     FROM job_descriptions
     WHERE id = $1`,
    [req.params.id],
  );
  const job = jobResult.rows[0] as
    | { id: string; user_id: string; title: string; company: string; raw_text: string; created_at: string }
    | undefined;
  if (!job) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
  if (job.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);

  const analysisRow = (await db.query(
    'SELECT analysis FROM job_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
    [job.id],
  )).rows[0] as { analysis: string } | undefined;
  const matchRow = (await db.query(
    'SELECT analysis, score FROM match_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
    [job.id],
  )).rows[0] as { analysis: string; score: number } | undefined;

  res.json({
    job: { id: job.id, title: job.title, company: job.company, createdAt: job.created_at },
    rawText: job.raw_text,
    analysis: analysisRow ? (JSON.parse(analysisRow.analysis) as JobAnalysis) : null,
    match: matchRow ? (JSON.parse(matchRow.analysis) as MatchAnalysis) : null,
  });
});

/** Recompute (or compute) the match of the current Master CV against a job. */
router.post('/:id/match', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const db = getDb();
  const jobResult = await db.query(
    'SELECT id, user_id, raw_text FROM job_descriptions WHERE id = $1',
    [req.params.id],
  );
  const job = jobResult.rows[0] as { id: string; user_id: string; raw_text: string } | undefined;
  if (!job) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
  if (job.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);

  const masterRow = await getMasterRow(db, req.user!.uid);
  if (!masterRow) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);

  const master = resumeRowToData(masterRow);
  const analysisRow = (await db.query(
    'SELECT analysis FROM job_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
    [job.id],
  )).rows[0] as { analysis: string } | undefined;
  const jd = analysisRow ? (JSON.parse(analysisRow.analysis) as JobAnalysis) : analyseJobDescription(job.raw_text);
  const match = computeJobMatch(master, jd);
  await db.query(
    'INSERT INTO match_analyses (id, user_id, job_id, master_resume_id, analysis, score) VALUES ($1, $2, $3, $4, $5, $6)',
    [newId('ma'), req.user!.uid, job.id, masterRow.id, JSON.stringify(match), match.score],
  );
  res.json({ match });
});

/** Run the full tailoring pipeline: master + JD → tailored version + truth report. */
router.post('/:id/tailor', requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const db = getDb();
  const jobResult = await db.query(
    'SELECT id, user_id, raw_text FROM job_descriptions WHERE id = $1',
    [req.params.id],
  );
  const job = jobResult.rows[0] as { id: string; user_id: string; raw_text: string } | undefined;
  if (!job) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
  if (job.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);

  const masterRow = await getMasterRow(db, req.user!.uid);
  if (!masterRow) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);

  // Server-side plan enforcement — keyed on the authenticated user.
  await enforceQuota(req.user!.uid, 'tailoring');

  const master = resumeRowToData(masterRow);
  const analysisRow = (await db.query(
    'SELECT analysis FROM job_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
    [job.id],
  )).rows[0] as { analysis: string } | undefined;
  const jd = analysisRow ? (JSON.parse(analysisRow.analysis) as JobAnalysis) : analyseJobDescription(job.raw_text);

  // Deterministic match against master
  const matchBefore = computeJobMatch(master, jd);
  const atsBefore = analyseATS(master);

  // Curevo AI Resume Agent: deterministic floor + AI reasoning (when
  // configured) + Truth Guard + deterministic re-verification. Falls back to
  // the deterministic result on any AI failure — this route never fails
  // because of the AI provider.
  const agentStarted = Date.now();
  const agentResult = await runResumeAgent(master, jd, job.raw_text, matchBefore, atsBefore);
  const atsAfter = agentResult.atsAfter;
  const matchAfter = agentResult.matchAfter;

  // Persist tailored version + run record together.
  const versionId = newId('res');
  const title = jd.title !== 'Unknown Title' ? `${jd.title}${jd.company ? ` — ${jd.company}` : ''}` : `Tailored CV ${new Date().toISOString().slice(0, 10)}`;
  const runId = newId('run');

  await withTransaction(async (client: PoolClient) => {
    await client.query(
      `INSERT INTO resumes (id, user_id, kind, title, content, job_id, ats_score)
       VALUES ($1, $2, 'tailored', $3, $4, $5, $6)`,
      [versionId, req.user!.uid, title, JSON.stringify(agentResult.resume), job.id, atsAfter.overallScore],
    );
    await client.query(
      `INSERT INTO tailoring_runs
        (id, user_id, job_id, match_analysis_id, version_id, before_ats, after_ats, before_match, after_match,
         truth_passed, change_log, truth_report, keyword_coverage_before, keyword_coverage_after)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        runId,
        req.user!.uid,
        job.id,
        versionId,
        atsBefore.overallScore,
        atsAfter.overallScore,
        matchBefore.score,
        matchAfter.score,
        agentResult.truth.passedAll,
        JSON.stringify(agentResult.changeLog),
        JSON.stringify(agentResult.truth),
        matchBefore.keywordCoverage.percent,
        matchAfter.keywordCoverage.percent,
      ],
    );
  });

  // Persist AI run metadata (best effort — never blocks the response).
  try {
    const db2 = getDb();
    await db2.query(
      `INSERT INTO ai_runs (id, user_id, job_id, resume_id, provider, model, status, error_code, iterations, rejected_claims, duration_ms, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        newId('airun'),
        req.user!.uid,
        job.id,
        versionId,
        agentResult.agent.provider,
        agentResult.agent.model,
        agentResult.agent.usedAi ? 'succeeded' : agentResult.agent.errorCode ? 'fallback' : 'succeeded',
        agentResult.agent.errorCode || null,
        agentResult.agent.iterations,
        agentResult.agent.rejectedCount,
        Date.now() - agentStarted,
      ],
    );
  } catch {
    // logging must never break the user-facing operation
  }

  // Quota consumption + analytics — only after the run actually succeeded.
  await recordUsage(req.user!.uid, 'tailoring');
  track(req.user!.uid, 'resume_tailored', { jobId: job.id, versionId, atsBefore: atsBefore.overallScore, atsAfter: atsAfter.overallScore });
  if (agentResult.agent.usedAi) {
    track(req.user!.uid, 'ai_tailoring_completed', { provider: agentResult.agent.provider, iterations: agentResult.agent.iterations, rejectedClaims: agentResult.agent.rejectedCount });
  } else if (agentResult.agent.errorCode) {
    track(req.user!.uid, 'ai_tailoring_failed', { errorCode: agentResult.agent.errorCode, fellBackToDeterministic: true });
  }

  res.status(201).json({
    runId,
    versionId,
    title,
    before: { ats: atsBefore.overallScore, match: matchBefore.score, keywordCoverage: matchBefore.keywordCoverage.percent, matchedSkills: matchBefore.matchedSkills.length, missingSkills: matchBefore.missingSkills.length },
    after: { ats: atsAfter.overallScore, match: matchAfter.score, keywordCoverage: matchAfter.keywordCoverage.percent, matchedSkills: matchAfter.matchedSkills.length, missingSkills: matchAfter.missingSkills.length },
    changeLog: agentResult.changeLog,
    truth: agentResult.truth,
    resume: agentResult.resume,
    agent: {
      ...agentResult.agent,
      aiConfigured: getAiStatus().enabled,
    },
  });
});

export default router;
