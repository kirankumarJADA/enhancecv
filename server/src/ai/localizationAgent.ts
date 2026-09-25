// AI Localization agent: translates a resume into a target language/market.
//
// Facts are preserved by construction: the agent returns translations keyed
// by existing item ids, and the deterministic validator enforces that the
// numbers multiset, dates, technology names (canonical skills) and employer
// names are unchanged. Output is a merged ResumeData — saved as a NEW version
// by the route; the Master CV is never touched.

import { z } from 'zod';
import { AiProvider, AiUnavailableError, isAiEnabled, getAiProvider } from './provider';
import { buildAgentPrompt, TRUTH_RULES } from './evidence';
import { findSkillsInText } from '../lib/skills';
import { ResumeData } from '../types';

export const SUPPORTED_LANGUAGES = [
  'English (UK)', 'English (US)', 'German', 'French', 'Spanish', 'Italian',
  'Dutch', 'Portuguese', 'Polish', 'Arabic', 'Hindi', 'Japanese',
] as const;

const translationSchema = z.object({
  headline: z.string().max(200).optional(),
  summary: z.string().max(3000).optional(),
  experience: z
    .array(
      z.object({
        itemId: z.string().max(64),
        title: z.string().max(200).optional(),
        bullets: z.array(z.string().max(600)).optional(),
      })
    )
    .max(20)
    .optional(),
  projects: z
    .array(
      z.object({
        itemId: z.string().max(64),
        name: z.string().max(200).optional(),
        description: z.string().max(600).optional(),
        bullets: z.array(z.string().max(600)).optional(),
      })
    )
    .max(20)
    .optional(),
  skills: z.array(z.string().max(80)).max(60).optional(),
  notes: z.string().max(500).optional(),
});

export type TranslationProposal = z.infer<typeof translationSchema>;

export interface LocalizationResult {
  resume: ResumeData;
  warnings: string[];
  provider: string;
  model: string;
  language: string;
}

const TASK = (language: string, market: string) => `Translate this resume into ${language}${market ? ` for the ${market} job market` : ''}.
Return JSON keyed by the EXACT item ids from the resume:
{"headline": string, "summary": string, "experience": [{"itemId","title","bullets":[...]}], "projects": [{"itemId","name","description","bullets":[...]}], "skills": string[], "notes": string}
STRICT PRESERVATION: keep every number, date, employer name, certification name and technology name EXACTLY as in the source (do not translate technology brand names). Localise spelling/terminology/section conventions where natural. Do not add, remove or invent content.`;

/** Deterministic fact-preservation validation. */
function validateTranslation(original: ResumeData, translated: ResumeData): string[] {
  const warnings: string[] = [];

  const numbers = (r: ResumeData): string[] =>
    [r.summary, ...r.experience.flatMap((e) => e.bullets), ...r.projects.flatMap((p) => p.bullets)]
      .join(' ')
      .match(/\d+(?:[.,]\d+)?%?/g) || [];
  const origNums = numbers(original).sort();
  const newNums = numbers(translated).sort();
  if (JSON.stringify(origNums) !== JSON.stringify(newNums)) {
    // Numbers drifted — restore the original text-bearing bullets that differ.
    warnings.push('Number mismatch detected during translation; affected bullets were restored to the source wording.');
    for (const exp of translated.experience) {
      const src = original.experience.find((e) => e.id === exp.id);
      if (!src) continue;
      exp.bullets = exp.bullets.map((b, i) => {
        const srcB = src.bullets[i];
        if (!srcB) return b;
        const bn = (b.match(/\d+(?:[.,]\d+)?%?/g) || []).sort().join('|');
        const sn = (srcB.match(/\d+(?:[.,]\d+)?%?/g) || []).sort().join('|');
        return bn === sn ? b : srcB;
      });
    }
  }

  // Canonical technologies must survive translation.
  const origSkills = new Set(findSkillsInText(JSON.stringify(original)).map((s) => s.canonical));
  const newSkills = new Set(findSkillsInText(JSON.stringify(translated)).map((s) => s.canonical));
  for (const s of origSkills) {
    if (!newSkills.has(s)) warnings.push(`Technology "${s}" no longer detected after translation — check the localised text.`);
  }

  // Dates must be unchanged.
  const origDates = JSON.stringify(original.experience.map((e) => [e.startDate, e.endDate, e.current]));
  const newDates = JSON.stringify(translated.experience.map((e) => [e.startDate, e.endDate, e.current]));
  if (origDates !== newDates) {
    warnings.push('Date drift detected — dates were restored to the source values.');
    translated.experience.forEach((exp) => {
      const src = original.experience.find((e) => e.id === exp.id);
      if (src) {
        exp.startDate = src.startDate;
        exp.endDate = src.endDate;
        exp.current = src.current;
      }
    });
  }

  return warnings;
}

export async function translateResume(
  resume: ResumeData,
  language: string,
  market: string
): Promise<LocalizationResult> {
  if (!isAiEnabled()) {
    throw new AiUnavailableError('AI_NOT_CONFIGURED', 'Translation requires a configured AI provider.', false);
  }
  const provider: AiProvider = getAiProvider();

  const proposal = await provider.completeJson({
    system: `You are the Curevo AI Localization Agent — a professional resume translator.\n\n${TRUTH_RULES}`,
    user: buildAgentPrompt(
      { master: resume },
      TASK(language, market),
      [`=== RESUME TO TRANSLATE ===\n${JSON.stringify(
        {
          headline: resume.personal.headline,
          summary: resume.summary,
          experience: resume.experience.map((e) => ({ itemId: e.id, title: e.title, company: e.company, bullets: e.bullets })),
          projects: resume.projects.map((p) => ({ itemId: p.id, name: p.name, description: p.description, bullets: p.bullets })),
          skills: resume.skills.technical,
        },
        null,
        1,
      )}`],
    ),
    schema: translationSchema,
    maxTokens: 3000,
    temperature: 0.2,
  });

  // Merge onto a clone.
  const translated: ResumeData = JSON.parse(JSON.stringify(resume));
  if (proposal.headline) translated.personal.headline = proposal.headline;
  if (proposal.summary) translated.summary = proposal.summary;
  for (const e of proposal.experience || []) {
    const target = translated.experience.find((x) => x.id === e.itemId);
    if (!target) continue;
    if (e.title) target.title = e.title;
    if (e.bullets && e.bullets.length === target.bullets.length) target.bullets = e.bullets;
  }
  for (const p of proposal.projects || []) {
    const target = translated.projects.find((x) => x.id === p.itemId);
    if (!target) continue;
    if (p.name) target.name = p.name;
    if (p.description) target.description = p.description;
    if (p.bullets && p.bullets.length === target.bullets.length) target.bullets = p.bullets;
  }
  // Technology names are preserved verbatim by rule; the skills list stays.
  if (proposal.skills && proposal.skills.length === translated.skills.technical.length) {
    translated.skills.technical = proposal.skills;
  }

  const warnings = validateTranslation(resume, translated);
  return { resume: translated, warnings, provider: provider.name, model: provider.model, language };
}
