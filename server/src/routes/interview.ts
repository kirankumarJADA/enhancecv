// Interview system: preparation packages and mock interview sessions.
// PREP sessions are generated once and stored. MOCK sessions walk through
// questions one at a time; answers are truth-checked deterministically and
// evaluated with explainable qualitative dimensions (never invented scores).

import { Router } from 'express';
import { z } from 'zod';
import { getDb, newId } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { generateInterviewPrep, evaluateMockAnswer, nextGenericQuestion } from '../ai/interviewAgent';
import { getMasterRow, resumeRowToData } from './master';
import { computeJobMatch } from '../engine/match';
import { analyseJobDescription } from '../engine/jd';
import { enforceQuota, recordUsage } from '../lib/plans';
import { track } from '../lib/analytics';
import { asQueryable, TS_TEXT } from '../db/db';
import type { PoolClient } from 'pg';
import { JobAnalysis, ResumeData } from '../types';

const router = Router();

async function loadContext(userId: string, jobId?: string, resumeId?: string) {
  const db = getDb();
  const masterRow = await getMasterRow(db, userId);
  if (!masterRow) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);
  const master = resumeRowToData(masterRow);

  let resume: ResumeData = master;
  if (resumeId) {
    const row = (await db.query('SELECT id, user_id, content FROM resumes WHERE id = $1', [resumeId])).rows[0] as
      | { id: string; user_id: string; content: string }
      | undefined;
    if (!row) throw new AppError('NOT_FOUND', 'Resume not found.', 404);
    if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this resume.', 403);
    resume = resumeRowToData(row);
  }

  let job: JobAnalysis | null = null;
  let jdText: string | null = null;
  if (jobId) {
    const row = (await db.query('SELECT id, user_id, raw_text FROM job_descriptions WHERE id = $1', [jobId])).rows[0] as
      | { id: string; user_id: string; raw_text: string }
      | undefined;
    if (!row) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
    if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this job.', 403);
    jdText = row.raw_text;
    const a = (await db.query('SELECT analysis FROM job_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1', [row.id])).rows[0] as { analysis: string } | undefined;
    job = a ? (JSON.parse(a.analysis) as JobAnalysis) : analyseJobDescription(row.raw_text);
  }

  const match = job ? computeJobMatch(master, job) : null;
  return { master, resume, job, jdText, match };
}

async function findOwnedSession(id: string, userId: string) {
  const row = (await getDb().query(
    `SELECT id, user_id, job_id, resume_id, application_id, mode, kind, status, overall_feedback,
            ${TS_TEXT('created_at')} AS created_at, ${TS_TEXT('completed_at')} AS completed_at
     FROM interview_sessions WHERE id = $1`,
    [id],
  )).rows[0] as
    | {
        id: string; user_id: string; job_id: string | null; resume_id: string | null; application_id: string | null;
        mode: 'TEXT' | 'VOICE'; kind: 'PREP' | 'MOCK'; status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
        overall_feedback: string | null; created_at: string; completed_at: string | null;
      }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Interview session not found.', 404);
  if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this session.', 403);
  return row;
}

async function loadQuestions(sessionId: string) {
  return (await getDb().query(
    'SELECT id, position, category, question, why_it_may_be_asked, evidence_from_cv, recommended_answer_structure, sample_truthful_answer FROM interview_questions WHERE session_id = $1 ORDER BY position',
    [sessionId],
  )).rows as {
    id: string; position: number; category: string; question: string; why_it_may_be_asked: string;
    evidence_from_cv: string; recommended_answer_structure: string; sample_truthful_answer: string;
  }[];
}

function withIds(questions: { category: string; question: string; why_it_may_be_asked: string; evidence_from_cv: string; recommended_answer_structure: string; sample_truthful_answer: string }[]) {
  return questions.map((q, i) => ({ ...q, id: newId('iq'), position: i }));
}

async function insertQuestions(client: { query: (s: string, v?: unknown[]) => Promise<unknown> }, sessionId: string, questions: { id: string; category: string; question: string; why_it_may_be_asked: string; evidence_from_cv: string; recommended_answer_structure: string; sample_truthful_answer: string }[]) {
  let pos = 0;
  for (const q of questions) {
    await client.query(
      `INSERT INTO interview_questions (id, session_id, position, category, question, why_it_may_be_asked, evidence_from_cv, recommended_answer_structure, sample_truthful_answer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [q.id, sessionId, pos++, q.category, q.question, q.why_it_may_be_asked, q.evidence_from_cv, q.recommended_answer_structure, q.sample_truthful_answer],
    );
  }
}

/** Interview preparation package (questions + STAR structures + study plan). */
router.post('/prepare', requireAuth, rateLimit({ windowMs: 60_000, max: 6 }), async (req, res) => {
  const body = z.object({
    jobId: z.string().max(64).optional(),
    resumeId: z.string().max(64).optional(),
    applicationId: z.string().max(64).optional(),
  }).parse(req.body);
  const uid = req.user!.uid;

  await enforceQuota(uid, 'interviewPrep');
  const ctx = await loadContext(uid, body.jobId, body.resumeId);

  const prep = await generateInterviewPrep({
    master: ctx.master,
    resume: ctx.resume,
    job: ctx.job,
    jdText: ctx.jdText,
    match: ctx.match,
  });

  const sessionId = newId('ivs');
  const questionsWithIds = withIds(prep.questions);
  await withSessionTransaction(async (client) => {
    await client.query(
      `INSERT INTO interview_sessions (id, user_id, job_id, resume_id, application_id, mode, kind, status, completed_at)
       VALUES ($1,$2,$3,$4,$5,'TEXT','PREP','COMPLETED',NOW())`,
      [sessionId, uid, body.jobId || null, body.resumeId || null, body.applicationId || null],
    );
    await insertQuestions(client, sessionId, questionsWithIds);
  });

  await recordUsage(uid, 'interviewPrep');
  track(uid, 'interview_prep_generated', { rejectedClaims: prep.rejectedCount, questionCount: prep.questions.length });

  res.status(201).json({
    sessionId,
    kind: 'PREP',
    questions: prep.questions,
    studyPlan: prep.studyPlan,
    meta: { rejectedClaims: prep.rejectedCount, provider: prep.provider, model: prep.model },
  });
});

async function withSessionTransaction(fn: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await getDb().connect();
  try {
    await client.query('BEGIN');
    await fn(client);
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Start a mock interview session (creates the question set up front). */
router.post('/session', requireAuth, rateLimit({ windowMs: 60_000, max: 6 }), async (req, res) => {
  const body = z.object({
    jobId: z.string().max(64).optional(),
    resumeId: z.string().max(64).optional(),
    applicationId: z.string().max(64).optional(),
    mode: z.enum(['TEXT', 'VOICE']).optional().default('TEXT'),
  }).parse(req.body);
  const uid = req.user!.uid;

  await enforceQuota(uid, 'mockInterview');
  const ctx = await loadContext(uid, body.jobId, body.resumeId);

  // Generate the question set. Voice mode records the mode — speech processing
  // is a client-side concern (browser microphone + abstracted provider); the
  // question/answer protocol is identical.
  let questions: { category: string; question: string; why_it_may_be_asked: string; evidence_from_cv: string; recommended_answer_structure: string; sample_truthful_answer: string }[];
  let provider = 'deterministic';
  let rejectedClaims = 0;
  try {
    const { generateInterviewPrep } = await import('../ai/interviewAgent');
    const prep = await generateInterviewPrep({ master: ctx.master, resume: ctx.resume, job: ctx.job, jdText: ctx.jdText, match: ctx.match });
    questions = prep.questions.slice(0, 6);
    provider = prep.provider;
    rejectedClaims = prep.rejectedCount;
  } catch (err) {
    // Graceful deterministic fallback so text mock interviews work without AI:
    // generic questions, no fabricated sample answers.
    const categories = ['BEHAVIOURAL', 'TECHNICAL', 'MOTIVATION', 'TEAMWORK'];
    const used: string[] = [];
    questions = categories.map((category) => {
      const generic = nextGenericQuestion(used);
      used.push(category);
      return {
        category,
        question: generic.question,
        why_it_may_be_asked: 'Standard interview screening question.',
        evidence_from_cv: 'Answer from your own Master CV evidence.',
        recommended_answer_structure: 'Use STAR: Situation, Task, Action, Result.',
        sample_truthful_answer: '',
      };
    });
  }

  const sessionId = newId('ivs');
  const questionsWithIds = withIds(questions);
  await withSessionTransaction(async (client) => {
    await client.query(
      `INSERT INTO interview_sessions (id, user_id, job_id, resume_id, application_id, mode, kind, status)
       VALUES ($1,$2,$3,$4,$5,$6,'MOCK','ACTIVE')`,
      [sessionId, uid, body.jobId || null, body.resumeId || null, body.applicationId || null, body.mode],
    );
    await insertQuestions(client, sessionId, questionsWithIds);
  });

  await recordUsage(uid, 'mockInterview');
  track(uid, 'mock_interview_started', { mode: body.mode, provider, questions: questions.length });

  res.status(201).json({
    sessionId,
    mode: body.mode,
    questions: questionsWithIds.map((q, i) => ({
      id: q.id,
      position: i,
      category: q.category,
      question: q.question,
      why_it_may_be_asked: q.why_it_may_be_asked,
      evidence_from_cv: q.evidence_from_cv,
      recommended_answer_structure: q.recommended_answer_structure,
      // Sample answers are NOT shown during a mock interview.
    })),
    meta: { provider, rejectedClaims },
  });
});

/** Submit an answer for evaluation and get the next question. */
router.post('/session/:id/answer', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const body = z.object({
    questionId: z.string().min(1).max(64),
    answer: z.string().min(10).max(5000),
  }).parse(req.body);
  const uid = req.user!.uid;

  const session = await findOwnedSession(req.params.id, uid);
  if (session.status !== 'ACTIVE') throw new AppError('VALIDATION', 'This session is not active. Restart or finish it first.', 400);

  const questions = await loadQuestions(session.id);
  const question = questions.find((q) => q.id === body.questionId);
  if (!question) throw new AppError('NOT_FOUND', 'Question not found in this session.', 404);

  const already = (await getDb().query('SELECT id FROM interview_answers WHERE session_id = $1 AND question_id = $2', [session.id, question.id])).rows.length > 0;
  if (already) throw new AppError('VALIDATION', 'This question has already been answered.', 400);

  const ctx = await loadContext(uid, session.job_id || undefined, session.resume_id || undefined);
  const evaluation = await evaluateMockAnswer({
    master: ctx.master,
    resume: ctx.resume,
    job: ctx.job,
    jdText: ctx.jdText,
    match: ctx.match,
    question: question.question,
    answer: body.answer,
  });

  await getDb().query(
    'INSERT INTO interview_answers (id, session_id, question_id, answer, evaluation) VALUES ($1,$2,$3,$4,$5)',
    [newId('iwa'), session.id, question.id, body.answer, JSON.stringify(evaluation)],
  );

  const answered = (await getDb().query('SELECT question_id FROM interview_answers WHERE session_id = $1', [session.id])).rows as { question_id: string }[];
  const answeredIds = new Set(answered.map((a) => a.question_id));
  const next = questions.find((q) => !answeredIds.has(q.id)) || null;

  res.json({
    evaluation: {
      relevance: evaluation.relevance,
      evidenceUsage: evaluation.evidenceUsage,
      structure: evaluation.structure,
      clarity: evaluation.clarity,
      completeness: evaluation.completeness,
      unsupportedClaims: evaluation.unsupportedClaims,
      improvements: evaluation.improvements,
      followUpQuestion: evaluation.followUpQuestion,
      overallFeedback: evaluation.overallFeedback,
    },
    next: next ? { id: next.id, position: next.position, category: next.category, question: next.question } : null,
    progress: { answered: answered.length, total: questions.length },
  });
});

/** Finish a session: deterministic aggregate feedback (no invented scores). */
router.post('/session/:id/finish', requireAuth, async (req, res) => {
  const session = await findOwnedSession(req.params.id, req.user!.uid);
  const questions = await loadQuestions(session.id);
  const answers = (await getDb().query(
    'SELECT question_id, answer, evaluation FROM interview_answers WHERE session_id = $1',
    [session.id],
  )).rows as { question_id: string; answer: string; evaluation: string }[];

  const byId = new Map(questions.map((q) => [q.id, q]));
  const evals = answers.map((a) => ({ ...a, parsed: JSON.parse(a.evaluation) as { relevance?: { level: string }; unsupportedClaims?: string[]; overallFeedback?: string } }));
  const counts = { high: 0, medium: 0, low: 0, unanswered: 0 };
  for (const q of questions) {
    const e = evals.find((x) => x.question_id === q.id);
    if (!e) counts.unanswered++;
    else counts[(e.parsed.relevance?.level || 'medium') as 'high' | 'medium' | 'low']++;
  }
  const unsupported = [...new Set(evals.flatMap((e) => e.parsed.unsupportedClaims || []))];
  const feedback = [
    `Answered ${answers.length} of ${questions.length} questions (relevance: ${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.unanswered} unanswered).`,
    unsupported.length > 0
      ? `Claims needing evidence: ${unsupported.join(', ')}. Add these to your Master CV if they are real, or avoid relying on them.`
      : 'No unsupported claims were detected in your answers.',
    ...evals.slice(0, 3).map((e) => `On "${byId.get(e.question_id)?.question.slice(0, 60) || 'question'}": ${e.parsed.overallFeedback || ''}`.slice(0, 400)),
  ].join('\n\n');

  await getDb().query(
    "UPDATE interview_sessions SET status = 'COMPLETED', overall_feedback = $1, completed_at = NOW() WHERE id = $2",
    [feedback, session.id],
  );
  track(req.user!.uid, 'mock_interview_completed', { answered: answers.length, total: questions.length });

  res.json({ ok: true, overallFeedback: feedback, progress: { answered: answers.length, total: questions.length } });
});

/** List interview history. */
router.get('/history', requireAuth, async (req, res) => {
  const rows = (await getDb().query(
    `SELECT s.id, s.job_id, s.resume_id, s.application_id, s.mode, s.kind, s.status, s.overall_feedback,
            ${TS_TEXT('s.created_at')} AS created_at, ${TS_TEXT('s.completed_at')} AS completed_at,
            (SELECT COUNT(*)::int FROM interview_questions q WHERE q.session_id = s.id) AS question_count,
            (SELECT COUNT(*)::int FROM interview_answers a WHERE a.session_id = s.id) AS answer_count,
            j.title AS job_title
     FROM interview_sessions s
     LEFT JOIN job_descriptions j ON j.id = s.job_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC
     LIMIT 50`,
    [req.user!.uid],
  )).rows;
  res.json({ sessions: rows });
});

/** Full session detail (questions + answers + evaluations). */
router.get('/session/:id', requireAuth, async (req, res) => {
  const session = await findOwnedSession(req.params.id, req.user!.uid);
  const questions = await loadQuestions(session.id);
  const answers = (await getDb().query(
    'SELECT question_id, answer, evaluation FROM interview_answers WHERE session_id = $1',
    [session.id],
  )).rows as { question_id: string; answer: string; evaluation: string }[];
  const evalByQuestion = new Map(answers.map((a) => [a.question_id, JSON.parse(a.evaluation)]));

  res.json({
    session,
    questions: questions.map((q) => ({
      ...q,
      answer: answers.find((a) => a.question_id === q.id)?.answer || null,
      evaluation: session.kind === 'PREP' ? undefined : evalByQuestion.get(q.id) || null,
    })),
  });
});

/** Pause / resume a session. */
router.post('/session/:id/pause', requireAuth, async (req, res) => {
  const session = await findOwnedSession(req.params.id, req.user!.uid);
  const next = session.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
  if (session.status !== 'COMPLETED') {
    await getDb().query('UPDATE interview_sessions SET status = $1 WHERE id = $2', [next, session.id]);
  }
  res.json({ ok: true, status: session.status === 'COMPLETED' ? 'COMPLETED' : next });
});

export default router;
