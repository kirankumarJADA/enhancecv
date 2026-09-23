// CV ↔ JD matching engine.
//
// Produces an explainable "EnhanceCV Job Match" score. The two-component
// weighting (required skills dominate, preferred skills contribute less) and
// the requirement classification follow the MIT-licensed ResumeSkills
// methodology ("job-description-analyzer": required% × 0.7 + preferred% × 0.3).

import { JobAnalysis, MatchAnalysis, MatchItem, MatchStatus, ResumeData, ScoreComponent } from '../types';
import { RELATED_SKILLS, countSkillOccurrences, findSkillsInText, getSkillDef, skillTermRegex } from '../lib/skills';
import { toWords } from '../lib/text';

interface Evidence {
  text: string;
  count: number;
}

function masterEvidence(resume: ResumeData): { skillText: string; bulletText: string; fullText: string } {
  const skillParts = [...resume.skills.technical, ...resume.skills.soft];
  const bulletParts: string[] = [];
  for (const e of resume.experience) bulletParts.push(...e.bullets);
  for (const p of resume.projects) bulletParts.push(...p.bullets, p.description || '', ...(p.tech || []));
  const certParts = resume.certifications.map((c) => `${c.name} ${c.issuer || ''}`);
  const eduParts = resume.education.map((e) => `${e.degree} ${e.field || ''} ${e.institution}`);
  const achievementParts = [...resume.achievements];
  return {
    skillText: skillParts.join('\n'),
    bulletText: bulletParts.join('\n'),
    fullText: [
      resume.summary,
      resume.personal.headline || '',
      skillParts.join(', '),
      bulletParts.join('\n'),
      certParts.join('\n'),
      eduParts.join('\n'),
      achievementParts.join('\n'),
      resume.languages.map((l) => l.name).join(', '),
    ].join('\n'),
  };
}

/** Match one requirement (skill or phrase) against the master CV. */
function classifyRequirement(
  requirement: string,
  evidence: { skillText: string; bulletText: string; fullText: string }
): { status: MatchStatus; evidenceNote: string } {
  const req = requirement.trim();
  if (!req) return { status: 'unknown', evidenceNote: 'Empty requirement' };

  // 1. Canonical taxonomy skill?
  const def = getSkillDef(req);
  if (def) {
    const inSkills = countSkillOccurrences(evidence.skillText, req);
    const inBullets = countSkillOccurrences(evidence.bulletText, req);
    const total = inSkills + inBullets;
    if (inSkills > 0 && total >= 2) {
      return { status: 'matched', evidenceNote: `Listed in skills and evidenced ${total} times across your CV.` };
    }
    if (total >= 1) {
      return { status: 'matched', evidenceNote: inSkills > 0 ? 'Listed in your skills section.' : 'Mentioned in your experience/projects.' };
    }
    // Concept-level skill evidenced by a concrete tool (e.g. Redux → State Management)
    const related = RELATED_SKILLS[def.canonical];
    if (related) {
      const found = related.find((r) => countSkillOccurrences(evidence.fullText, r) > 0);
      if (found) {
        return { status: 'matched', evidenceNote: `Evidenced via ${found} in your CV.` };
      }
    }
    return { status: 'missing', evidenceNote: 'No mention of this skill anywhere in your Master CV.' };
  }

  // 2. Soft skill phrase?
  const softRe = skillTermRegex(req.toLowerCase());
  const inSkillText = softRe.test(evidence.skillText.toLowerCase());
  const inFullText = softRe.test(evidence.fullText.toLowerCase());
  if (inSkillText || inFullText) {
    return {
      status: inSkillText ? 'matched' : 'partial',
      evidenceNote: inSkillText ? 'Listed in your skills section.' : 'Demonstrated implicitly in your experience.',
    };
  }

  // 3. Free-text requirement (e.g. "REST API development", "5+ years experience"):
  //    token overlap with CV text.
  const tokens = toWords(req).filter((w) => w.length > 2);
  if (tokens.length === 0) return { status: 'unknown', evidenceNote: 'Requirement is too vague to verify automatically.' };
  const cvTokens = new Set(toWords(evidence.fullText));
  const hits = tokens.filter((t) => cvTokens.has(t));
  const ratio = hits.length / tokens.length;
  if (ratio >= 0.75) return { status: 'matched', evidenceNote: `Strong overlap with your CV content (${hits.join(', ')}).` };
  if (ratio >= 0.4) return { status: 'partial', evidenceNote: `Partially addressed — only ${hits.join(', ') || 'few'} of the required terms appear.` };
  // experience-year requirements can't be verified from bullets alone
  if (/year/i.test(req) && /\b\d{4}\b/.test(evidence.fullText)) {
    return { status: 'unknown', evidenceNote: 'Your CV shows dated experience; verify the years requirement manually.' };
  }
  return { status: 'missing', evidenceNote: 'Not found in your Master CV.' };
}

function coverage(skills: string[], evidence: { skillText: string; bulletText: string; fullText: string }): {
  matched: string[];
  partial: string[];
  missing: string[];
  percent: number;
} {
  const matched: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];
  for (const s of skills) {
    const { status } = classifyRequirement(s, evidence);
    if (status === 'matched') matched.push(s);
    else if (status === 'partial') partial.push(s);
    else if (status === 'missing') missing.push(s);
    // 'unknown' counts as partial for coverage purposes
    else partial.push(s);
  }
  const percent = skills.length === 0 ? 100 : Math.round(((matched.length + partial.length * 0.5) / skills.length) * 100);
  return { matched, partial, missing, percent };
}

function overlapScore(jdPhrases: string[], cvText: string): number {
  if (jdPhrases.length === 0) return 70; // nothing to compare — neutral-positive
  let credits = 0;
  for (const phrase of jdPhrases) {
    const tokens = toWords(phrase).filter((w) => w.length > 3);
    if (tokens.length === 0) continue;
    const cvTokens = new Set(toWords(cvText));
    const ratio = tokens.filter((t) => cvTokens.has(t)).length / tokens.length;
    if (ratio >= 0.5) credits += 1;
    else if (ratio >= 0.34) credits += 0.5;
  }
  return Math.min(100, Math.round((credits / jdPhrases.length) * 100));
}

export function computeJobMatch(master: ResumeData, job: JobAnalysis): MatchAnalysis {
  const evidence = masterEvidence(master);
  const items: MatchItem[] = [];
  const matchedSkills: string[] = [];
  const partialSkills: string[] = [];
  const missingSkills: string[] = [];

  const classify = (req: string, type: MatchItem['type']) => {
    const { status, evidenceNote } = classifyRequirement(req, evidence);
    items.push({ requirement: req, type, status, evidence: evidenceNote });
    if (type === 'required' || type === 'preferred') {
      if (status === 'matched') matchedSkills.push(req);
      else if (status === 'partial') partialSkills.push(req);
      else if (status === 'missing') missingSkills.push(req);
    }
    return status;
  };

  const requiredStatuses = job.requiredSkills.map((s) => classify(s, 'required'));
  const preferredStatuses = job.preferredSkills.map((s) => classify(s, 'preferred'));
  for (const s of job.softSkills) classify(s, 'soft');
  for (const e of job.educationRequirements) classify(e, 'education');
  for (const c of job.certificationRequirements) classify(c, 'certification');
  for (const r of job.responsibilities.slice(0, 10)) classify(r, 'responsibility');

  const requiredCov = coverage(job.requiredSkills, evidence);
  const preferredCov = coverage(job.preferredSkills, evidence);

  const requiredScore = requiredCov.percent;
  const preferredScore = preferredCov.percent;
  // Responsibilities are often restatements of the skill list, so compare them
  // against everything the candidate claims (skills + bullets + projects), not
  // just experience bullets.
  const responsibilityScore = overlapScore(job.responsibilities, evidence.fullText);

  // Experience relevance: required skills evidenced inside experience/project
  // bullets + job-title alignment.
  const bulletAndProjectText = `${evidence.bulletText}`;
  const experienceSkillHits = job.requiredSkills.filter(
    (s) => countSkillOccurrences(bulletAndProjectText, s) > 0
  ).length;
  const experienceBase = job.requiredSkills.length === 0 ? 70 : (experienceSkillHits / job.requiredSkills.length) * 100;
  const titleTokens = toWords(job.title).filter((w) => !['the', 'a', 'an', 'of', 'and', 'senior', 'junior', 'lead', 'staff', 'principal'].includes(w));
  const ownTitles = `${master.personal.headline || ''} ${master.experience.map((e) => e.title).join(' ')}`.toLowerCase();
  const titleOverlap = titleTokens.length === 0
    ? 0.5
    : titleTokens.filter((t) => ownTitles.includes(t)).length / titleTokens.length;
  let experienceScore = Math.min(100, Math.round(experienceBase * 0.75 + titleOverlap * 25));

  // Project relevance
  const projectText = master.projects
    .map((p) => `${p.name} ${p.description || ''} ${(p.tech || []).join(' ')} ${p.bullets.join(' ')}`)
    .join('\n');
  const projectScore = master.projects.length === 0
    ? 60
    : Math.min(100, overlapScore(job.requiredSkills, projectText) + (findSkillsInText(projectText).length > 0 ? 10 : 0));

  // Keyword coverage
  const cvTokens = new Set(toWords(evidence.fullText));
  const kwMatched: string[] = [];
  const kwMissing: string[] = [];
  for (const k of job.keywords) {
    const tokens = toWords(k).filter((w) => w.length > 2);
    if (tokens.length === 0) continue;
    if (tokens.every((t) => cvTokens.has(t))) kwMatched.push(k);
    else kwMissing.push(k);
  }
  const keywordPercent = job.keywords.length === 0
    ? 100
    : Math.round((kwMatched.length / Math.max(1, kwMatched.length + kwMissing.length)) * 100);

  // Education alignment
  const eduScore = job.educationRequirements.length === 0
    ? 80
    : classifyRequirement(job.educationRequirements[0], evidence).status === 'matched'
      ? 100
      : classifyRequirement(job.educationRequirements[0], evidence).status === 'partial'
        ? 60
        : 30;

  const breakdown: ScoreComponent[] = [
    {
      key: 'requiredSkills',
      label: 'Required skill coverage',
      score: requiredScore,
      weight: 35,
      detail: `${requiredCov.matched.length}/${job.requiredSkills.length} required skills matched${requiredCov.partial.length ? `, ${requiredCov.partial.length} partial` : ''}.`,
    },
    {
      key: 'preferredSkills',
      label: 'Preferred skill coverage',
      score: preferredScore,
      weight: 10,
      detail: job.preferredSkills.length === 0
        ? 'The job lists no explicitly preferred skills.'
        : `${preferredCov.matched.length}/${job.preferredSkills.length} preferred skills matched.`,
    },
    {
      key: 'responsibilities',
      label: 'Responsibility alignment',
      score: responsibilityScore,
      weight: 15,
      detail: `Your CV addresses ${Math.round((responsibilityScore / 100) * Math.max(1, job.responsibilities.length))} of ${job.responsibilities.length} listed responsibilities.`,
    },
    {
      key: 'experience',
      label: 'Experience relevance',
      score: experienceScore,
      weight: 15,
      detail: `${experienceSkillHits} of ${job.requiredSkills.length} required skills are evidenced inside your work experience.`,
    },
    {
      key: 'projects',
      label: 'Project relevance',
      score: projectScore,
      weight: 10,
      detail: master.projects.length === 0 ? 'No projects listed on your Master CV.' : `${master.projects.length} project(s) reviewed against the JD technologies.`,
    },
    {
      key: 'keywords',
      label: 'Keyword coverage',
      score: keywordPercent,
      weight: 10,
      detail: `${kwMatched.length}/${kwMatched.length + kwMissing.length} JD keywords present in your CV.`,
    },
    {
      key: 'education',
      label: 'Education alignment',
      score: eduScore,
      weight: 5,
      detail: job.educationRequirements.length === 0 ? 'No specific education requirements detected.' : `Checked against: ${job.educationRequirements[0]}`,
    },
  ];

  const score = Math.min(
    100,
    Math.max(0, Math.round(breakdown.reduce((sum, b) => sum + (b.score * b.weight) / 100, 0)))
  );

  // Keep only required/preferred skill items in the top-level arrays
  const reqItems: MatchItem[] = items.filter((i) => i.type === 'required' || i.type === 'preferred');

  return {
    score,
    breakdown,
    items,
    matchedSkills: reqItems.filter((i) => i.status === 'matched').map((i) => i.requirement),
    partialSkills: reqItems.filter((i) => i.status === 'partial' || i.status === 'unknown').map((i) => i.requirement),
    missingSkills: reqItems.filter((i) => i.status === 'missing').map((i) => i.requirement),
    keywordCoverage: { percent: keywordPercent, matched: kwMatched, missing: kwMissing },
  };

  void requiredStatuses;
  void preferredStatuses;
}
