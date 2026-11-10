// AI tailoring pipeline + truth validation.
//
// Pipeline: Master CV + JD + JD analysis + match analysis → tailoring →
// truth validator → ATS-aware output. The tailoring stage may reorder,
// re-phrase and highlight; it may NEVER add facts. Every candidate change is
// validated against the Master CV and reverted if unsupported.
//
// Bullet improvement, quantification handling ("never invent a number") and
// the truth-vs-tailoring boundary follow the MIT-licensed ResumeSkills
// methodology ("resume-tailor", "resume-bullet-writer", "resume-quantifier").

import {
  ChangeLogEntry,
  ExperienceItem,
  JobAnalysis,
  MatchAnalysis,
  ProjectItem,
  ResumeData,
  Suggestion,
  TailoringResult,
  TruthCheck,
  TruthReport,
} from '../types';
import { findSkillsInText, skillTermRegex, countSkillOccurrences, getSkillDef } from '../lib/skills';
import { containsMetric, sentenceCase, wordCount } from '../lib/text';
import { ALL_POWER_VERBS, WEAK_OPENERS } from '../lib/verbs';
import { AiProvider } from '../ai/provider';

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** All technology/claim tokens present in the master CV — the ground truth set. */
function masterClaimTokens(master: ResumeData): Set<string> {
  const tokens = new Set<string>();
  const addText = (t: string) => {
    for (const s of findSkillsInText(t)) tokens.add(s.canonical);
  };
  addText(master.summary || '');
  for (const e of master.experience || []) {
    addText(`${e.title || ''} ${e.company || ''} ${e.location || ''} ${(e.bullets || []).join(' ')}`);
  }
  for (const p of master.projects || []) {
    addText(`${p.name || ''} ${p.description || ''} ${(p.tech || []).join(' ')} ${(p.bullets || []).join(' ')}`);
  }
  addText((master.skills?.technical || []).join(' '));
  addText((master.skills?.soft || []).join(' '));
  for (const ed of master.education || []) addText(`${ed.degree || ''} ${ed.field || ''}`);
  for (const c of master.certifications || []) addText(`${c.name || ''} ${c.issuer || ''}`);
  return tokens;
}

/** Extract the technology claims made by a piece of generated text. */
function claimsInText(text: string): string[] {
  return findSkillsInText(text).map((s) => s.canonical);
}

/** Numbers appearing in the master CV — generated text may not introduce new ones. */
function masterNumbers(master: ResumeData): Set<string> {
  const nums = new Set<string>();
  const text = [
    master.summary || '',
    ...(master.experience || []).flatMap((e) => [
      e.title || '',
      e.company || '',
      e.startDate || '',
      e.endDate || '',
      e.dateDisplay || '',
      (e as any).dates || '',
      ...(e.bullets || []),
    ]),
    ...(master.projects || []).flatMap((p) => [p.name || '', p.description || '', ...(p.tech || []), ...(p.bullets || [])]),
    ...(master.achievements || []),
    ...(master.education || []).map((e) => `${e.degree || ''} ${e.startDate || ''} ${e.endDate || ''} ${e.dateDisplay || ''} ${e.grade || ''}`),
  ].join(' ');
  for (const m of text.matchAll(/(?:[\$€£¥]\s*)?\d+(?:[.,]\d+)?(?:\s*[kKmMbBtT%])?/g)) {
    const raw = m[0].trim();
    if (raw) {
      nums.add(raw);
      const core = raw.replace(/[^\d.,]/g, '');
      if (core) nums.add(core);
    }
  }
  const { maxYears, hasEvidence } = getSupportedExperienceYears(master);
  if (hasEvidence) {
    nums.add(Math.floor(maxYears).toString());
    nums.add(maxYears.toString());
  }
  return nums;
}

interface DateInterval {
  startMonth: number; // continuous months from epoch: year * 12 + (month - 1)
  endMonth: number;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDateToContinuousMonth(
  raw: string | undefined,
  isEnd: boolean,
  isCurrent: boolean
): number | null {
  const now = new Date();
  const currentTotalMonth = now.getFullYear() * 12 + now.getMonth();
  if (isCurrent) return currentTotalMonth;
  if (!raw || !raw.trim()) return null;
  const t = raw.trim().toLowerCase();
  if (/^(present|current|now|ongoing)$/i.test(t)) return currentTotalMonth;

  // 1. "YYYY-MM" or "MM/YYYY"
  const mIso = t.match(/^(\d{4})-(0?[1-9]|1[0-2])$/);
  if (mIso) return parseInt(mIso[1], 10) * 12 + (parseInt(mIso[2], 10) - 1);

  const mSlash = t.match(/^(0?[1-9]|1[0-2])\/(\d{4})$/);
  if (mSlash) return parseInt(mSlash[2], 10) * 12 + (parseInt(mSlash[1], 10) - 1);

  // 2. "Jan 2024" or "January 2024"
  const mName = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i);
  if (mName) {
    const month = MONTH_MAP[mName[1].toLowerCase().slice(0, 3)] ?? 0;
    return parseInt(mName[2], 10) * 12 + month;
  }

  // 3. Year only "2024": Start defaults to Jan (0), End defaults to Dec (11)
  const mYear = t.match(/\b(19\d{2}|20\d{2})\b/);
  if (mYear) {
    const y = parseInt(mYear[1], 10);
    return isEnd ? y * 12 + 11 : y * 12 + 0;
  }
  return null;
}

/** Calculate true accumulated months across union of intervals, excluding gaps and merging overlaps. */
export function calculateIntervalUnionYears(intervals: DateInterval[]): number {
  if (intervals.length === 0) return 0;
  // Discard invalid / reversed intervals (start > end)
  const valid = intervals.filter((i) => i.startMonth <= i.endMonth);
  if (valid.length === 0) return 0;

  // Sort by startMonth ascending, then endMonth ascending
  valid.sort((a, b) => a.startMonth - b.startMonth || a.endMonth - b.endMonth);

  // Merge overlapping and contiguous intervals
  const merged: DateInterval[] = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const cur = valid[i];
    const prev = merged[merged.length - 1];
    if (cur.startMonth <= prev.endMonth + 1) {
      prev.endMonth = Math.max(prev.endMonth, cur.endMonth);
    } else {
      merged.push(cur);
    }
  }

  // Sum durations across merged intervals
  let totalMonths = 0;
  for (const interval of merged) {
    totalMonths += (interval.endMonth - interval.startMonth + 1);
  }
  return Math.round((totalMonths / 12) * 10) / 10;
}

const LEADERSHIP_TITLE_RE = /\b(lead|leader|manager|director|head|vp|vice president|chief|principal|supervisor|architect|founder|co-founder)\b/i;
const LEADERSHIP_BULLET_RE = /\b(?:managed|led|directed|supervised)\s+(?:a\s+team|engineers|developers|people|staff|direct reports|\d+)/i;

function isLeadershipExperience(e: ExperienceItem): boolean {
  if (LEADERSHIP_TITLE_RE.test(e.title || '')) return true;
  for (const b of e.bullets || []) {
    if (LEADERSHIP_BULLET_RE.test(b)) return true;
  }
  return false;
}

/**
 * Context-aware helper to derive maximum supported general and leadership experience (in years)
 * from Master CV explicit statements and conservative interval unions.
 */
export function getSupportedExperienceYears(master: ResumeData): {
  maxYears: number;
  maxLeadershipYears: number;
  hasEvidence: boolean;
  hasLeadershipEvidence: boolean;
} {
  const generalIntervals: DateInterval[] = [];
  const leadershipIntervals: DateInterval[] = [];

  for (const e of master.experience || []) {
    const raw = `${e.startDate || ''} ${e.endDate || ''} ${e.dateDisplay || ''} ${(e as any).dates || ''}`;
    const isCurrent = Boolean(e.current || /\b(present|current|now|ongoing)\b/i.test(raw));
    const start = parseDateToContinuousMonth(e.startDate || e.dateDisplay || (e as any).dates, false, false);
    const end = parseDateToContinuousMonth(e.endDate || e.dateDisplay || (e as any).dates, true, isCurrent);

    if (start !== null && end !== null && start <= end) {
      generalIntervals.push({ startMonth: start, endMonth: end });
      if (isLeadershipExperience(e)) {
        leadershipIntervals.push({ startMonth: start, endMonth: end });
      }
    }
  }

  const derivedGeneralYears = calculateIntervalUnionYears(generalIntervals);
  const derivedLeadershipYears = calculateIntervalUnionYears(leadershipIntervals);

  let statedGeneralMax: number | null = null;
  let statedLeadershipMax: number | null = null;
  const masterTexts = [
    master.summary || '',
    ...master.experience.flatMap((e) => [e.title, e.company, ...(e.bullets || [])]),
    ...master.projects.flatMap((p) => [p.name, p.description || '', ...(p.bullets || [])]),
    ...(master.achievements || []),
  ].join(' ');

  for (const m of masterTexts.matchAll(/\b(\d+(?:\.\d+)?)\+?\s*(?:-|\s+)?(?:years?|yrs?)(?:\s+of)?(?:\s+(?:professional|hands-on|industry|software|engineering|technical|work))?\s+(?:experience|career|tenure|working)\b/gi)) {
    const y = parseFloat(m[1]);
    if (!Number.isNaN(y) && y > 0 && y < 70) {
      if (statedGeneralMax === null || y > statedGeneralMax) statedGeneralMax = y;
    }
  }
  for (const m of masterTexts.matchAll(/\b(\d+(?:\.\d+)?)\+?\s*(?:-|\s+)?(?:years?|yrs?)\s+experience\b/gi)) {
    const y = parseFloat(m[1]);
    if (!Number.isNaN(y) && y > 0 && y < 70) {
      if (statedGeneralMax === null || y > statedGeneralMax) statedGeneralMax = y;
    }
  }

  for (const m of masterTexts.matchAll(/\b(\d+(?:\.\d+)?)\+?\s*(?:-|\s+)?(?:years?|yrs?)(?:\s+of)?\s+(?:engineering\s+|technical\s+|team\s+|executive\s+)?(?:leadership|management|supervising|leading)\b/gi)) {
    const y = parseFloat(m[1]);
    if (!Number.isNaN(y) && y > 0 && y < 70) {
      if (statedLeadershipMax === null || y > statedLeadershipMax) statedLeadershipMax = y;
    }
  }

  const maxYears = Math.max(statedGeneralMax ?? 0, derivedGeneralYears);
  const maxLeadershipYears = Math.max(statedLeadershipMax ?? 0, derivedLeadershipYears);

  return {
    maxYears,
    maxLeadershipYears,
    hasEvidence: generalIntervals.length > 0 || statedGeneralMax !== null,
    hasLeadershipEvidence: leadershipIntervals.length > 0 || statedLeadershipMax !== null,
  };
}

/** Check if text claims an unsupported leadership duration. */
export function checkLeadershipDuration(text: string, master: ResumeData): string[] {
  const unsupported: string[] = [];
  const { maxLeadershipYears, hasLeadershipEvidence } = getSupportedExperienceYears(master);

  const leadershipPatterns = [
    /\b(\d+(?:\.\d+)?)\+?\s*(?:-|\s+)?(?:years?|yrs?)\s+(?:of\s+)?(?:engineering\s+|technical\s+|team\s+|executive\s+)?(?:leadership|management|managing|leading)\b/gi,
    /\b(?:led|managed|directed|supervised)\s+.*?\bfor\s+(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\b/gi,
    /\b(\d+(?:\.\d+)?)\+?-year\s+(?:leadership|management|lead)\b/gi,
  ];

  for (const pat of leadershipPatterns) {
    for (const m of text.matchAll(pat)) {
      const claimed = parseFloat(m[1]);
      if (Number.isNaN(claimed)) continue;
      if (!hasLeadershipEvidence || claimed > maxLeadershipYears) {
        unsupported.push(m[0].trim());
      }
    }
  }
  return unsupported;
}

/** Check if text claims an unsupported general or leadership experience duration. */
export function checkExperienceDuration(text: string, master: ResumeData): string[] {
  const unsupported: string[] = [];
  const { maxYears, hasEvidence } = getSupportedExperienceYears(master);

  // Check leadership duration first: cannot infer leadership from general experience
  const leadershipClaims = checkLeadershipDuration(text, master);
  unsupported.push(...leadershipClaims);

  const generalPatterns = [
    /\b(\d+(?:\.\d+)?)\+?\s*(?:-|\s+)?(?:years?|yrs?)\b/gi,
    /\b(\d+(?:\.\d+)?)\+?-year\b/gi,
  ];

  for (const pat of generalPatterns) {
    for (const m of text.matchAll(pat)) {
      // If already flagged under leadership claims, skip duplicate
      if (leadershipClaims.some((l) => l.includes(m[0].trim()))) continue;
      const claimed = parseFloat(m[1]);
      if (Number.isNaN(claimed)) continue;
      if (!hasEvidence || claimed > maxYears) {
        unsupported.push(m[0].trim());
      }
    }
  }
  return unsupported;
}

/** Extract supported leadership / team size headcount from Master CV. */
export function getSupportedHeadcount(master: ResumeData): { maxHeadcount: number; hasHeadcountEvidence: boolean } {
  let maxCount = 0;
  let hasEvidence = false;
  const masterTexts = [
    master.summary || '',
    ...master.experience.flatMap((e) => [e.title, e.company, ...(e.bullets || [])]),
    ...master.projects.flatMap((p) => [p.name, p.description || '', ...(p.bullets || [])]),
    ...(master.achievements || []),
  ].join(' ');

  const headcountPatterns = [
    /\b(?:team|department|group|squad|pod)\s+of\s+(\d+)\b/gi,
    /\b(\d+)\+?\s*(?:engineers?|developers?|direct reports?|people|staff|employees?|team members?)\b/gi,
    /\b(?:managed|led|directed|supervised|guided)\s+(?:a\s+team\s+of\s+)?(\d+)\b/gi,
  ];

  for (const pat of headcountPatterns) {
    for (const m of masterTexts.matchAll(pat)) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > 0 && n < 10000) {
        hasEvidence = true;
        if (n > maxCount) maxCount = n;
      }
    }
  }
  return { maxHeadcount: maxCount, hasHeadcountEvidence: hasEvidence };
}

/** Check if text claims an unsupported team size or leadership scale. */
export function checkHeadcountClaims(text: string, master: ResumeData): string[] {
  const unsupported: string[] = [];
  const { maxHeadcount, hasHeadcountEvidence } = getSupportedHeadcount(master);
  const patterns = [
    /\b(?:team|department|group|squad|pod)\s+of\s+(\d+)\b/gi,
    /\b(\d+)\+?\s*(?:engineers?|developers?|direct reports?|people|staff|employees?|team members?)\b/gi,
    /\b(?:managed|led|directed|supervised|guided)\s+(?:a\s+team\s+of\s+)?(\d+)\b/gi,
  ];

  for (const pat of patterns) {
    for (const m of text.matchAll(pat)) {
      const claimed = parseInt(m[1], 10);
      if (Number.isNaN(claimed) || claimed <= 1) continue; // "team of 1" or innocuous count
      if (!hasHeadcountEvidence || claimed > maxHeadcount) {
        unsupported.push(m[0].trim());
      }
    }
  }

  // When candidate has no verified management or leadership history, reject ungrounded management claims
  const hasLeadershipEvidence = hasHeadcountEvidence || (master.experience || []).some(isLeadershipExperience);
  if (!hasLeadershipEvidence) {
    const ungroundedPatterns = [
      /\b(?:managed|directed|supervised)\s+(?:a\s+)?(?:cross-functional\s+)?(?:team|department|squad|group)\b/gi,
    ];
    for (const pat of ungroundedPatterns) {
      for (const m of text.matchAll(pat)) {
        unsupported.push(m[0].trim());
      }
    }
  }

  return unsupported;
}

/**
 * Check one candidate bullet against the Master CV without mutating anything.
 * Used by the AI agent's Truth Guard to pre-validate AI-proposed rewrites:
 * technologies/claims must exist in the master, duration/headcount claims must
 * be grounded in evidence, and no unevidenced metrics may appear.
 */
export function isBulletTruthful(
  bullet: string,
  master: ResumeData,
  masterSkills?: Set<string>,
  masterNums?: Set<string>
): { ok: boolean; unsupported: string[] } {
  const skills = masterSkills ?? masterClaimTokens(master);
  const nums = masterNums ?? masterNumbers(master);
  const unsupported: string[] = [
    ...claimsInText(bullet).filter((c) => !skills.has(c)),
  ];

  // Context-aware checks:
  // 1. Duration / years of experience
  unsupported.push(...checkExperienceDuration(bullet, master));

  // 2. Headcount / leadership scale
  unsupported.push(...checkHeadcountClaims(bullet, master));

  // Helper: whitelist semantic version numbers (e.g. Python 3.11, OAuth 2.0, PostgreSQL 14)
  const isSemanticVersion = (token: string, fullStr: string) => {
    const idx = fullStr.indexOf(token);
    if (idx <= 0) return false;
    const prefix = fullStr.slice(Math.max(0, idx - 18), idx).trim();
    return /\b(python|java|node(?:\.js)?|postgres(?:ql)?|vue|angular|react|oauth|tls|http|version|v\.?)$/i.test(prefix);
  };

  // 3. Financial and magnitude metrics
  const bulletMetrics = [...bullet.matchAll(/(?:[\$€£¥]\s*)?\d+(?:[.,]\d+)?(?:\s*[kKmMbBtT%])?/g)]
    .map((m) => m[0].trim())
    .filter(Boolean);

  for (const m of bulletMetrics) {
    if (isSemanticVersion(m, bullet)) continue;
    const core = m.replace(/[^\d.,]/g, '');
    const hasSymbolOrSuffix = /[^\d]/.test(m);
    if (hasSymbolOrSuffix) {
      if (!nums.has(m) && !nums.has(core)) {
        unsupported.push(m);
      }
    } else {
      if (!nums.has(m) && !/^\d{1,2}$/.test(m)) {
        unsupported.push(m);
      }
    }
  }

  return { ok: unsupported.length === 0, unsupported: [...new Set(unsupported)] };
}

function yearsOfExperience(master: ResumeData): number | null {
  const { maxYears, hasEvidence } = getSupportedExperienceYears(master);
  return hasEvidence ? Math.floor(maxYears) : null;
}

/** Rewrite a weak bullet opener. Only rewords — never adds technology or numbers. */
function improveBulletText(bullet: string, masterSkills: Set<string>): { text: string; changed: boolean; reason?: string } {
  let text = bullet.trim();
  let changed = false;
  let reason: string | undefined;

  for (const weak of WEAK_OPENERS) {
    const m = text.match(weak.pattern);
    if (!m) continue;
    // Find a technology mentioned later in the same bullet that the master CV supports
    const claims = claimsInText(text).filter((c) => masterSkills.has(c));
    const rest = text.replace(weak.pattern, '').trim().replace(/^(on|with|in|for|the|a|an)\s+/i, '');
    if (!rest) break;
    let verb: string;
    if (claims.length > 0) {
      const isData = /^(database|sql|query)/i.test(claims[0]);
      verb = isData ? 'Designed' : 'Developed';
    } else if (/\b(test|qa|bug)\b/i.test(text)) verb = 'Tested';
    else if (/\b(team|client|stakeholder)\b/i.test(text)) verb = 'Collaborated';
    else if (/\b(deploy|release|ci|cd|pipeline)\b/i.test(text)) verb = 'Delivered';
    else verb = 'Worked'; // last resort stays truthful but specific below
    const candidate =
      verb === 'Worked'
        ? null
        : verb === 'Collaborated' && !/^on\b/i.test(rest)
          ? `Collaborated on ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`
          : `${verb} ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
    if (candidate) {
      text = sentenceCase(candidate);
      changed = true;
      reason = `Replaced the weak opener "${m[0].trim()}" with a specific action verb (same facts, stronger phrasing).`;
      break;
    }
  }

  // Trim filler words
  const trimmed = text
    .replace(/\b(various|multiple)\s+(tasks|things|stuff|activities)\b/gi, 'tasks')
    .replace(/\betc\.?$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (trimmed !== text) {
    text = trimmed;
    changed = true;
    reason = reason || 'Removed vague filler words.';
  }
  return { text, changed, reason };
}

export async function tailorResume(
  master: ResumeData,
  job: JobAnalysis,
  match: MatchAnalysis,
  provider?: AiProvider
): Promise<TailoringResult> {
  const resume = clone(master);
  const changeLog: ChangeLogEntry[] = [];
  const masterSkillSet = masterClaimTokens(master);
  const masterSkillNames = new Set([
    ...master.skills.technical.map((s) => s.toLowerCase()),
    ...masterClaimTokens(master),
  ]);
  const masterNums = masterNumbers(master);

  const relevantSkills = [...match.matchedSkills, ...match.partialSkills]; // skills the CV actually supports
  // Rank relevant skills by true JD importance: title mentions (weight 10) + JD occurrences (weight 1)
  const lowerTitle = (job.title || '').toLowerCase();
  const lowerJd = [...job.responsibilities, ...job.keywords, job.title, job.company].join(' ').toLowerCase();
  const skillJobFrequency = new Map<string, number>();
  for (const s of relevantSkills) {
    let score = 0;
    if (lowerTitle.includes(s.toLowerCase())) score += 10;
    score += countSkillOccurrences(lowerJd, s);
    skillJobFrequency.set(s, score);
  }
  relevantSkills.sort((a, b) => (skillJobFrequency.get(b) || 0) - (skillJobFrequency.get(a) || 0));
  const relevantSet = new Set(relevantSkills.map((s) => s.toLowerCase()));

  // ---------- 0. Personal Headline Grounding ----------
  // The candidate's headline must remain strictly grounded in facts from their Master CV.
  // Never inflate seniority or change professional identity to game title-overlap scores.
  const targetTitle = job.title !== 'Unknown Title' ? job.title : undefined;
  if (!resume.personal.headline?.trim()) {
    // Genuinely supported improvement: populate missing headline from most recent evidenced position
    const evidencedTitle = master.experience[0]?.title?.trim();
    if (evidencedTitle) {
      resume.personal.headline = evidencedTitle;
      changeLog.push({
        type: 'summary',
        section: 'Personal Details — Headline',
        before: '',
        after: evidencedTitle,
        reason: `Populated missing headline from candidate's most recent evidenced role ("${evidencedTitle}").`,
        label: 'headline_grounded',
        evidence: `Master CV → Experience[0].title: "${evidencedTitle}"`,
        provenance: 'source_cv',
      });
    }
  }

  // ---------- 1. Summary ----------
  // Use candidate's factual title (never falsely claiming unearned seniority).
  const factualTitle = resume.personal.headline?.trim() || master.experience[0]?.title?.trim() || 'Software Engineer';
  const years = yearsOfExperience(master);
  const topSkills = relevantSkills.filter((s) => masterSkillSet.has(s)).slice(0, 5);
  const quantified = master.experience.flatMap((e) => e.bullets).filter(containsMetric).slice(0, 2);
  const edu = master.education[0];
  const roleSpecialism = topSkills.slice(0, 3).join(', ');

  const summaryParts: string[] = [];
  summaryParts.push(
    years !== null
      ? `${factualTitle} with ${years}+ ${years === 1 ? 'year' : 'years'} of hands-on experience${roleSpecialism ? ` in ${roleSpecialism}` : ''}.`
      : `${factualTitle}${roleSpecialism ? ` specialising in ${roleSpecialism}` : ''}.`
  );
  if (quantified.length > 0) {
    const fact = quantified[0].replace(/\.$/, '').trim();
    summaryParts.push(`${fact.charAt(0).toUpperCase()}${fact.slice(1)}.`);
  } else if (master.experience[0]) {
    const e = master.experience[0];
    summaryParts.push(`Most recently ${e.title} at ${e.company}, working across ${findSkillsInText(e.bullets.join(' ')).slice(0, 3).map((s) => s.canonical).join(', ') || 'the full delivery lifecycle'}.`);
  }
  if (topSkills.length > roleSpecialism.length ? topSkills.length > 3 : false) {
    summaryParts.push(`Core toolkit: ${topSkills.slice(0, 6).join(', ')}.`);
  }
  if (edu?.degree) {
    summaryParts.push(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}${edu.institution ? ` (${edu.institution})` : ''}.`);
  }
  const newSummary = summaryParts.join(' ').replace(/\s+/g, ' ').trim();

  const oldSummary = resume.summary;
  if (newSummary && newSummary !== oldSummary && wordCount(newSummary) <= 110) {
    resume.summary = newSummary;
    changeLog.push({
      type: 'summary',
      section: 'Summary',
      before: oldSummary,
      after: newSummary,
      reason: 'Reframed around the target role using only facts already in your Master CV (role, experience span, evidenced skills, quantified achievement, education).',
      label: 'summary',
      evidence: 'Master CV → summary, experience dates, evidenced skills',
      provenance: 'source_cv',
    });
  }

  // ---------- 2. Bullet improvement (experience) ----------
  for (const exp of resume.experience as ExperienceItem[]) {
    const originalExp = master.experience.find((e) => e.id === exp.id);
    exp.bullets = exp.bullets.map((b, idx) => {
      const original = originalExp?.bullets[idx] ?? b;
      let text = b;
      let reason: string | undefined;
      let changed = false;

      const providerResult = provider?.improveBullet ? provider.improveBullet(text, [...masterSkillNames]) : null;
      if (providerResult && providerResult.text !== text) {
        text = providerResult.text;
        reason = providerResult.reason;
        changed = true;
      }
      if (!changed) {
        const local = improveBulletText(text, masterSkillSet);
        if (local.changed) {
          text = local.text;
          reason = local.reason;
          changed = true;
        }
      }
      // JD phrasing alignment: if bullet already evidences a JD skill by alias, adopt the JD's exact term
      for (const skill of relevantSkills) {
        const def = findSkillsInText(text).find((f) => f.canonical === skill);
        if (def && !skillTermRegex(skill.toLowerCase()).test(text)) {
          const skillDef = getSkillDef(skill);
          if (skillDef) {
            const matchingAlias = [...skillDef.aliases]
              .sort((a, b) => b.length - a.length)
              .find((alias) => alias.length >= 2 && skillTermRegex(alias).test(text));
            if (matchingAlias) {
              if (matchingAlias.toLowerCase() === 'restful' && skill === 'REST APIs') continue;
              if (['sla', 'slo'].includes(matchingAlias.toLowerCase()) && skill === 'SRE') continue;
              const updated = text.replace(skillTermRegex(matchingAlias), skill);
              if (updated !== text && isBulletTruthful(updated, master, masterSkillSet, masterNums).ok) {
                text = updated;
                reason = reason || `Aligned terminology with the job description ("${matchingAlias}" → "${skill}") — same skill, JD's phrasing.`;
                changed = true;
                break;
              }
            }
          }
        }
      }
      if (changed) {
        changeLog.push({
          type: 'bullet',
          section: `Experience — ${exp.title}, ${exp.company}`,
          before: original,
          after: text,
          reason: reason || 'Strengthened phrasing without adding new facts.',
          label: 'bullet_rewrite',
          evidence: `Master CV → Experience → ${exp.company} (same facts, stronger phrasing)`,
          provenance: 'source_cv',
        });
      }
      return text;
    });
  }

  // ---------- 3. Bullet improvement (projects) + tech ordering ----------
  for (const proj of resume.projects as ProjectItem[]) {
    const originalProj = master.projects.find((p) => p.id === proj.id);
    proj.bullets = proj.bullets.map((b, idx) => {
      const original = originalProj?.bullets[idx] ?? b;
      let text = b;
      let reason: string | undefined;
      let changed = false;

      const local = improveBulletText(b, masterSkillSet);
      if (local.changed) {
        text = local.text;
        reason = local.reason;
        changed = true;
      }
      for (const skill of relevantSkills) {
        const def = findSkillsInText(text).find((f) => f.canonical === skill);
        if (def && !skillTermRegex(skill.toLowerCase()).test(text)) {
          const skillDef = getSkillDef(skill);
          if (skillDef) {
            const matchingAlias = [...skillDef.aliases]
              .sort((a, b) => b.length - a.length)
              .find((alias) => alias.length >= 2 && skillTermRegex(alias).test(text));
            if (matchingAlias) {
              if (matchingAlias.toLowerCase() === 'restful' && skill === 'REST APIs') continue;
              if (['sla', 'slo'].includes(matchingAlias.toLowerCase()) && skill === 'SRE') continue;
              const updated = text.replace(skillTermRegex(matchingAlias), skill);
              if (updated !== text && isBulletTruthful(updated, master, masterSkillSet, masterNums).ok) {
                text = updated;
                reason = reason || `Aligned terminology with the job description ("${matchingAlias}" → "${skill}") — same skill, JD's phrasing.`;
                changed = true;
                break;
              }
            }
          }
        }
      }
      if (changed) {
        changeLog.push({
          type: 'bullet',
          section: `Projects — ${proj.name}`,
          before: original,
          after: text,
          reason: reason || local.reason || 'Strengthened phrasing without adding new facts.',
          label: 'bullet_rewrite',
          evidence: `Master CV → Projects → ${proj.name} (same facts, stronger phrasing)`,
          provenance: 'source_cv',
        });
      }
      return text;
    });
  }

  // ---------- 4. Skills reordering (relevance first, nothing added) ----------
  const originalTech = resume.skills.technical;
  const relevanceRank = (skill: string): number => {
    const lower = skill.toLowerCase();
    const exact = relevantSkills.findIndex((s) => s.toLowerCase() === lower);
    if (exact >= 0) return exact;
    const any = relevantSkills.findIndex((s) => s.toLowerCase().includes(lower) || lower.includes(s.toLowerCase()));
    return any >= 0 ? any : relevantSkills.length;
  };
  const sortedTech = [...originalTech].sort((a, b) => relevanceRank(a) - relevanceRank(b));
  if (JSON.stringify(sortedTech) !== JSON.stringify(originalTech)) {
    resume.skills.technical = sortedTech;
    changeLog.push({
      type: 'order',
      section: 'Technical Skills',
      before: originalTech.join(', '),
      after: sortedTech.join(', '),
      reason: 'Reordered so the skills this job actually asks for appear first. No skills were added or removed.',
      label: 'skills_ordering',
      evidence: 'Master CV → Technical Skills (reordering only — identical skill set)',
      provenance: 'source_cv',
    });
  }

  // ---------- 5. Experience bullet reordering (relevant bullets first per role) ----------
  for (const exp of resume.experience) {
    const rank = (b: string): number => {
      const claims = findSkillsInText(b).map((c) => c.canonical);
      const hits = claims.filter((c) => relevantSet.has(c.toLowerCase())).length;
      return -hits;
    };
    const original = [...exp.bullets];
    const sorted = [...exp.bullets].sort((a, b) => rank(a) - rank(b));
    if (JSON.stringify(sorted) !== JSON.stringify(original)) {
      exp.bullets = sorted;
      changeLog.push({
        type: 'order',
        section: `Experience — ${exp.title}, ${exp.company}`,
        before: original.join(' | '),
        after: sorted.join(' | '),
        reason: 'Moved the bullets most relevant to this job to the top. Content unchanged.',
        label: 'ordering',
        evidence: 'Master CV → same bullets, relevance-ranked against the job requirements',
        provenance: 'source_cv',
      });
    }
  }

  // ---------- 6. Truth validation ----------
  const truth = validateTruth(resume, master, masterSkillSet, masterNums);

  return { resume, targetRole: targetTitle, changeLog, truth };
}

/**
 * Validate a candidate resume against the master CV.
 * Any bullet making claims (technologies, numbers) not supported by the master
 * CV is reverted to the master's version and reported.
 */
export function validateTruth(
  candidate: ResumeData,
  master: ResumeData,
  masterSkills?: Set<string>,
  masterNums?: Set<string>
): TruthReport {
  const skills = masterSkills ?? masterClaimTokens(master);
  const nums = masterNums ?? masterNumbers(master);
  const checks: TruthCheck[] = [];
  const autoFixed: string[] = [];

  const checkAndFix = (section: string, bullet: string, masterVersion: string | undefined): TruthCheck => {
    const check = isBulletTruthful(bullet, master, skills, nums);
    if (check.ok) {
      return { bullet, status: 'supported', unsupportedClaims: [], note: section };
    }
    const problems = check.unsupported;
    // Auto-fix: revert to master version if available
    if (masterVersion !== undefined && masterVersion.trim()) {
      autoFixed.push(`"${bullet.slice(0, 80)}${bullet.length > 80 ? '…' : ''}" → reverted to Master CV version`);
      return {
        bullet: masterVersion,
        status: 'reverted',
        unsupportedClaims: problems,
        note: `${section} — reverted to Master CV wording (unsupported claims detected: ${problems.join(', ')}).`,
      };
    }
    return {
      bullet,
      status: 'warning',
      unsupportedClaims: problems,
      note: `${section} — flagged for manual review.`,
    };
  };

  for (const exp of candidate.experience) {
    const masterExp = master.experience.find((e) => e.id === exp.id);
    exp.bullets = exp.bullets.map((b, i) => {
      const check = checkAndFix(`Experience — ${exp.title}`, b, masterExp?.bullets[i]);
      checks.push(check);
      return check.bullet;
    });
  }
  for (const proj of candidate.projects) {
    const masterProj = master.projects.find((p) => p.id === proj.id);
    proj.bullets = proj.bullets.map((b, i) => {
      const check = checkAndFix(`Projects — ${proj.name}`, b, masterProj?.bullets[i]);
      checks.push(check);
      return check.bullet;
    });
  }

  // Summary check: every claim in the summary must exist in the master and satisfy Truth Guard
  const summaryCheck = isBulletTruthful(candidate.summary, master, skills, nums);
  if (!summaryCheck.ok) {
    checks.push({
      bullet: candidate.summary,
      status: 'warning',
      unsupportedClaims: summaryCheck.unsupported,
      note: 'Summary mentions content or metrics not present in the Master CV — please verify.',
    });
  }

  return {
    passedAll: checks.every((c) => c.status === 'supported'),
    checks,
    autoFixed,
  };
}

/** Generate editor suggestions for an existing resume (used by the editor panel). */
export function generateSuggestions(
  resume: ResumeData,
  job?: JobAnalysis,
  provider?: AiProvider
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const masterSkills = masterClaimTokens(resume);
  let n = 0;
  const push = (s: Omit<Suggestion, 'id'>) => {
    suggestions.push({ ...s, id: `sug_${++n}` });
  };

  const bulletSources: { section: string; itemId: string; bullets: string[] }[] = [
    ...resume.experience.map((e) => ({ section: `Experience — ${e.title}`, itemId: e.id, bullets: e.bullets })),
    ...resume.projects.map((p) => ({ section: `Projects — ${p.name}`, itemId: p.id, bullets: p.bullets })),
  ];

  for (const src of bulletSources) {
    src.bullets.forEach((b, i) => {
      if (!b.trim()) return;
      if (WEAK_OPENERS.some((w) => w.pattern.test(b.trim()))) {
        const providerResult = provider?.improveBullet ? provider.improveBullet(b, [...masterSkills]) : null;
        const local = improveBulletText(b, masterSkills);
        const suggested = providerResult?.text || local.text;
        if (suggested !== b) {
          push({
            section: src.section,
            kind: 'bullet',
            itemId: src.itemId,
            bulletIndex: i,
            current: b,
            suggested,
            reason: providerResult?.reason || local.reason || 'Vague opener — same facts, stronger phrasing.',
          });
          return;
        }
      }
      if (!containsMetric(b) && wordCount(b) > 8 && i === 0 && src.bullets.length > 1) {
        // only suggest quantification as a prompt, never auto-insert numbers
        push({
          section: src.section,
          kind: 'quantification',
          itemId: src.itemId,
          bulletIndex: i,
          current: b,
          suggested: b,
          reason: 'This bullet has no measurable outcome. If you have a real number (users, %, time saved), edit the bullet to include it — Curevo AI will never invent one.',
        });
      }
      void ALL_POWER_VERBS;
    });
  }

  if (wordCount(resume.summary || '') < 25 && (resume.experience.length > 0 || resume.projects.length > 0)) {
    push({
      section: 'Summary',
      kind: 'summary',
      current: resume.summary || '(empty)',
      suggested: '',
      reason: 'Your summary is missing or very short. Add 3–5 lines covering role, experience and strongest evidenced skills.',
    });
  }

  if (job) {
    const jdSkills = new Set([...job.requiredSkills, ...job.preferredSkills].map((s) => s.toLowerCase()));
    const listed = resume.skills.technical.map((s) => s.toLowerCase());
    const ordered = [...resume.skills.technical].sort((a, b) => {
      const aHit = jdSkills.has(a.toLowerCase()) ? 0 : 1;
      const bHit = jdSkills.has(b.toLowerCase()) ? 0 : 1;
      return aHit - bHit;
    });
    if (JSON.stringify(ordered) !== JSON.stringify(resume.skills.technical) && ordered.length > 0) {
      push({
        section: 'Technical Skills',
        kind: 'skill',
        current: resume.skills.technical.join(', '),
        suggested: ordered.join(', '),
        reason: 'Move the skills this job asks for to the front of the list. Reordering only — nothing added.',
      });
    }
  }

  return suggestions;
}
