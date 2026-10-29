// CV ↔ JD matching engine.
//
// Produces an explainable "Curevo AI Job Match" score. The two-component
// weighting (required skills dominate, preferred skills contribute less) and
// the requirement classification follow the MIT-licensed ResumeSkills
// methodology ("job-description-analyzer": required% × 0.7 + preferred% × 0.3).

import {
  AtsAdvisory,
  AtsAdvisoryRecommendation,
  ATSAnalysis,
  EvidenceProvenance,
  JobAnalysis,
  MatchAnalysis,
  MatchItem,
  MatchStatus,
  ResumeData,
  ScoreComponent,
} from '../types';
import { RELATED_SKILLS, countSkillOccurrences, findSkillsInText, getSkillDef, skillTermRegex } from '../lib/skills';
import { containsMetric, toWords } from '../lib/text';

interface SectionRef {
  name: string;
  type: 'skills' | 'experience' | 'projects' | 'education' | 'certifications' | 'summary';
  text: string;
}

interface MasterEvidenceResult {
  skillText: string;
  bulletText: string;
  fullText: string;
  sections: SectionRef[];
}

function masterEvidence(resume: ResumeData): MasterEvidenceResult {
  const skillParts = [...resume.skills.technical, ...resume.skills.soft];
  const bulletParts: string[] = [];
  for (const e of resume.experience) bulletParts.push(...e.bullets);
  for (const p of resume.projects) bulletParts.push(...p.bullets, p.description || '', ...(p.tech || []));
  const certParts = resume.certifications.map((c) => `${c.name} ${c.issuer || ''}`);
  const eduParts = resume.education.map((e) => `${e.degree} ${e.field || ''} ${e.institution}`);
  const achievementParts = [...resume.achievements];

  const sections: SectionRef[] = [
    { name: 'Technical Skills', type: 'skills', text: resume.skills.technical.join(' ') },
    { name: 'Soft Skills', type: 'skills', text: resume.skills.soft.join(' ') },
  ];
  for (const e of resume.experience) {
    const label = e.company ? `Experience (${e.company})` : `Experience (${e.title})`;
    sections.push({ name: label, type: 'experience', text: `${e.title} ${e.company} ${e.bullets.join(' ')}` });
  }
  for (const p of resume.projects) {
    sections.push({
      name: `Projects (${p.name})`,
      type: 'projects',
      text: `${p.name} ${p.description || ''} ${(p.tech || []).join(' ')} ${p.bullets.join(' ')}`,
    });
  }
  for (const c of resume.certifications) {
    sections.push({ name: `Certifications (${c.name})`, type: 'certifications', text: `${c.name} ${c.issuer || ''}` });
  }
  for (const ed of resume.education) {
    sections.push({
      name: `Education (${ed.degree})`,
      type: 'education',
      text: `${ed.degree} ${ed.field || ''} ${ed.institution}`,
    });
  }
  if (resume.summary) {
    sections.push({ name: 'Summary', type: 'summary', text: resume.summary });
  }

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
    sections,
  };
}

function findMatchingSections(req: string, sections: SectionRef[]): string[] {
  const def = getSkillDef(req);
  const matched: string[] = [];
  for (const s of sections) {
    let hit = false;
    if (def) {
      if (countSkillOccurrences(s.text, req) > 0) {
        hit = true;
      } else if (RELATED_SKILLS[def.canonical]) {
        for (const rel of RELATED_SKILLS[def.canonical]) {
          if (countSkillOccurrences(s.text, rel) > 0) {
            hit = true;
            break;
          }
        }
      }
    } else {
      const softRe = skillTermRegex(req.toLowerCase());
      if (softRe.test(s.text.toLowerCase())) {
        hit = true;
      } else {
        const tokens = toWords(req).filter((w) => w.length > 2);
        if (tokens.length > 0) {
          const sTokens = new Set(toWords(s.text));
          const ratio = tokens.filter((t) => sTokens.has(t)).length / tokens.length;
          if (ratio >= 0.5) hit = true;
        }
      }
    }
    if (hit) matched.push(s.name);
  }
  return [...new Set(matched)];
}

/** Match one requirement (skill or phrase) against the master CV. */
function classifyRequirement(
  requirement: string,
  evidence: MasterEvidenceResult,
  type: MatchItem['type'] = 'required'
): { status: MatchStatus; evidenceNote: string; section?: string; actionableAdvice?: string; provenance: EvidenceProvenance } {
  const req = requirement.trim();
  if (!req) return { status: 'unknown', evidenceNote: 'Empty requirement', provenance: 'unsupported' };

  let status: MatchStatus = 'unknown';
  let evidenceNote = '';

  // 1. Canonical taxonomy skill?
  const def = getSkillDef(req);
  if (def) {
    const inSkills = countSkillOccurrences(evidence.skillText, req);
    const inBullets = countSkillOccurrences(evidence.bulletText, req);
    const total = inSkills + inBullets;
    if (inSkills > 0 && total >= 2) {
      status = 'matched';
      evidenceNote = `Listed in skills and evidenced ${total} times across your CV.`;
    } else if (total >= 1) {
      status = 'matched';
      evidenceNote = inSkills > 0 ? 'Listed in your skills section.' : 'Mentioned in your experience/projects.';
    } else if (RELATED_SKILLS[def.canonical]) {
      const found = RELATED_SKILLS[def.canonical].find((r) => countSkillOccurrences(evidence.fullText, r) > 0);
      if (found) {
        status = 'matched';
        evidenceNote = `Evidenced via ${found} in your CV.`;
      } else {
        status = 'missing';
        evidenceNote = 'No mention of this skill anywhere in your Master CV.';
      }
    } else {
      status = 'missing';
      evidenceNote = 'No mention of this skill anywhere in your Master CV.';
    }
  } else {
    // 2. Soft skill phrase?
    const softRe = skillTermRegex(req.toLowerCase());
    const inSkillText = softRe.test(evidence.skillText.toLowerCase());
    const inFullText = softRe.test(evidence.fullText.toLowerCase());
    if (inSkillText || inFullText) {
      status = inSkillText ? 'matched' : 'partial';
      evidenceNote = inSkillText ? 'Listed in your skills section.' : 'Demonstrated implicitly in your experience.';
    } else {
      // 3. Free-text requirement (e.g. "REST API development", "5+ years experience"):
      //    token overlap with CV text.
      const tokens = toWords(req).filter((w) => w.length > 2);
      if (tokens.length === 0) {
        status = 'unknown';
        evidenceNote = 'Requirement is too vague to verify automatically.';
      } else {
        const cvTokens = new Set(toWords(evidence.fullText));
        const hits = tokens.filter((t) => cvTokens.has(t));
        const ratio = hits.length / tokens.length;
        if (ratio >= 0.75) {
          status = 'matched';
          evidenceNote = `Strong overlap with your CV content (${hits.join(', ')}).`;
        } else if (ratio >= 0.4) {
          status = 'partial';
          evidenceNote = `Partially addressed — only ${hits.join(', ') || 'few'} of the required terms appear.`;
        } else if (/year/i.test(req) && /\b\d{4}\b/.test(evidence.fullText)) {
          status = 'unknown';
          evidenceNote = 'Your CV shows dated experience; verify the years requirement manually.';
        } else {
          status = 'missing';
          evidenceNote = 'Not found in your Master CV.';
        }
      }
    }
  }

  const foundSections = findMatchingSections(req, evidence.sections);
  let section: string | undefined;
  let actionableAdvice: string | undefined;
  let provenance: EvidenceProvenance = 'unsupported';

  if (status === 'matched') {
    provenance = 'source_cv';
    section = foundSections.length > 0 ? foundSections.join(', ') : 'CV Content';
    if (foundSections.some((s) => s.startsWith('Experience'))) {
      actionableAdvice = 'Supported by practical work experience in your CV. Ensure accomplishments demonstrate business impact with metrics.';
    } else if (foundSections.includes('Technical Skills')) {
      actionableAdvice = 'Listed in your Technical Skills section. If used in production, consider adding an achievement bullet in your Experience section.';
    } else {
      actionableAdvice = 'Supported by evidence found in your CV.';
    }
  } else if (status === 'partial') {
    provenance = 'source_cv';
    section = foundSections.length > 0 ? foundSections.join(', ') : 'Partial Overlap';
    actionableAdvice = 'Partially evidenced. Expand on this requirement with specific tools, context, or metrics to make your qualification unambiguous.';
  } else if (status === 'missing') {
    provenance = 'unsupported';
    section = 'Not found in CV';
    if (type === 'required') {
      actionableAdvice = 'Required by employer but not evidenced in your CV. Factual grounding prevents fabricating unevidenced qualifications. If you possess hands-on experience, you can explicitly add candidate-attested evidence to your Experience or Skills.';
    } else if (type === 'preferred') {
      actionableAdvice = 'Preferred / nice-to-have qualification. Not mandatory, but adding candidate-attested project or self-study experience can give you a competitive edge.';
    } else if (type === 'certification') {
      actionableAdvice = 'Certification not found on CV. If you hold this credential, add it to your Certifications section; otherwise, consider acquiring it.';
    } else {
      actionableAdvice = 'Requirement not substantiated in your CV facts. Add candidate-attested details if you possess this experience.';
    }
  } else {
    provenance = 'unsupported';
    section = 'Manual Verification';
    actionableAdvice = 'Verify manually against your career background.';
  }

  return { status, evidenceNote, section, actionableAdvice, provenance };
}

function coverage(skills: string[], evidence: MasterEvidenceResult): {
  matched: string[];
  partial: string[];
  missing: string[];
  percent: number;
} {
  const matched: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];
  for (const s of skills) {
    const { status } = classifyRequirement(s, evidence, 'required');
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
    const { status, evidenceNote, section, actionableAdvice, provenance } = classifyRequirement(req, evidence, type);
    items.push({ requirement: req, type, status, evidence: evidenceNote, section, actionableAdvice, provenance });
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

  const advisory = generateResumeSkillsAdvisory(master, job, items);

  return {
    score,
    breakdown,
    items,
    matchedSkills: reqItems.filter((i) => i.status === 'matched').map((i) => i.requirement),
    partialSkills: reqItems.filter((i) => i.status === 'partial' || i.status === 'unknown').map((i) => i.requirement),
    missingSkills: reqItems.filter((i) => i.status === 'missing').map((i) => i.requirement),
    keywordCoverage: { percent: keywordPercent, matched: kwMatched, missing: kwMissing },
    advisory,
  };

  void requiredStatuses;
  void preferredStatuses;
}

/**
 * Generates an ATS and role-aligned strategic advisory synthesizing principles from:
 * - ResumeSkills "job-description-analyzer" (requirement hierarchy, critical gaps)
 * - ResumeSkills "resume-bullet-writer" (Google X-Y-Z formula, active phrasing)
 * - ResumeSkills "resume-quantifier" (candidate discovery questions for missing metrics)
 * - ResumeSkills "resume-ats-optimizer" (keyword presence, role alignment)
 * - ResumeSkills "resume-tailor" (authentic emphasis without fabrication)
 */
export function generateResumeSkillsAdvisory(
  master: ResumeData,
  job: JobAnalysis,
  items: MatchItem[],
  ats?: ATSAnalysis
): AtsAdvisory {
  const recommendations: AtsAdvisoryRecommendation[] = [];
  const candidateQuestions: string[] = [];
  const keyStrengths: string[] = [];
  const criticalGaps: string[] = [];

  // 1. Key Evidenced Strengths
  const matchedRequired = items.filter((i) => i.status === 'matched' && i.type === 'required');
  const matchedPreferred = items.filter((i) => i.status === 'matched' && i.type === 'preferred');

  if (matchedRequired.length > 0) {
    keyStrengths.push(
      `Strong core alignment: ${matchedRequired.length} required skill(s) directly evidenced in your CV (${matchedRequired.slice(0, 4).map((i) => i.requirement).join(', ')}).`
    );
  }
  if (master.experience.length > 0 && master.experience.some((e) => e.bullets.some(containsMetric))) {
    keyStrengths.push(
      `Quantified track record: Your professional experience demonstrates measurable business impact and operational metrics.`
    );
  }
  if (master.certifications.length > 0) {
    keyStrengths.push(
      `Professional credentials: Validated industry certifications (${master.certifications.map((c) => c.name).slice(0, 2).join('; ')}) substantiate domain competence.`
    );
  }
  if (matchedPreferred.length > 0) {
    keyStrengths.push(
      `Competitive bonus skills: Evidences ${matchedPreferred.length} preferred qualification(s) (${matchedPreferred.slice(0, 3).map((i) => i.requirement).join(', ')}).`
    );
  }
  if (keyStrengths.length === 0) {
    keyStrengths.push(`Foundational qualifications detected across your education and core career history.`);
  }

  // 2. Critical Gaps (Honest disclosure — zero fabrication)
  const missingRequired = items.filter((i) => i.status === 'missing' && i.type === 'required');
  const missingPreferred = items.filter((i) => i.status === 'missing' && i.type === 'preferred');
  const missingCerts = items.filter((i) => i.status === 'missing' && i.type === 'certification');

  if (missingRequired.length > 0) {
    criticalGaps.push(
      `Missing ${missingRequired.length} mandatory requirement(s): ${missingRequired.slice(0, 3).map((i) => i.requirement).join(', ')}.`
    );
  }
  if (missingCerts.length > 0) {
    criticalGaps.push(
      `Certification gap: Role asks for ${missingCerts.slice(0, 2).map((i) => i.requirement).join(', ')}, which is not in your Master CV.`
    );
  }
  if (missingPreferred.length > 0) {
    criticalGaps.push(
      `Preferred skill gap: ${missingPreferred.length} desirable tool(s) not yet evidenced (${missingPreferred.slice(0, 3).map((i) => i.requirement).join(', ')}).`
    );
  }
  if (criticalGaps.length === 0) {
    criticalGaps.push('Zero mandatory requirement gaps detected against this job description.');
  }

  // 3. Actionable Recommendations
  // Category A: Missing Required Skills (Job Description Analyzer / Resume Tailor)
  for (const item of missingRequired.slice(0, 2)) {
    const q = `Do you have commercial, academic, or self-directed project experience with ${item.requirement}?`;
    recommendations.push({
      id: `rec-missing-${item.requirement.toLowerCase().replace(/\s+/g, '-')}`,
      category: 'missing_requirement',
      title: `Address Missing Requirement: ${item.requirement}`,
      section: 'Skills & Experience',
      issue: `"${item.requirement}" is specified as a mandatory qualification, but is not evidenced in your CV facts.`,
      whyItMatters: `Automated ATS filters and hiring managers treat required skills as key gating criteria.`,
      actionableStep: `If you have unlisted experience with ${item.requirement}, add candidate-attested bullet points or technical skills. If not, highlight related adjacent technologies.`,
      candidateQuestion: q,
      requiresCandidateInput: true,
    });
    candidateQuestions.push(q);
  }

  // Category B: Bullet Impact & Quantification (Resume Bullet Writer & Resume Quantifier)
  let unquantifiedFound = 0;
  for (const exp of master.experience) {
    for (const b of exp.bullets) {
      if (!containsMetric(b) && b.length > 30 && unquantifiedFound < 2) {
        unquantifiedFound++;
        const q = `What was the scale or measurable result of: "${b.slice(0, 60)}..."?`;
        recommendations.push({
          id: `rec-quant-${unquantifiedFound}`,
          category: 'quantification',
          title: `Apply Google X-Y-Z Formula in ${exp.company || exp.title}`,
          section: `Experience — ${exp.title}, ${exp.company}`,
          issue: `Bullet expresses responsibilities without a quantified outcome or scale measurement: "${b.slice(0, 80)}..."`,
          whyItMatters: `Accomplishments formatted with the Google X-Y-Z formula ("Accomplished [X] measured by [Y] doing [Z]") are up to 40% more memorable and credible.`,
          actionableStep: `State the specific action performed, the business problem or scope addressed, and the verified result achieved.`,
          candidateQuestion: q,
          metricPlaceholder: '[e.g. ~X% improvement, N+ users, or £Y saved]',
          requiresCandidateInput: true,
        });
        candidateQuestions.push(q);
      }
    }
  }

  // Category C: Keyword Alignment (Resume ATS Optimizer)
  const missingKeywords = job.keywords.filter(
    (kw) => !master.skills.technical.some((s) => s.toLowerCase() === kw.toLowerCase())
  );
  if (missingKeywords.length > 0) {
    const topMissingKw = missingKeywords.slice(0, 3).join(', ');
    recommendations.push({
      id: 'rec-keywords-align',
      category: 'keyword_gap',
      title: 'Align Industry Terminology with Job Posting',
      section: 'Technical Skills & Experience',
      issue: `Key role terminology (${topMissingKw}) is absent from your resume text.`,
      whyItMatters: `Recruiters and ATS search algorithms rank candidates higher when exact keyword terminology is present.`,
      actionableStep: `Review whether you have hands-on experience with these tools or methodologies and weave them into existing bullet descriptions.`,
      candidateQuestion: `Have you used ${topMissingKw} in any prior role or project?`,
      requiresCandidateInput: true,
    });
  }

  // Category D: Headline & Summary Targeting (Resume Tailor)
  if (!master.personal.headline || master.personal.headline.toLowerCase() !== job.title.toLowerCase()) {
    recommendations.push({
      id: 'rec-headline-target',
      category: 'formatting_structure',
      title: 'Targeted Professional Headline Alignment',
      section: 'Personal Details — Headline',
      issue: `Current headline "${master.personal.headline || '(empty)'}" can be more closely aligned with "${job.title}".`,
      whyItMatters: `Recruiters spend 6–7 seconds scanning the top of a CV; an aligned headline establishes immediate role fit.`,
      actionableStep: `Ensure your headline accurately describes your evidenced career level and target specialism.`,
      requiresCandidateInput: false,
    });
  }

  // Deduplicate and bound candidate questions
  const uniqueQuestions = [...new Set(candidateQuestions)].slice(0, 5);

  const summary = `Curevo AI + ResumeSkills evaluation for "${job.title}": ${matchedRequired.length}/${job.requiredSkills.length} required skills evidenced. ${missingRequired.length === 0 ? 'Excellent mandatory alignment.' : `${missingRequired.length} mandatory skill gap(s) require candidate attestation or strategic framing.`}`;

  return {
    summary,
    keyStrengths: keyStrengths.slice(0, 4),
    criticalGaps: criticalGaps.slice(0, 4),
    recommendations: recommendations.slice(0, 6),
    candidateQuestions: uniqueQuestions,
  };
}
