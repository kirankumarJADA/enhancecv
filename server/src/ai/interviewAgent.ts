// AI Interview Agent: preparation packages and mock-interview evaluation.
//
// Truth rules: sample answers are generated ONLY from Master CV evidence and
// are sentence-checked by the deterministic Truth Guard; mock-interview
// answers are checked for unsupported claims deterministically (no invented
// numeric scores — explainable dimensions only).

import { z } from 'zod';
import { AiProvider, AiUnavailableError, isAiEnabled, getAiProvider } from './provider';
import { buildAgentPrompt, TRUTH_RULES, type EvidenceInput } from './evidence';
import { isBulletTruthful } from '../engine/tailor';
import { ResumeData } from '../types';

export const INTERVIEW_CATEGORIES = [
  'BEHAVIOURAL', 'TECHNICAL', 'ROLE_SPECIFIC', 'PROJECT', 'LEADERSHIP',
  'CONFLICT', 'TEAMWORK', 'MOTIVATION', 'COMPANY', 'CAREER', 'HR',
] as const;

const prepSchema = z.object({
  questions: z
    .array(
      z.object({
        category: z.enum(INTERVIEW_CATEGORIES),
        question: z.string().min(10).max(400),
        why_it_may_be_asked: z.string().max(400),
        evidence_from_cv: z.string().max(400),
        recommended_answer_structure: z.string().max(600),
        sample_truthful_answer: z.string().min(20).max(1200),
      })
    )
    .min(4)
    .max(12),
  studyPlan: z.array(z.string().max(300)).max(8),
});

export type InterviewQuestion = z.infer<typeof prepSchema>['questions'][number];
export interface InterviewPrep {
  questions: InterviewQuestion[];
  studyPlan: string[];
  rejectedCount: number;
  provider: string;
  model: string;
}

/** Sentence-level Truth Guard for generated answers. */
function sanitiseAnswer(text: string, master: ResumeData): { text: string; removed: number } {
  const kept: string[] = [];
  let removed = 0;
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const check = isBulletTruthful(sentence, master);
    if (check.ok) kept.push(sentence);
    else removed++;
  }
  if (kept.length === 0) {
    // Nothing survived the Truth Guard: return a neutral, honest placeholder
    // rather than the unsupported content.
    return { text: 'Build this answer from your own Master CV evidence — none of the generated content could be verified.', removed };
  }
  return { text: kept.join(' ').trim(), removed };
}

const PREP_TASK = `Generate an interview preparation package for this job and candidate.
Return JSON:
{"questions": [{"category": one of BEHAVIOURAL|TECHNICAL|ROLE_SPECIFIC|PROJECT|LEADERSHIP|CONFLICT|TEAMWORK|MOTIVATION|COMPANY|CAREER|HR,
   "question": string,
   "why_it_may_be_asked": string,
   "evidence_from_cv": string (which Master CV facts help answer it),
   "recommended_answer_structure": string (STAR guidance),
   "sample_truthful_answer": string (first-person, ONLY Master CV facts)}],
 "studyPlan": string[] (3-6 concrete preparation steps)}
Rules: 8-10 questions spread across categories; every sample answer must only use Master CV evidence; do not invent employers, metrics or achievements.`;

export async function generateInterviewPrep(input: EvidenceInput): Promise<InterviewPrep> {
  if (!isAiEnabled()) {
    throw new AiUnavailableError('AI_NOT_CONFIGURED', 'Interview preparation requires a configured AI provider.', false);
  }
  const provider: AiProvider = getAiProvider();
  const prep = await provider.completeJson({
    system: `You are the Curevo AI Interview Agent. You prepare candidates for real interviews.\n\n${TRUTH_RULES}`,
    user: buildAgentPrompt(input, PREP_TASK),
    schema: prepSchema,
    maxTokens: 2400,
    temperature: 0.4,
  });

  // Truth Guard every sample answer.
  let rejectedCount = 0;
  const questions = prep.questions.map((q) => {
    const { text, removed } = sanitiseAnswer(q.sample_truthful_answer, input.master);
    rejectedCount += removed;
    return { ...q, sample_truthful_answer: text };
  });
  return { questions, studyPlan: prep.studyPlan, rejectedCount, provider: provider.name, model: provider.model };
}

// --- mock interview -----------------------------------------------------------

const evaluationSchema = z.object({
  relevance: z.object({ level: z.enum(['low', 'medium', 'high']), explanation: z.string().max(400) }),
  evidenceUsage: z.string().max(400),
  structure: z.string().max(400),
  clarity: z.string().max(400),
  completeness: z.string().max(400),
  improvements: z.array(z.string().max(300)).max(5),
  followUpQuestion: z.string().max(300),
  overallFeedback: z.string().max(800),
});

export type MockEvaluation = z.infer<typeof evaluationSchema> & {
  unsupportedClaims: string[];
  provider: string;
  model: string;
};

export async function evaluateMockAnswer(input: EvidenceInput & { question: string; answer: string }): Promise<MockEvaluation> {
  if (!isAiEnabled()) {
    throw new AiUnavailableError('AI_NOT_CONFIGURED', 'Mock interviews require a configured AI provider.', false);
  }
  const provider: AiProvider = getAiProvider();

  const evaluation = await provider.completeJson({
    system: `You are the Curevo AI mock interviewer. Evaluate the candidate's answer to one interview question.\n\n${TRUTH_RULES}\nAdditional rules: use explainable qualitative dimensions (low/medium/high with explanations) — never a numeric overall score. Detect any claim NOT supported by the Master CV and mention it in improvements without accusing; list facts that would need evidence.`,
    user: buildAgentPrompt(
      input,
      `INTERVIEW QUESTION:\n${input.question}\n\nCANDIDATE ANSWER:\n${input.answer.slice(0, 3000)}\n\nReturn JSON: {"relevance":{"level":"low|medium|high","explanation":string},"evidenceUsage":string,"structure":string,"clarity":string,"completeness":string,"improvements":string[],"followUpQuestion":string,"overallFeedback":string}`,
    ),
    schema: evaluationSchema,
    maxTokens: 1200,
    temperature: 0.3,
  });

  // Deterministic unsupported-claim detection on the ANSWER itself.
  const unsupported: string[] = [];
  for (const sentence of input.answer.split(/(?<=[.!?])\s+/)) {
    const check = isBulletTruthful(sentence, input.master);
    if (!check.ok && check.unsupported.length > 0) {
      unsupported.push(...check.unsupported);
    }
  }

  return {
    ...evaluation,
    unsupportedClaims: [...new Set(unsupported)],
    provider: provider.name,
    model: provider.model,
  };
}

/** Deterministic follow-up question when AI is unavailable (keeps text mode usable). */
export function nextGenericQuestion(usedCategories: string[]): { category: string; question: string } {
  const pool = [
    { category: 'BEHAVIOURAL', question: 'Describe a project you are proud of and your specific contribution.' },
    { category: 'TECHNICAL', question: 'Walk me through how you would design a typical component of this role.' },
    { category: 'MOTIVATION', question: 'Why are you interested in this kind of role?' },
    { category: 'TEAMWORK', question: 'Tell me about a time you collaborated across teams.' },
    { category: 'CAREER', question: 'Where do you see your next step after this role?' },
  ];
  return pool.find((q) => !usedCategories.includes(q.category)) || pool[0];
}
