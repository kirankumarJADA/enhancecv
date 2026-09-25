// AI Grammar / proofreading agent. Truth Guard is mandatory: suggested
// rewording may only rephrase — any new technology/number claim is dropped.

import { z } from 'zod';
import { AiProvider, AiUnavailableError, isAiEnabled, getAiProvider } from './provider';
import { buildAgentPrompt, resumeDigest, TRUTH_RULES, type EvidenceInput } from './evidence';
import { isBulletTruthful } from '../engine/tailor';
import { ResumeData } from '../types';

const grammarSchema = z.object({
  suggestions: z
    .array(
      z.object({
        section: z.string().max(120),
        itemId: z.string().max(64).optional(),
        index: z.number().int().min(0).optional(),
        original: z.string().min(1).max(600),
        updated: z.string().min(1).max(600),
        reason: z.string().max(400),
      })
    )
    .max(15),
});

export type GrammarSuggestion = z.infer<typeof grammarSchema>['suggestions'][number];

export interface GrammarResult {
  suggestions: GrammarSuggestion[];
  rejectedCount: number;
  provider: string;
  model: string;
}

const TASK = `Proofread the resume content below for grammar, clarity, conciseness, professional tone, repetition and weak wording.
Return JSON: {"suggestions": [{"section","itemId","index","original","updated","reason"}]}
Rules: quote "original" EXACTLY as it appears in the resume content; propose "updated" with identical meaning and identical facts; at most 12 suggestions; if the writing is already clean return few or none.`;

export async function suggestGrammarImprovements(input: EvidenceInput): Promise<GrammarResult> {
  if (!isAiEnabled()) {
    throw new AiUnavailableError('AI_NOT_CONFIGURED', 'Grammar improvement requires a configured AI provider.', false);
  }
  const provider: AiProvider = getAiProvider();
  const resume = input.resume || input.master;

  const content = resumeDigest(resume);
  const raw = await provider.completeJson({
    system: `You are the Curevo AI Grammar Agent — a meticulous proofreader for resumes.\n\n${TRUTH_RULES}`,
    user: buildAgentPrompt(input, `${TASK}\n\n=== RESUME CONTENT TO PROOFREAD ===\n${content}`),
    schema: grammarSchema,
    maxTokens: 1800,
    temperature: 0.2,
  });

  // Truth Guard: every suggestion must still quote real content and must not
  // introduce unsupported claims. Matches are located by exact original text.
  const suggestions: GrammarSuggestion[] = [];
  let rejectedCount = 0;

  const findByText = (text: string): { section: string; itemId?: string; index?: number } | null => {
    for (const e of resume.experience) {
      const i = e.bullets.indexOf(text);
      if (i >= 0) return { section: `Experience — ${e.title}, ${e.company}`, itemId: e.id, index: i };
    }
    for (const p of resume.projects) {
      const i = p.bullets.indexOf(text);
      if (i >= 0) return { section: `Projects — ${p.name}`, itemId: p.id, index: i };
    }
    if (resume.summary === text) return { section: 'Summary' };
    return null;
  };

  for (const s of raw.suggestions) {
    if (s.updated === s.original) {
      rejectedCount++;
      continue;
    }
    const location = findByText(s.original);
    if (!location) {
      // Hallucinated original — reject.
      rejectedCount++;
      continue;
    }
    const check = isBulletTruthful(s.updated, input.master);
    if (!check.ok) {
      rejectedCount++;
      continue;
    }
    suggestions.push({
      section: s.section || location.section,
      itemId: location.itemId,
      index: location.index,
      original: s.original,
      updated: s.updated.trim(),
      reason: s.reason,
    });
  }

  return { suggestions, rejectedCount, provider: provider.name, model: provider.model };
}
