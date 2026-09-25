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
import { findSkillsInText, skillTermRegex } from '../lib/skills';
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
  addText(master.summary);
  for (const e of master.experience) {
    addText(`${e.title} ${e.company} ${e.location || ''} ${e.bullets.join(' ')}`);
  }
  for (const p of master.projects) {
    addText(`${p.name} ${p.description || ''} ${(p.tech || []).join(' ')} ${p.bullets.join(' ')}`);
  }
  addText(master.skills.technical.join(' '));
  addText(master.skills.soft.join(' '));
  for (const ed of master.education) addText(`${ed.degree} ${ed.field || ''}`);
  for (const c of master.certifications) addText(`${c.name} ${c.issuer || ''}`);
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
    master.summary,
    ...master.experience.flatMap((e) => [e.title, e.company, ...e.bullets]),
    ...master.projects.flatMap((p) => [p.name, p.description || '', ...p.bullets]),
    ...master.achievements,
    ...master.education.map((e) => `${e.degree} ${e.startDate} ${e.endDate} ${e.grade || ''}`),
  ].join(' ');
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?%?/g)) nums.add(m[0]);
  return nums;
}

/**
 * Check one candidate bullet against the Master CV without mutating anything.
 * Used by the AI agent's Truth Guard to pre-validate AI-proposed rewrites:
 * technologies/claims must exist in the master, and no new numbers may appear
 * (small ints 1–2 digits are tolerated as list indices/counts).
 */
export function isBulletTruthful(
  bullet: string,
  master: ResumeData,
  masterSkills?: Set<string>,
  masterNums?: Set<string>
): { ok: boolean; unsupported: string[] } {
  const skills = masterSkills ?? masterClaimTokens(master);
  const nums = masterNums ?? masterNumbers(master);
  const unsupported = [
    ...claimsInText(bullet).filter((c) => !skills.has(c)),
  ];
  const bulletNums = [...bullet.matchAll(/\d+(?:[.,]\d+)?%?/g)].map((m) => m[0]);
  unsupported.push(...bulletNums.filter((n) => !nums.has(n) && !/^\d{1,2}$/.test(n)));
  return { ok: unsupported.length === 0, unsupported: [...new Set(unsupported)] };
}

function yearsOfExperience(master: ResumeData): number | null {
  let earliest: number | null = null;
  for (const e of master.experience) {
    const m = (e.startDate || '').match(/(\d{4})/);
    if (m) {
      const y = parseInt(m[1], 10);
      if (y > 1950 && y <= new Date().getFullYear() && (earliest === null || y < earliest)) earliest = y;
    }
  }
  if (earliest === null) return null;
  return Math.max(0, new Date().getFullYear() - earliest);
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
    const candidate = verb === 'Worked' ? null : `${verb} ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
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
  const relevantSet = new Set(relevantSkills.map((s) => s.toLowerCase()));

  // ---------- 1. Summary ----------
  const years = yearsOfExperience(master);
  const targetTitle = job.title !== 'Unknown Title' ? job.title : master.personal.headline || 'Software Engineer';
  const topSkills = relevantSkills.filter((s) => masterSkillSet.has(s)).slice(0, 5);
  const quantified = master.experience.flatMap((e) => e.bullets).filter(containsMetric).slice(0, 2);
  const edu = master.education[0];
  const roleSpecialism = topSkills.slice(0, 3).join(', ');

  const summaryParts: string[] = [];
  summaryParts.push(
    years !== null
      ? `${targetTitle} with ${years}+ ${years === 1 ? 'year' : 'years'} of hands-on experience${roleSpecialism ? ` in ${roleSpecialism}` : ''}.`
      : `${targetTitle}${roleSpecialism ? ` specialising in ${roleSpecialism}` : ''}.`
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
        if (def && !skillTermRegex(skill.toLowerCase()).test(text) && text.toLowerCase().includes(def.canonical.toLowerCase())) {
          // same canonical skill, different alias — safe to align terminology
          const updated = text.replace(new RegExp(def.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), skill);
          if (updated !== text) {
            text = updated;
            reason = reason || `Aligned terminology with the job description ("${def.canonical}" → "${skill}") — same skill, JD's phrasing.`;
            changed = true;
          }
          break;
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
      const local = improveBulletText(b, masterSkillSet);
      if (local.changed) {
        changeLog.push({
          type: 'bullet',
          section: `Projects — ${proj.name}`,
          before: original,
          after: local.text,
          reason: local.reason || 'Strengthened phrasing without adding new facts.',
          label: 'bullet_rewrite',
          evidence: `Master CV → Projects → ${proj.name} (same facts, stronger phrasing)`,
        });
        return local.text;
      }
      return b;
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
      });
    }
  }

  // ---------- 6. Truth validation ----------
  const truth = validateTruth(resume, master, masterSkillSet, masterNums);

  return { resume, changeLog, truth };
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
    const claims = claimsInText(bullet);
    const unsupported = claims.filter((c) => !skills.has(c));
    // numbers that the master never mentions (excluding innocuous small ints and dates)
    const bulletNums = [...bullet.matchAll(/\d+(?:[.,]\d+)?%?/g)].map((m) => m[0]);
    const unsupportedNums = bulletNums.filter((n) => !nums.has(n) && !/^\d{1,2}$/.test(n));
    const problems = [...unsupported, ...unsupportedNums];
    if (problems.length === 0) {
      return { bullet, status: 'supported', unsupportedClaims: [], note: section };
    }
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

  // Summary check: every claim in the summary must exist in the master
  const summaryClaims = claimsInText(candidate.summary).filter((c) => !skills.has(c));
  if (summaryClaims.length > 0) {
    checks.push({
      bullet: candidate.summary,
      status: 'warning',
      unsupportedClaims: summaryClaims,
      note: 'Summary mentions content not present in the Master CV — please verify.',
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
          reason: 'This bullet has no measurable outcome. If you have a real number (users, %, time saved), edit the bullet to include it — EnhanceCV will never invent one.',
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
