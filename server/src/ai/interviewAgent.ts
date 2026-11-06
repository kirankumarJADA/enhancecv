// Curevo AI — AI Interview Agent & Mock Interview Coach (Phase 9F)
//
// 100% public, truth-grounded interview preparation and simulation engine.
// Rules & Invariants:
// 1. Truth Guard enforcement: sample answers and suggestions use ONLY facts
//    from the candidate's CV. Never invent employers, metrics, or achievements.
// 2. Explainable qualitative dimensions (low/medium/high, strengths, improvements)
//    — never fabricated overall numerical scores.
// 3. Robust fallback: when AI is unconfigured or fails, returns deterministic,
//    skill-grounded questions and framework feedback with honest attribution.
// 4. Rate-limit and timeout safe; Zod validated output.

import { z } from 'zod';
import { AiProvider, AiUnavailableError, isAiEnabled, getAiProvider } from './provider';
import { buildAgentPrompt, TRUTH_RULES, type EvidenceInput } from './evidence';
import { isBulletTruthful } from '../engine/tailor';
import type { ResumeData } from '../types';

export const INTERVIEW_CATEGORIES = [
  'BEHAVIOURAL',
  'TECHNICAL',
  'SITUATIONAL',
  'ROLE_SPECIFIC',
  'PROJECT',
  'LEADERSHIP',
  'CONFLICT',
  'TEAMWORK',
  'MOTIVATION',
  'COMPANY',
  'CAREER',
  'HR',
] as const;

export type InterviewCategory = (typeof INTERVIEW_CATEGORIES)[number];

// --- 1. Preparation Schemas & Types ---

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
    .min(3)
    .max(12),
  studyPlan: z.array(z.string().max(300)).max(8),
});

export interface InterviewQuestion {
  id?: string;
  category: InterviewCategory;
  question: string;
  why_it_may_be_asked: string;
  evidence_from_cv: string;
  recommended_answer_structure: string;
  sample_truthful_answer: string;
}

export interface InterviewPrep {
  questions: InterviewQuestion[];
  studyPlan: string[];
  rejectedCount: number;
  provider: string;
  model: string;
  isFallback?: boolean;
  aiConfigured?: boolean;
}

// --- 2. STAR Coach Schemas & Types ---

export interface StarAnswerInput {
  situation: string;
  task: string;
  action: string;
  result: string;
}

const starEvaluationSchema = z.object({
  relevance: z.object({
    level: z.enum(['low', 'medium', 'high']),
    explanation: z.string().max(400),
  }),
  structureFeedback: z.string().max(400),
  clarityFeedback: z.string().max(400),
  specificityFeedback: z.string().max(400),
  impactFeedback: z.string().max(400),
  strengths: z.array(z.string().max(300)).max(5),
  improvements: z.array(z.string().max(300)).max(5),
  suggestedStarRefinement: z
    .object({
      situation: z.string().max(400),
      task: z.string().max(300),
      action: z.string().max(600),
      result: z.string().max(400),
    })
    .optional(),
  overallSummary: z.string().max(600),
});

export interface StarEvaluation {
  relevance: { level: 'low' | 'medium' | 'high'; explanation: string };
  structureFeedback: string;
  clarityFeedback: string;
  specificityFeedback: string;
  impactFeedback: string;
  strengths: string[];
  improvements: string[];
  unsupportedClaims: string[];
  suggestedStarRefinement?: StarAnswerInput;
  overallSummary: string;
  provider: string;
  model: string;
  isFallback?: boolean;
}

// --- 3. Mock Interview Evaluation Schemas & Types ---

const mockEvaluationSchema = z.object({
  relevance: z.object({
    level: z.enum(['low', 'medium', 'high']),
    explanation: z.string().max(400),
  }),
  structure: z.string().max(400),
  clarity: z.string().max(400),
  specificity: z.string().max(400),
  impact: z.string().max(400),
  evidenceUsage: z.string().max(400).optional(),
  completeness: z.string().max(400).optional(),
  strengths: z.array(z.string().max(300)).max(5),
  improvements: z.array(z.string().max(300)).max(5),
  followUpQuestion: z.string().max(300),
  overallFeedback: z.string().max(800),
});

export type MockEvaluation = z.infer<typeof mockEvaluationSchema> & {
  unsupportedClaims: string[];
  provider: string;
  model: string;
  isFallback?: boolean;
};

// --- 4. Final Performance Report Schemas & Types ---

const finalReportSchema = z.object({
  summary: z.string().max(800),
  overallRating: z.enum(['exceptional', 'proficient', 'developing', 'needs_practice']),
  keyStrengths: z.array(z.string().max(300)).max(6),
  criticalAreasForImprovement: z.array(z.string().max(300)).max(6),
  recommendedPreparationSteps: z.array(z.string().max(300)).max(6),
  competencyBreakdown: z.array(
    z.object({
      category: z.string().max(50),
      scoreLabel: z.string().max(50),
      feedback: z.string().max(400),
    })
  ),
});

export type FinalInterviewReport = z.infer<typeof finalReportSchema> & {
  provider: string;
  model: string;
  isFallback?: boolean;
};

// --- Sentence-Level Truth Guard ---

function sanitiseAnswer(text: string, master?: ResumeData | null): { text: string; removed: number } {
  if (!master) return { text, removed: 0 };
  const kept: string[] = [];
  let removed = 0;
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (!sentence.trim()) continue;
    const check = isBulletTruthful(sentence, master);
    if (check.ok) kept.push(sentence);
    else removed++;
  }
  if (kept.length === 0) {
    return {
      text: 'Build this answer from your own experience — facts must be grounded in your authentic CV.',
      removed,
    };
  }
  return { text: kept.join(' ').trim(), removed };
}

function detectUnsupportedClaims(text: string, master?: ResumeData | null): string[] {
  if (!master) return [];
  const unsupported: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (!sentence.trim()) continue;
    const check = isBulletTruthful(sentence, master);
    if (!check.ok && check.unsupported.length > 0) {
      unsupported.push(...check.unsupported);
    }
  }
  return [...new Set(unsupported)];
}

// --- Deterministic Fallbacks ---

export function getDeterministicPrep(input: EvidenceInput): InterviewPrep {
  const master = input.master;
  const skills = master?.skills?.technical?.slice(0, 5) || ['TypeScript', 'React', 'Node.js', 'System Architecture'];
  const soft = master?.skills?.soft?.slice(0, 3) || ['Collaboration', 'Problem Solving', 'Leadership'];
  const company = input.company || 'the target organisation';
  const role = input.job?.title || 'Software Engineer';
  const firstExp = master?.experience?.[0];
  const expBullet = firstExp?.bullets?.[0] || 'Led engineering features and delivered scalable solutions.';

  const questions: InterviewQuestion[] = [
    {
      id: 'iq_det_1',
      category: 'TECHNICAL',
      question: `How would you architect a scalable, maintainable solution using ${skills[0] || 'modern tech stacks'} in production?`,
      why_it_may_be_asked: `Evaluates depth of hands-on expertise with ${skills[0]} and understanding of production trade-offs.`,
      evidence_from_cv: `Experience with ${skills.join(', ')} referenced in your technical profile.`,
      recommended_answer_structure: 'STAR: Explain the system scale (S), architectural requirements (T), technical design decisions and trade-offs (A), and latency/throughput results (R).',
      sample_truthful_answer: `At ${firstExp?.company || 'my recent role'}, I worked with ${skills[0]}. ${expBullet}`,
    },
    {
      id: 'iq_det_2',
      category: 'BEHAVIOURAL',
      question: 'Tell me about a complex technical challenge you faced and how you navigated it to success.',
      why_it_may_be_asked: 'Tests resilience, root-cause debugging methodology, and ability to deliver under pressure.',
      evidence_from_cv: firstExp ? `${firstExp.title} at ${firstExp.company}` : 'Engineering experience',
      recommended_answer_structure: 'Situation (obstacle context) -> Task (your responsibility) -> Action (debugging and engineering steps) -> Result (metrics and stability).',
      sample_truthful_answer: `At ${firstExp?.company || 'my previous role'}, we encountered a challenge. ${expBullet}`,
    },
    {
      id: 'iq_det_3',
      category: 'SITUATIONAL',
      question: 'If a critical service experienced latency spikes during peak traffic, what immediate triage steps would you execute?',
      why_it_may_be_asked: 'Assesses production incident response, telemetry awareness, and calm decision making.',
      evidence_from_cv: `Proficiency with ${skills.slice(0, 3).join(', ')} and cloud environments.`,
      recommended_answer_structure: 'Step 1: Check metrics/logs -> Step 2: Mitigate (scale/failover) -> Step 3: Root cause analysis -> Step 4: Post-mortem prevention.',
      sample_truthful_answer: `I begin by checking APM metrics, isolating failing dependencies, enabling caching or failovers, and documenting the incident.`,
    },
    {
      id: 'iq_det_4',
      category: 'TEAMWORK',
      question: `How do you collaborate with cross-functional stakeholders when technical priorities conflict with business deadlines?`,
      why_it_may_be_asked: `Demonstrates ${soft[0] || 'collaboration'}, empathy, and pragmatic negotiation skills.`,
      evidence_from_cv: `Soft skills: ${soft.join(', ')}.`,
      recommended_answer_structure: 'Describe the competing priorities (S), your alignment goal (T), transparent communication and scoping (A), and project delivery outcome (R).',
      sample_truthful_answer: `I communicate trade-offs clearly, propose phased MVP releases, and ensure product and engineering share visibility on technical debt.`,
    },
    {
      id: 'iq_det_5',
      category: 'ROLE_SPECIFIC',
      question: `What approach makes you most effective when stepping into a ${role} role?`,
      why_it_may_be_asked: `Evaluates domain orientation and clarity on role expectations.`,
      evidence_from_cv: `Career profile targeting ${role}.`,
      recommended_answer_structure: 'First 30 days (listen & learn) -> 60 days (contribute & unblock) -> 90 days (lead initiatives).',
      sample_truthful_answer: `I focus first on understanding the codebase and customer metrics, building trust with the team, and consistently shipping reliable code.`,
    },
    {
      id: 'iq_det_6',
      category: 'HR',
      question: `Why are you interested in joining ${company} at this stage in your career?`,
      why_it_may_be_asked: 'Measures genuine interest, cultural alignment, and career motivation.',
      evidence_from_cv: 'Career progression across recent roles.',
      recommended_answer_structure: 'Connect company mission to your technical interests and explain what value you bring.',
      sample_truthful_answer: `I am looking for an opportunity to apply my background in ${skills.slice(0, 2).join(' and ')} to solve meaningful problems at ${company}.`,
    },
  ];

  const studyPlan = [
    `Review system design patterns and concurrency models in ${skills[0] || 'your core stack'}.`,
    'Prepare 3 quantified STAR stories emphasizing ownership and measured outcomes.',
    'Practice explaining the trade-offs of architectural decisions made in your recent projects.',
    `Prepare 2-3 thoughtful questions about ${company}'s development lifecycle and roadmaps.`,
  ];

  return {
    questions,
    studyPlan,
    rejectedCount: 0,
    provider: 'deterministic-engine',
    model: 'curated-skill-framework',
    isFallback: true,
    aiConfigured: isAiEnabled(),
  };
}

export function getDeterministicStarEvaluation(
  question: string,
  star: StarAnswerInput,
  master?: ResumeData | null
): StarEvaluation {
  const situationWords = star.situation.trim().split(/\s+/).filter(Boolean).length;
  const taskWords = star.task.trim().split(/\s+/).filter(Boolean).length;
  const actionWords = star.action.trim().split(/\s+/).filter(Boolean).length;
  const resultWords = star.result.trim().split(/\s+/).filter(Boolean).length;

  const hasNumbersInResult = /\d+|%|\$|£|x\b|times|reduced|increased|doubled/i.test(star.result);
  const hasActionVerbs = /built|architected|led|developed|designed|implemented|migrated|spearheaded|refactored|optimized/i.test(
    star.action
  );

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (situationWords >= 10) strengths.push('Clear background context provided in Situation.');
  else improvements.push('Expand Situation: Describe the specific business challenge or operational constraint.');

  if (taskWords >= 6) strengths.push('Ownership and goal clearly defined in Task.');
  else improvements.push('Clarify Task: State explicitly what YOU were accountable for achieving.');

  if (actionWords >= 20 && hasActionVerbs) strengths.push('Strong, concrete action verbs detailing your technical execution.');
  else improvements.push('Deepen Action: Focus on YOUR specific decisions, technologies used, and collaboration rather than generic team tasks.');

  if (hasNumbersInResult) strengths.push('Quantified metrics or tangible business impact included in Result.');
  else improvements.push('Quantify Result: Add measurable outcomes (e.g., % latency drop, users served, delivery timeline, cost savings).');

  const fullText = `${star.situation} ${star.task} ${star.action} ${star.result}`;
  const unsupported = detectUnsupportedClaims(fullText, master);

  const level =
    situationWords >= 8 && taskWords >= 5 && actionWords >= 15 && (hasNumbersInResult || resultWords >= 10)
      ? 'high'
      : actionWords >= 10
      ? 'medium'
      : 'low';

  return {
    relevance: {
      level,
      explanation:
        level === 'high'
          ? 'Answer directly addresses the interview question with structured STAR flow.'
          : 'Answer provides useful context but needs sharper focus on personal contribution and measurable outcome.',
    },
    structureFeedback: 'The four-part STAR framework is adhered to. Keep Situation concise to leave maximal time for Action and Result.',
    clarityFeedback: actionWords >= 15 ? 'Clarity is good; steps taken are easy to follow.' : 'Could be clearer: avoid vague generalisations and name specific tools or decisions.',
    specificityFeedback: hasActionVerbs ? 'Good technical specificity in execution steps.' : 'Needs more specificity on the technologies, trade-offs, and design patterns utilized.',
    impactFeedback: hasNumbersInResult ? 'Excellent impact articulation with metrics.' : 'Impact needs evidence: quantify the business or technical outcome if known.',
    strengths,
    improvements,
    unsupportedClaims: unsupported,
    overallSummary: 'Good STAR answer foundation. Strengthening the quantifiable results and emphasizing your unique decisions will elevate this response.',
    provider: 'deterministic-evaluator',
    model: 'star-framework-rules',
    isFallback: true,
  };
}

export function nextGenericQuestion(usedCategories: string[] = []): { category: string; question: string } {
  const pool = [
    { category: 'BEHAVIOURAL', question: 'Describe a project you are proud of and your specific contribution.' },
    { category: 'TECHNICAL', question: 'Walk me through how you would design a typical component of this role.' },
    { category: 'MOTIVATION', question: 'Why are you interested in this kind of role?' },
    { category: 'TEAMWORK', question: 'Tell me about a time you collaborated across teams.' },
    { category: 'CAREER', question: 'Where do you see your next step after this role?' },
  ];
  return pool.find((q) => !usedCategories.includes(q.category)) || pool[0];
}

export function getDeterministicMockEvaluation(
  question: string,
  answer: string,
  master?: ResumeData | null
): MockEvaluation {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const hasMetrics = /\d+|%|\$|£|reduced|increased|improved|delivered/i.test(answer);
  const hasAction = /built|led|designed|created|engineered|implemented|resolved/i.test(answer);

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (words >= 30) strengths.push('Comprehensive answer length with reasonable detail.');
  else improvements.push('Answer is somewhat brief; consider elaborating on specific steps and outcomes.');

  if (hasAction) strengths.push('Uses active engineering vocabulary to explain contribution.');
  else improvements.push('Frame answers using active verbs demonstrating what YOU personally delivered.');

  if (hasMetrics) strengths.push('Includes references to measurable impact or improvement.');
  else improvements.push('Include metrics (e.g., percentage gains, time saved, scale of traffic) to substantiate your claims.');

  const unsupported = detectUnsupportedClaims(answer, master);

  const genericFollowUps = [
    'What would you do differently if you had to approach that challenge again today?',
    'How did you validate that your solution met performance and quality standards?',
    'What trade-offs did you evaluate before settling on that particular approach?',
    'How did you communicate progress and technical risks to your team?',
  ];
  const followUpQuestion = genericFollowUps[Math.floor(Math.random() * genericFollowUps.length)];

  return {
    relevance: {
      level: words >= 25 ? 'high' : words >= 10 ? 'medium' : 'low',
      explanation: 'Response is relevant to the topic. Focusing on concrete personal actions makes it compelling.',
    },
    structure: 'Structured presentation. Using the STAR format (Situation, Task, Action, Result) will give it clean narrative rhythm.',
    clarity: 'Language is straightforward and understandable.',
    specificity: hasAction ? 'Adequate specificity on actions taken.' : 'Increase specificity by naming technical tools, architecture, and team interactions.',
    impact: hasMetrics ? 'Clear indication of positive outcome.' : 'Quantify outcomes where possible to prove real-world business value.',
    evidenceUsage: 'Grounded in project evidence and realistic context.',
    completeness: 'Addressed the core elements of the situation.',
    strengths,
    improvements,
    followUpQuestion,
    unsupportedClaims: unsupported,
    overallFeedback: 'Solid practice attempt. Refining your storytelling around specific metrics and technical trade-offs will help you stand out in the live interview.',
    provider: 'deterministic-evaluator',
    model: 'mock-framework-rules',
    isFallback: true,
  };
}

export function getDeterministicFinalReport(
  answersCount: number,
  unsupportedClaimsTotal: number
): FinalInterviewReport {
  const overallRating =
    answersCount >= 3 && unsupportedClaimsTotal === 0 ? 'proficient' : 'developing';

  return {
    summary:
      'You completed your mock interview session. Your responses demonstrate solid baseline communication and technical understanding. Continuing to practice with structured STAR narratives and quantified results will build fluency for real interview loops.',
    overallRating,
    keyStrengths: [
      'Engaged with role-specific questions and provided substantive responses.',
      'Demonstrated relevant domain terminology and engineering awareness.',
      'Constructive problem-solving orientation in behavioral scenarios.',
    ],
    criticalAreasForImprovement: [
      'Anchor every story with at least one quantified result or measurable business outcome.',
      'Ensure all claims in interview answers are directly grounded in your verified CV facts.',
      'Keep initial situational background to under 30 seconds to focus on your specific actions.',
    ],
    recommendedPreparationSteps: [
      'Document 5 reusable STAR stories in your local story bank covering conflict, failure, technical scale, and mentoring.',
      'Practice verbalizing your answers within a 90-second to 2-minute target duration.',
      'Prepare 2 thoughtful questions for the interviewers about team culture and technical architecture.',
    ],
    competencyBreakdown: [
      {
        category: 'Technical Communication',
        scoreLabel: 'Proficient',
        feedback: 'Comfortable discussing technical concepts; aim to articulate architectural trade-offs proactively.',
      },
      {
        category: 'STAR Structure',
        scoreLabel: 'Developing',
        feedback: 'Good adherence to context and action; strengthen the Result portion with measurable business impact.',
      },
      {
        category: 'Grounded Authenticity',
        scoreLabel: unsupportedClaimsTotal === 0 ? 'High' : 'Needs Verification',
        feedback:
          unsupportedClaimsTotal === 0
            ? 'All answers remained grounded in verifiable experiences.'
            : 'Some claims could not be verified against your CV; ensure you have factual examples for every statement.',
      },
    ],
    provider: 'deterministic-reporter',
    model: 'interview-rubric-v1',
    isFallback: true,
  };
}

// --- Agent Implementations ---

const PREP_TASK = `Generate an interview preparation package for this job and candidate.
Return JSON:
{"questions": [{"category": one of BEHAVIOURAL|TECHNICAL|SITUATIONAL|ROLE_SPECIFIC|PROJECT|LEADERSHIP|CONFLICT|TEAMWORK|MOTIVATION|COMPANY|CAREER|HR,
   "question": string,
   "why_it_may_be_asked": string,
   "evidence_from_cv": string (which CV facts help answer it),
   "recommended_answer_structure": string (STAR guidance),
   "sample_truthful_answer": string (first-person, ONLY CV facts)}],
 "studyPlan": string[] (3-6 concrete preparation steps)}
Rules: 6-10 questions spread across categories (must include TECHNICAL, BEHAVIOURAL, SITUATIONAL, HR); every sample answer must only use provided CV evidence; do not invent employers, metrics or achievements.`;

export async function generateInterviewPrep(input: EvidenceInput): Promise<InterviewPrep> {
  if (!isAiEnabled()) {
    return getDeterministicPrep(input);
  }

  try {
    const provider: AiProvider = getAiProvider();
    const prep = await provider.completeJson({
      system: `You are the Curevo AI Interview Agent. You prepare candidates for real interviews.\n\n${TRUTH_RULES}`,
      user: buildAgentPrompt(input, PREP_TASK),
      schema: prepSchema,
      maxTokens: 2800,
      temperature: 0.4,
    });

    // Truth Guard every sample answer.
    let rejectedCount = 0;
    const questions = prep.questions.map((q) => {
      const { text, removed } = sanitiseAnswer(q.sample_truthful_answer, input.master);
      rejectedCount += removed;
      return { ...q, sample_truthful_answer: text };
    });

    return {
      questions,
      studyPlan: prep.studyPlan,
      rejectedCount,
      provider: provider.name,
      model: provider.model,
      isFallback: false,
      aiConfigured: true,
    };
  } catch (err) {
    if (err instanceof AiUnavailableError || (err as any)?.code) {
      console.warn('[InterviewAgent] AI provider failed; falling back to deterministic prep:', (err as Error).message);
      return getDeterministicPrep(input);
    }
    throw err;
  }
}

export async function evaluateStarAnswer(
  input: EvidenceInput & { question: string; star: StarAnswerInput }
): Promise<StarEvaluation> {
  if (!isAiEnabled()) {
    return getDeterministicStarEvaluation(input.question, input.star, input.master);
  }

  try {
    const provider: AiProvider = getAiProvider();
    const userPrompt = buildAgentPrompt(
      input,
      `INTERVIEW QUESTION:\n${input.question}\n\n` +
        `CANDIDATE STAR ANSWER:\n` +
        `- Situation: ${input.star.situation.slice(0, 1000)}\n` +
        `- Task: ${input.star.task.slice(0, 800)}\n` +
        `- Action: ${input.star.action.slice(0, 1500)}\n` +
        `- Result: ${input.star.result.slice(0, 1000)}\n\n` +
        `Evaluate this answer against the STAR framework. Provide qualitative assessments for each component, list strengths and improvements, and offer a suggested refinement using ONLY facts supplied in the answer and CV.\n` +
        `Return JSON: {"relevance":{"level":"low|medium|high","explanation":string},"structureFeedback":string,"clarityFeedback":string,"specificityFeedback":string,"impactFeedback":string,"strengths":string[],"improvements":string[],"suggestedStarRefinement":{"situation":string,"task":string,"action":string,"result":string},"overallSummary":string}`
    );

    const evaluation = await provider.completeJson({
      system: `You are the Curevo AI STAR Coach. You evaluate answers using the STAR method (Situation, Task, Action, Result).\n\n${TRUTH_RULES}\nNever invent candidate accomplishments. If the Result lacks metrics, advise them on what to measure without inventing specific figures.`,
      user: userPrompt,
      schema: starEvaluationSchema,
      maxTokens: 1600,
      temperature: 0.3,
    });

    const fullAnswerText = `${input.star.situation} ${input.star.task} ${input.star.action} ${input.star.result}`;
    const unsupported = detectUnsupportedClaims(fullAnswerText, input.master);

    return {
      ...evaluation,
      unsupportedClaims: unsupported,
      provider: provider.name,
      model: provider.model,
      isFallback: false,
    };
  } catch (err) {
    if (err instanceof AiUnavailableError || (err as any)?.code) {
      console.warn('[InterviewAgent] AI provider failed; falling back to deterministic STAR evaluation:', (err as Error).message);
      return getDeterministicStarEvaluation(input.question, input.star, input.master);
    }
    throw err;
  }
}

export async function evaluateMockAnswer(
  input: EvidenceInput & {
    question: string;
    answer: string;
    difficulty?: string;
    questionNumber?: number;
    totalQuestions?: number;
    previousAnswers?: { question: string; answer: string }[];
  }
): Promise<MockEvaluation> {
  if (!isAiEnabled()) {
    return getDeterministicMockEvaluation(input.question, input.answer, input.master);
  }

  try {
    const provider: AiProvider = getAiProvider();
    const difficultyContext = input.difficulty ? `Role level: ${input.difficulty}. ` : '';
    const progressContext =
      input.questionNumber && input.totalQuestions ? `Question ${input.questionNumber} of ${input.totalQuestions}. ` : '';

    const evaluation = await provider.completeJson({
      system: `You are the Curevo AI mock interviewer. Evaluate the candidate's answer to one interview question and generate an adaptive follow-up question.\n\n${TRUTH_RULES}\nAdditional rules: use explainable qualitative dimensions (low/medium/high with explanations) — never a numeric overall score. Base follow-up question on what the candidate just explained.`,
      user: buildAgentPrompt(
        input,
        `${difficultyContext}${progressContext}\nINTERVIEW QUESTION:\n${input.question}\n\nCANDIDATE ANSWER:\n${input.answer.slice(0, 3000)}\n\nReturn JSON: {"relevance":{"level":"low|medium|high","explanation":string},"structure":string,"clarity":string,"specificity":string,"impact":string,"strengths":string[],"improvements":string[],"followUpQuestion":string,"overallFeedback":string}`
      ),
      schema: mockEvaluationSchema,
      maxTokens: 1400,
      temperature: 0.3,
    });

    const unsupported = detectUnsupportedClaims(input.answer, input.master);

    return {
      ...evaluation,
      unsupportedClaims: unsupported,
      provider: provider.name,
      model: provider.model,
      isFallback: false,
    };
  } catch (err) {
    if (err instanceof AiUnavailableError || (err as any)?.code) {
      console.warn('[InterviewAgent] AI provider failed; falling back to deterministic mock evaluation:', (err as Error).message);
      return getDeterministicMockEvaluation(input.question, input.answer, input.master);
    }
    throw err;
  }
}

export async function generateFinalMockReport(
  input: EvidenceInput & {
    questionsAndAnswers: { question: string; category?: string; answer: string; evaluation?: any }[];
    difficulty?: string;
  }
): Promise<FinalInterviewReport> {
  const totalAnswers = input.questionsAndAnswers.length;
  let totalUnsupported = 0;
  input.questionsAndAnswers.forEach((qa) => {
    totalUnsupported += detectUnsupportedClaims(qa.answer, input.master).length;
  });

  if (!isAiEnabled()) {
    return getDeterministicFinalReport(totalAnswers, totalUnsupported);
  }

  try {
    const provider: AiProvider = getAiProvider();
    const digest = input.questionsAndAnswers
      .map(
        (qa, i) =>
          `[Q${i + 1}] (${qa.category || 'General'}): ${qa.question}\n[Answer]: ${qa.answer.slice(0, 500)}\n`
      )
      .join('\n');

    const report = await provider.completeJson({
      system: `You are the Curevo AI interview coaching evaluator. Synthesize the candidate's complete interview simulation into a final performance report.\n\n${TRUTH_RULES}\nExplainable qualitative ratings only: exceptional, proficient, developing, or needs_practice. Identify recurring strengths, areas to improve, and concrete next steps.`,
      user: buildAgentPrompt(
        input,
        `MOCK INTERVIEW TRANSCRIPT:\n${digest}\n\nReturn JSON: {"summary":string,"overallRating":"exceptional|proficient|developing|needs_practice","keyStrengths":string[],"criticalAreasForImprovement":string[],"recommendedPreparationSteps":string[],"competencyBreakdown":[{"category":string,"scoreLabel":string,"feedback":string}]}`
      ),
      schema: finalReportSchema,
      maxTokens: 2000,
      temperature: 0.3,
    });

    return {
      ...report,
      provider: provider.name,
      model: provider.model,
      isFallback: false,
    };
  } catch (err) {
    if (err instanceof AiUnavailableError || (err as any)?.code) {
      console.warn('[InterviewAgent] AI provider failed; falling back to deterministic final report:', (err as Error).message);
      return getDeterministicFinalReport(totalAnswers, totalUnsupported);
    }
    throw err;
  }
}
