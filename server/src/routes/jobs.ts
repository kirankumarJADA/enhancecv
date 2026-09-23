import { Router } from 'express';
import { z } from 'zod';
import { getDb, newId } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { analyseJobDescription } from '../engine/jd';
import { computeJobMatch } from '../engine/match';
import { tailorResume } from '../engine/tailor';
import { analyseATS } from '../engine/ats';
import { getAiProvider, getOpenAiProvider } from '../ai/provider';
import { getMasterRow, resumeRowToData, sanitizeResumeData } from './master';
import { JobAnalysis, MatchAnalysis, TailoringResult, DEFAULT_SECTION_ORDER, ALL_SECTIONS } from '../types';

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
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const jobs = db.prepare('SELECT id, title, company, raw_text, created_at FROM job_descriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user!.uid) as
    { id: string; title: string; company: string; raw_text: string; created_at: string }[];
  const result = jobs.map((j) => {
    const analysis = db.prepare('SELECT analysis FROM job_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(j.id) as { analysis: string } | undefined;
    const match = db.prepare('SELECT score FROM match_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(j.id) as { score: number } | undefined;
    return {
      id: j.id,
      title: j.title,
      company: j.company,
      createdAt: j.created_at,
      analysis: analysis ? (JSON.parse(analysis.analysis) as JobAnalysis) : null,
      matchScore: match?.score ?? null,
    };
  });
  res.json({ jobs: result });
});

/** Analyse a pasted job description. */
router.post('/analyse', requireAuth, rateLimit({ windowMs: 60_000, max: 20 }), (req, res) => {
  const body = z.object({ text: z.string().min(1).max(40000) }).parse(req.body);
  const text = body.text.trim();
  if (text.length < 80) throw new AppError('JD_TOO_SHORT', 'This job description looks too short to analyse. Paste the complete description.', 400);

  const db = getDb();
  const job = analyseJobDescription(text);
  const jobId = newId('job');
  db.prepare('INSERT INTO job_descriptions (id, user_id, title, company, raw_text) VALUES (?, ?, ?, ?, ?)')
    .run(jobId, req.user!.uid, job.title, job.company, text);
  const analysisId = newId('ja');
  db.prepare('INSERT INTO job_analyses (id, user_id, job_id, analysis) VALUES (?, ?, ?, ?)')
    .run(analysisId, req.user!.uid, jobId, JSON.stringify(job));

  // If the user already has a Master CV, compute the match immediately
  const masterRow = getMasterRow(db, req.user!.uid);
  let match: MatchAnalysis | null = null;
  if (masterRow) {
    const master = resumeRowToData(masterRow);
    match = computeJobMatch(master, job);
    db.prepare('INSERT INTO match_analyses (id, user_id, job_id, master_resume_id, analysis, score) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId('ma'), req.user!.uid, jobId, masterRow.id, JSON.stringify(match), match.score);
  }

  res.status(201).json({ jobId, analysisId, analysis: job, match });
});

/** Get one job description with its latest analysis and match. */
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT id, user_id, title, company, raw_text, created_at FROM job_descriptions WHERE id = ?').get(req.params.id) as
    | { id: string; user_id: string; title: string; company: string; raw_text: string; created_at: string }
    | undefined;
  if (!job) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
  if (job.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  const analysisRow = db.prepare('SELECT analysis FROM job_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(job.id) as { analysis: string } | undefined;
  const matchRow = db.prepare('SELECT analysis, score FROM match_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(job.id) as { analysis: string; score: number } | undefined;
  res.json({
    job: { id: job.id, title: job.title, company: job.company, createdAt: job.created_at },
    rawText: job.raw_text,
    analysis: analysisRow ? (JSON.parse(analysisRow.analysis) as JobAnalysis) : null,
    match: matchRow ? (JSON.parse(matchRow.analysis) as MatchAnalysis) : null,
  });
});

/** Recompute (or compute) the match of the current Master CV against a job. */
router.post('/:id/match', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT id, user_id, raw_text FROM job_descriptions WHERE id = ?').get(req.params.id) as
    | { id: string; user_id: string; raw_text: string }
    | undefined;
  if (!job) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
  if (job.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  const masterRow = getMasterRow(db, req.user!.uid);
  if (!masterRow) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);
  const master = resumeRowToData(masterRow);
  const analysisRow = db.prepare('SELECT analysis FROM job_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(job.id) as { analysis: string } | undefined;
  const jd = analysisRow ? (JSON.parse(analysisRow.analysis) as JobAnalysis) : analyseJobDescription(job.raw_text);
  const match = computeJobMatch(master, jd);
  db.prepare('INSERT INTO match_analyses (id, user_id, job_id, master_resume_id, analysis, score) VALUES (?, ?, ?, ?, ?, ?)')
    .run(newId('ma'), req.user!.uid, job.id, masterRow.id, JSON.stringify(match), match.score);
  res.json({ match });
});

/** Run the full tailoring pipeline: master + JD → tailored version + truth report. */
router.post('/:id/tailor', requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT id, user_id, raw_text FROM job_descriptions WHERE id = ?').get(req.params.id) as
    | { id: string; user_id: string; raw_text: string }
    | undefined;
  if (!job) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
  if (job.user_id !== req.user!.uid) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  const masterRow = getMasterRow(db, req.user!.uid);
  if (!masterRow) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);

  const master = resumeRowToData(masterRow);
  const analysisRow = db.prepare('SELECT analysis FROM job_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(job.id) as { analysis: string } | undefined;
  const jd = analysisRow ? (JSON.parse(analysisRow.analysis) as JobAnalysis) : analyseJobDescription(job.raw_text);

  // Deterministic match against master
  const matchBefore = computeJobMatch(master, jd);
  const atsBefore = analyseATS(master);

  // Provider (rule-based by default; OpenAI used for phrasing if configured)
  const provider = getAiProvider();
  const openai = getOpenAiProvider();
  let result: TailoringResult;
  if (openai) {
    // Async LLM path: improve weak bullets first, then run the deterministic pipeline
    const improved = master;
    for (const exp of improved.experience) {
      for (let i = 0; i < exp.bullets.length; i++) {
        const b = exp.bullets[i];
        if (/\b(worked on|worked with|helped|responsible for)\b/i.test(b)) {
          const r = await openai.requestBulletImprovement(b, [...improved.skills.technical]);
          if (r) exp.bullets[i] = r.text;
        }
      }
    }
    void provider;
    result = await tailorResume(improved, jd, matchBefore);
  } else {
    result = await tailorResume(master, jd, matchBefore, provider);
  }

  // Score the tailored resume
  const atsAfter = analyseATS(result.resume);
  const matchAfter = computeJobMatch(result.resume, jd);

  // Persist tailored version
  const versionId = newId('res');
  const title = jd.title !== 'Unknown Title' ? `${jd.title}${jd.company ? ` — ${jd.company}` : ''}` : `Tailored CV ${new Date().toISOString().slice(0, 10)}`;
  db.prepare(
    "INSERT INTO resumes (id, user_id, kind, title, content, job_id, ats_score) VALUES (?, ?, 'tailored', ?, ?, ?, ?)"
  ).run(versionId, req.user!.uid, title, JSON.stringify(result.resume), job.id, atsAfter.overallScore);

  const runId = newId('run');
  db.prepare(
    `INSERT INTO tailoring_runs
      (id, user_id, job_id, match_analysis_id, version_id, before_ats, after_ats, before_match, after_match,
       truth_passed, change_log, truth_report, keyword_coverage_before, keyword_coverage_after)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    runId,
    req.user!.uid,
    job.id,
    versionId,
    atsBefore.overallScore,
    atsAfter.overallScore,
    matchBefore.score,
    matchAfter.score,
    result.truth.passedAll ? 1 : 0,
    JSON.stringify(result.changeLog),
    JSON.stringify(result.truth),
    matchBefore.keywordCoverage.percent,
    matchAfter.keywordCoverage.percent
  );

  res.status(201).json({
    runId,
    versionId,
    title,
    before: { ats: atsBefore.overallScore, match: matchBefore.score, keywordCoverage: matchBefore.keywordCoverage.percent, matchedSkills: matchBefore.matchedSkills.length, missingSkills: matchBefore.missingSkills.length },
    after: { ats: atsAfter.overallScore, match: matchAfter.score, keywordCoverage: matchAfter.keywordCoverage.percent, matchedSkills: matchAfter.matchedSkills.length, missingSkills: matchAfter.missingSkills.length },
    changeLog: result.changeLog,
    truth: result.truth,
    resume: result.resume,
  });
});

export { sanitizeResumeData, DEFAULT_SECTION_ORDER, ALL_SECTIONS };
export default router;
