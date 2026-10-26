// Curevo AI — Advanced ATS Audit Engine.
//
// A comprehensive, transparent, evidence-based evaluation of resume readiness
// across 9 essential dimensions:
//
//   1. ATS Parsing Readiness (parsing)
//   2. Quantified Impact (quantification)
//   3. Repetition & Wording Quality (repetition)
//   4. Spelling & Grammar (spelling)
//   5. Bullet Consistency (consistency)
//   6. Essential Sections (sections)
//   7. ATS Essentials (essentials)
//   8. Recruiter Review Flags (recruiter)
//   9. Inclusive & Neutral Language (inclusivity)
//
// Guaranteed principles:
// - Deterministic & evidence-backed: every finding points to an exact citation or rule.
// - Honest scoring: graduated, proportional scoring reflecting realistic competitive readiness.
// - Non-discriminatory: employment gaps, career changes, age, gender, ethnicity, or disability
//   are NEVER penalized.
// - Truth-respecting: never encourages hallucination or fabrication of metrics.

import {
  ResumeData,
  SectionKey,
  ALL_SECTIONS,
  AdvancedAtsAudit,
  AuditDimensionKey,
  AuditFinding,
  DimensionAuditResult,
} from '../types';
import { ALL_POWER_VERBS, WEAK_OPENERS } from '../lib/verbs';
import { containsMetric, wordCount, GENERIC_SUMMARY_MARKERS } from '../lib/text';
import { findSkillsInText } from '../lib/skills';

export interface AuditContext {
  resume: ResumeData;
  parserNotes?: string[];
  extractionConfidence?: Record<string, string>;
}

// Dimension weights summing to exactly 100
export const DIMENSION_WEIGHTS: Record<AuditDimensionKey, number> = {
  parsing: 12,
  quantification: 15,
  repetition: 11,
  spelling: 10,
  consistency: 12,
  sections: 10,
  essentials: 12,
  recruiter: 10,
  inclusivity: 8,
};

export const DIMENSION_LABELS: Record<AuditDimensionKey, string> = {
  parsing: 'ATS Parsing Readiness',
  quantification: 'Quantified Impact',
  repetition: 'Repetition & Wording Quality',
  spelling: 'Spelling & Grammar Checks',
  consistency: 'Bullet Consistency & Flow',
  sections: 'Essential Resume Sections',
  essentials: 'Core ATS Essentials',
  recruiter: 'Recruiter Review Flags',
  inclusivity: 'Inclusive & Modern Language',
};

// ---------------------------------------------------------------------------
// Dictionaries and taxonomies
// ---------------------------------------------------------------------------

const COMMON_TYPOS: Record<string, string> = {
  teh: 'the',
  manger: 'manager',
  experiance: 'experience',
  seperate: 'separate',
  definately: 'definitely',
  recieved: 'received',
  liason: 'liaison',
  acheived: 'achieved',
  succesful: 'successful',
  enviroment: 'environment',
  responsability: 'responsibility',
  implimented: 'implemented',
  maintainance: 'maintenance',
  calender: 'calendar',
  independant: 'independent',
  occured: 'occurred',
  untill: 'until',
  sucessfully: 'successfully',
  reponsible: 'responsible',
  oppurtunity: 'opportunity',
  profesional: 'professional',
  programing: 'programming',
  excelent: 'excellent',
  colaberate: 'collaborate',
  goverment: 'government',
  architech: 'architect',
  databasees: 'databases',
  coordianted: 'coordinated',
  deployement: 'deployment',
  integretion: 'integration',
  performence: 'performance',
  optmized: 'optimized',
  comunication: 'communication',
  reccomend: 'recommend',
  analitics: 'analytics',
  managment: 'management',
  requirment: 'requirement',
  troubleshoting: 'troubleshooting',
};

const CLICHE_PHRASES: Array<{ pattern: RegExp; term: string; suggestion: string }> = [
  { pattern: /\bteam\s+player\b/i, term: 'team player', suggestion: 'Describe concrete cross-functional collaboration (e.g. "Partnered with 4 engineers and product designers").' },
  { pattern: /\bhard[\s-]working\b/i, term: 'hard-working', suggestion: 'Demonstrate stamina through specific output, volume, or delivered deadlines.' },
  { pattern: /\bgo[\s-]getter\b/i, term: 'go-getter', suggestion: 'Use an active verb: "Initiated", "Spearheaded", or "Proactively built".' },
  { pattern: /\bthink(?:ing)?\s+outside\s+the\s+box\b/i, term: 'think outside the box', suggestion: 'Specify the novel solution, architecture, or creative approach you devised.' },
  { pattern: /\bresults[\s-]driven\b/i, term: 'results-driven', suggestion: 'State the actual business results (metrics, performance gains, revenue) rather than the label.' },
  { pattern: /\bself[\s-]starter\b/i, term: 'self-starter', suggestion: 'Highlight an independent project, architecture, or process you introduced autonomously.' },
  { pattern: /\bsynergy\b/i, term: 'synergy', suggestion: 'Specify the concrete operational efficiency, integration, or collaborative outcome.' },
  { pattern: /\bdetail[\s-]oriented\b/i, term: 'detail-oriented', suggestion: 'Highlight accuracy, test coverage, uptime, or error reductions achieved.' },
  { pattern: /\bseasoned\s+(?:professional|engineer|developer|leader)\b/i, term: 'seasoned professional', suggestion: 'State your specific domain and quantifiable track record (e.g. "Senior backend engineer with 6+ years building distributed APIs").' },
  { pattern: /\bproven\s+track\s+record\b/i, term: 'proven track record', suggestion: 'State the proven outcomes directly rather than asserting you have them.' },
  { pattern: /\bhit\s+the\s+ground\s+running\b/i, term: 'hit the ground running', suggestion: 'Mention rapid onboarding, immediate feature deliveries, or first-quarter impact.' },
  { pattern: /\bwear\s+(?:many|multiple)\s+hats\b/i, term: 'wear many hats', suggestion: 'Enumerate the cross-disciplinary responsibilities (e.g. "handled backend development, DevOps, and customer support").' },
];

const INCLUSIVE_LANGUAGE_RULES: Array<{
  pattern: RegExp;
  category: 'gender' | 'age' | 'ability' | 'jargon';
  phrase: string;
  replacement: string;
  explanation: string;
}> = [
  {
    pattern: /\bman[\s-]hours\b/i,
    category: 'gender',
    phrase: 'man-hours',
    replacement: 'staff hours / work hours / engineering hours',
    explanation: 'Modern professional standards prefer gender-neutral terms for labor capacity.',
  },
  {
    pattern: /\bmanpower\b/i,
    category: 'gender',
    phrase: 'manpower',
    replacement: 'workforce / team capacity / personnel',
    explanation: 'Use inclusive terminology for team capacity and staffing.',
  },
  {
    pattern: /\bchair(?:man|woman)\b/i,
    category: 'gender',
    phrase: 'chairman/chairwoman',
    replacement: 'chair / committee lead / chairperson',
    explanation: 'Neutral governance titles align with global corporate conventions.',
  },
  {
    pattern: /\bpoliceman\b/i,
    category: 'gender',
    phrase: 'policeman',
    replacement: 'police officer / law enforcement officer',
    explanation: 'Standard professional title is gender-neutral.',
  },
  {
    pattern: /\bwaitress\b/i,
    category: 'gender',
    phrase: 'waitress',
    replacement: 'server / hospitality specialist',
    explanation: 'Standard industry convention is gender-neutral server.',
  },
  {
    pattern: /\b(?:code|coding|software|tech)\s+ninja\b/i,
    category: 'jargon',
    phrase: 'code/tech ninja',
    replacement: 'software engineer / full-stack developer / domain specialist',
    explanation: 'Informal slang like "ninja" is filtered out by corporate ATS keyword parsers.',
  },
  {
    pattern: /\b(?:rockstar|rock[\s-]star)\b/i,
    category: 'jargon',
    phrase: 'rockstar',
    replacement: 'high-performing specialist / senior engineer',
    explanation: 'Jargon words like "rockstar" reduce ATS parser match confidence.',
  },
  {
    pattern: /\b(?:tech|code)\s+guru\b/i,
    category: 'jargon',
    phrase: 'tech guru',
    replacement: 'technical lead / subject matter expert / specialist',
    explanation: 'Subject matter expert or specialist parses reliably in recruiting databases.',
  },
  {
    pattern: /\bdigital\s+native\b/i,
    category: 'age',
    phrase: 'digital native',
    replacement: 'proficient with modern cloud and web platforms',
    explanation: '"Digital native" can inadvertently suggest age bias. Emphasize actual technical proficiency.',
  },
  {
    pattern: /\byoung\s+and\s+energetic\b/i,
    category: 'age',
    phrase: 'young and energetic',
    replacement: 'driven, collaborative, and dynamic',
    explanation: 'Avoid referencing age; focus on professional vigor and collaborative drive.',
  },
  {
    pattern: /\bcrazy\s+(?:growth|scale|velocity|traffic)\b/i,
    category: 'ability',
    phrase: 'crazy growth/scale',
    replacement: 'exponential growth / rapid scale',
    explanation: 'Use precise business metrics rather than casual colloquial idioms.',
  },
  {
    pattern: /\binsane\s+(?:speed|scale|growth)\b/i,
    category: 'ability',
    phrase: 'insane speed/scale',
    replacement: 'high velocity / substantial scale',
    explanation: 'Replace casual hyperbole with professional descriptors.',
  },
];

const KNOWN_LOWERCASE_WORDS = new Set([
  'ios',
  'npm',
  'ebay',
  'grpc',
  'vllm',
  'graphql',
  'pnpm',
  'yarn',
  'nginx',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAllBulletsWithMeta(resume: ResumeData): Array<{ text: string; location: string; id: string }> {
  const items: Array<{ text: string; location: string; id: string }> = [];
  (resume.experience || []).forEach((e, eIdx) => {
    (e.bullets || []).forEach((b, bIdx) => {
      const clean = (b || '').trim();
      if (clean) {
        items.push({
          text: clean,
          location: `Experience: ${e.company || e.title || `Position #${eIdx + 1}`} (Bullet #${bIdx + 1})`,
          id: `exp_${e.id || eIdx}_${bIdx}`,
        });
      }
    });
  });
  (resume.projects || []).forEach((p, pIdx) => {
    (p.bullets || []).forEach((b, bIdx) => {
      const clean = (b || '').trim();
      if (clean) {
        items.push({
          text: clean,
          location: `Project: ${p.name || `Project #${pIdx + 1}`} (Bullet #${bIdx + 1})`,
          id: `proj_${p.id || pIdx}_${bIdx}`,
        });
      }
    });
  });
  (resume.customSections || []).forEach((c, cIdx) => {
    (c.bullets || []).forEach((b, bIdx) => {
      const clean = (b || '').trim();
      if (clean) {
        items.push({
          text: clean,
          location: `${c.title || `Section #${cIdx + 1}`} (Bullet #${bIdx + 1})`,
          id: `custom_${c.id || cIdx}_${bIdx}`,
        });
      }
    });
  });
  return items;
}

function startsWithActionVerb(bullet: string): { ok: boolean; verb?: string } {
  const first = bullet.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || '';
  if (!first) return { ok: false };
  const matched = ALL_POWER_VERBS.find((v) => v.toLowerCase() === first);
  return { ok: Boolean(matched), verb: matched };
}

function parseYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/\b(19\d\d|20\d\d)\b/);
  return match ? parseInt(match[1], 10) : null;
}

export function estimatePages(resume: ResumeData): number {
  try {
    let chars = (resume.personal?.fullName || '').length;
    chars += (resume.summary || '').length;
    (resume.experience || []).forEach((e) => {
      chars += (e.company || '').length + (e.title || '').length;
      (e.bullets || []).forEach((b) => {
        chars += (b || '').length;
      });
    });
    (resume.education || []).forEach((ed) => {
      chars += (ed.institution || '').length + (ed.degree || '').length;
    });
    (resume.projects || []).forEach((p) => {
      chars += (p.name || '').length + (p.description || '').length;
      (p.bullets || []).forEach((b) => {
        chars += (b || '').length;
      });
    });
    chars += (resume.skills?.technical || []).join(', ').length;
    chars += (resume.skills?.soft || []).join(', ').length;
    return Math.max(1, Math.round((chars / 3500) * 10) / 10);
  } catch {
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Dimension 1: ATS Parsing Readiness
// ---------------------------------------------------------------------------
function auditParsingReadiness(resume: ResumeData, ctx?: AuditContext): DimensionAuditResult {
  const findings: AuditFinding[] = [];
  let score = 100;

  // 1. Contact field readability
  const p = resume.personal || {};
  const missingContact: string[] = [];
  if (!p.fullName?.trim()) missingContact.push('Full Name');
  if (!p.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) missingContact.push('Email Address');
  if (!p.phone?.trim()) missingContact.push('Phone Number');
  if (!p.location?.trim()) missingContact.push('Location (City, Country)');

  if (missingContact.length > 0) {
    score -= missingContact.length * 10;
    findings.push({
      id: 'parse-contact-missing',
      dimension: 'parsing',
      severity: missingContact.includes('Full Name') || missingContact.includes('Email Address') ? 'critical' : 'warning',
      title: 'Incomplete Candidate Contact Fields',
      message: `Key contact fields could not be clearly resolved: ${missingContact.join(', ')}.`,
      recommendation: 'Ensure your full name, email, phone number, and city/country appear in plain text in the document header.',
    });
  } else {
    findings.push({
      id: 'parse-contact-complete',
      dimension: 'parsing',
      severity: 'positive',
      title: 'Full Header & Contact Information Parsed',
      message: 'Name, email, phone number, and location are cleanly formatted and parseable.',
    });
  }

  // 2. Section detection & standard headings
  const visible = new Set(resume.sectionOrder || ALL_SECTIONS);
  const detected = ALL_SECTIONS.filter((s) => visible.has(s));
  if (detected.length < 3) {
    score -= 25;
    findings.push({
      id: 'parse-sections-few',
      dimension: 'parsing',
      severity: 'warning',
      title: 'Few Standard Sections Detected',
      message: `Only ${detected.length} standard sections detected.`,
      recommendation: 'Use conventional headings (e.g. "Work Experience", "Education", "Skills", "Projects") to maximize parser reliability.',
    });
  } else {
    findings.push({
      id: 'parse-sections-clean',
      dimension: 'parsing',
      severity: 'positive',
      title: 'Standard Section Hierarchy Recognized',
      message: `${detected.length} standard resume sections cleanly resolved by the layout parser.`,
    });
  }

  // 3. Text purity (detect encoding corruption or control characters)
  const fullText = JSON.stringify(resume);
  const controlChars = (fullText.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g) || []).length;
  if (controlChars > 0) {
    score -= 20;
    findings.push({
      id: 'parse-encoding-artifacts',
      dimension: 'parsing',
      severity: 'warning',
      title: 'Text Encoding Artifacts Detected',
      message: `${controlChars} non-standard or unrendered unicode characters detected in the resume text.`,
      recommendation: 'Replace fancy symbols, icons, or non-standard bullet characters with standard UTF-8 text.',
    });
  }

  // 4. Parser notes incorporation (if extracted from file ingestion)
  if (ctx?.parserNotes && ctx.parserNotes.length > 0) {
    findings.push({
      id: 'parse-parser-notes',
      dimension: 'parsing',
      severity: 'info',
      title: 'Document Parser Observation',
      message: ctx.parserNotes[0],
      recommendation: 'Review the document layout in the preview to confirm all columns and blocks rendered in natural order.',
    });
  }

  score = Math.max(20, Math.min(100, score));

  return {
    key: 'parsing',
    label: DIMENSION_LABELS.parsing,
    score,
    weight: DIMENSION_WEIGHTS.parsing,
    status: score >= 85 ? 'exceptional' : score >= 70 ? 'good' : score >= 50 ? 'needs_improvement' : 'critical',
    summary:
      score >= 80
        ? 'High ATS Parse Readiness — Document sections and contact fields resolve cleanly into structured candidate data.'
        : 'Moderate ATS Parse Readiness — Some contact fields or section headings require standardization.',
    findings,
    metrics: {
      standardSectionsDetected: detected.length,
      contactFieldsResolved: 4 - missingContact.length,
      textEncodingPure: controlChars === 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Dimension 2: Quantified Impact
// ---------------------------------------------------------------------------
function auditQuantifiedImpact(resume: ResumeData): DimensionAuditResult {
  const findings: AuditFinding[] = [];
  const bullets = getAllBulletsWithMeta(resume);
  const total = bullets.length;

  if (total === 0) {
    return {
      key: 'quantification',
      label: DIMENSION_LABELS.quantification,
      score: 30,
      weight: DIMENSION_WEIGHTS.quantification,
      status: 'needs_improvement',
      summary: 'No achievement bullets found to evaluate for measurable outcomes.',
      findings: [
        {
          id: 'quant-none',
          dimension: 'quantification',
          severity: 'warning',
          title: 'No Work Experience Bullets',
          message: 'Resume contains no bullet points in experience or project sections.',
          recommendation: 'Add achievement-oriented bullets highlighting real outcomes you delivered.',
        },
      ],
      metrics: { totalBullets: 0, quantifiedBullets: 0, ratio: 0 },
    };
  }

  const quantified = bullets.filter((b) => containsMetric(b.text));
  const ratio = quantified.length / total;

  // Graduated scoring for realistic candidate evaluation
  let score: number;
  if (ratio >= 0.45) score = 100;
  else if (ratio >= 0.35) score = 88;
  else if (ratio >= 0.25) score = 75;
  else if (ratio >= 0.15) score = 60;
  else if (ratio > 0) score = 45;
  else score = 25;

  if (ratio >= 0.35) {
    findings.push({
      id: 'quant-strong-ratio',
      dimension: 'quantification',
      severity: 'positive',
      title: 'Strong Measurable Impact Track Record',
      message: `${Math.round(ratio * 100)}% of bullets (${quantified.length}/${total}) contain verifiable numbers, percentages, scale, or metrics.`,
    });
  } else {
    findings.push({
      id: 'quant-low-ratio',
      dimension: 'quantification',
      severity: ratio < 0.2 ? 'critical' : 'warning',
      title: 'Opportunities to Quantify Results',
      message: `Only ${Math.round(ratio * 100)}% of bullets (${quantified.length}/${total}) feature quantified metrics. Competitive candidates average 35–50%.`,
      recommendation: 'Use the Google XYZ Formula: "Accomplished [X], as measured by [Y], by doing [Z]". Never invent numbers — add genuine volumes, team sizes, latencies, or time savings you can evidence.',
    });
  }

  // Provide concrete examples of quantified bullets
  quantified.slice(0, 3).forEach((b, i) => {
    findings.push({
      id: `quant-sample-${i}`,
      dimension: 'quantification',
      severity: 'positive',
      title: 'Well-Quantified Achievement',
      message: 'Demonstrates tangible impact with measurable outcome.',
      evidence: b.text,
      location: b.location,
    });
  });

  // Provide up to 2 specific unquantified bullets with actionable suggestions
  const unquantified = bullets.filter((b) => !containsMetric(b.text));
  unquantified.slice(0, 2).forEach((b, i) => {
    findings.push({
      id: `quant-opp-${i}`,
      dimension: 'quantification',
      severity: 'info',
      title: 'Bullet Metrics Opportunity',
      message: 'This bullet describes an activity without indicating volume, performance gain, or outcome.',
      evidence: b.text,
      location: b.location,
      suggestion: 'Can you specify: How many users/requests? By what percentage did latency/errors drop? How large was the team or budget?',
    });
  });

  return {
    key: 'quantification',
    label: DIMENSION_LABELS.quantification,
    score,
    weight: DIMENSION_WEIGHTS.quantification,
    status: score >= 85 ? 'exceptional' : score >= 70 ? 'good' : score >= 50 ? 'needs_improvement' : 'critical',
    summary:
      ratio >= 0.35
        ? `Exceptional outcome-driven framing with ${Math.round(ratio * 100)}% quantified bullets.`
        : `Moderate quantification (${Math.round(ratio * 100)}% of bullets). Adding verifiable scale or percentages significantly elevates recruiter interest.`,
    findings,
    metrics: {
      totalBullets: total,
      quantifiedBullets: quantified.length,
      percentage: Math.round(ratio * 100),
    },
  };
}

// ---------------------------------------------------------------------------
// Dimension 3: Repetition & Wording Quality
// ---------------------------------------------------------------------------
function auditRepetitionAndWording(resume: ResumeData): DimensionAuditResult {
  const findings: AuditFinding[] = [];
  const bullets = getAllBulletsWithMeta(resume);
  let score = 100;

  // 1. Repeated opening verbs
  const openerCounts = new Map<string, Array<{ text: string; location: string }>>();
  bullets.forEach((b) => {
    const firstWord = b.text.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || '';
    if (firstWord.length >= 3) {
      const list = openerCounts.get(firstWord) || [];
      list.push(b);
      openerCounts.set(firstWord, list);
    }
  });

  const repeatedOpeners = [...openerCounts.entries()].filter(([_, list]) => list.length >= 3);
  if (repeatedOpeners.length > 0) {
    score -= repeatedOpeners.length * 10;
    repeatedOpeners.forEach(([verb, list]) => {
      const capitalized = verb.charAt(0).toUpperCase() + verb.slice(1);
      findings.push({
        id: `rep-opener-${verb}`,
        dimension: 'repetition',
        severity: list.length >= 4 ? 'warning' : 'info',
        title: `Repeated Action Verb ("${capitalized}")`,
        message: `The verb "${capitalized}" starts ${list.length} different bullets.`,
        recommendation: `Diversify your verbs to showcase broader capability (e.g. Engineered, Spearheaded, Architected, Streamlined, Orchestrated).`,
        evidence: list.slice(0, 3).map((b) => `• "${b.text.slice(0, 60)}…"`).join('\n'),
      });
    });
  } else if (bullets.length >= 4) {
    findings.push({
      id: 'rep-openers-diverse',
      dimension: 'repetition',
      severity: 'positive',
      title: 'Dynamic Action Verb Variety',
      message: 'Bullets feature a varied vocabulary with no excessive repetition of opening action verbs.',
    });
  }

  // 2. Duplicate or near-duplicate statements
  const bulletTexts = bullets.map((b) => b.text.trim().toLowerCase());
  const duplicates: string[] = [];
  bulletTexts.forEach((text, i) => {
    if (bulletTexts.indexOf(text) !== i && !duplicates.includes(text)) {
      duplicates.push(text);
    }
  });

  if (duplicates.length > 0) {
    score -= duplicates.length * 15;
    findings.push({
      id: 'rep-duplicates-found',
      dimension: 'repetition',
      severity: 'critical',
      title: 'Duplicated Bullet Points',
      message: `${duplicates.length} duplicate bullet point(s) detected. Parsers and reviewers often treat duplicate statements as keyword stuffing.`,
      recommendation: 'Ensure every bullet point highlights a unique responsibility or achievement.',
      evidence: duplicates[0],
    });
  }

  // 3. Clichés and overused buzzwords
  let clicheCount = 0;
  const fullText = bullets.map((b) => b.text).join('\n') + '\n' + (resume.summary || '');
  CLICHE_PHRASES.forEach((c) => {
    if (c.pattern.test(fullText)) {
      clicheCount++;
      findings.push({
        id: `rep-cliche-${c.term.replace(/\s+/g, '-')}`,
        dimension: 'repetition',
        severity: 'info',
        title: `Generic Buzzword Detected ("${c.term}")`,
        message: `The phrase "${c.term}" is commonly seen as filler by recruiters.`,
        recommendation: c.suggestion,
      });
    }
  });

  if (clicheCount > 0) {
    score -= Math.min(25, clicheCount * 5);
  } else {
    findings.push({
      id: 'rep-cliche-clean',
      dimension: 'repetition',
      severity: 'positive',
      title: 'Substantive Vocabulary Free of Clichés',
      message: 'No generic fluff phrases or overused resume buzzwords detected.',
    });
  }

  score = Math.max(30, Math.min(100, score));

  return {
    key: 'repetition',
    label: DIMENSION_LABELS.repetition,
    score,
    weight: DIMENSION_WEIGHTS.repetition,
    status: score >= 85 ? 'exceptional' : score >= 70 ? 'good' : score >= 50 ? 'needs_improvement' : 'critical',
    summary:
      score >= 80
        ? 'Crisp, diverse phrasing with excellent vocabulary variety.'
        : 'Opportunities to reduce repetition and replace generic phrases with substantive action.',
    findings,
    metrics: {
      repeatedOpenerCount: repeatedOpeners.length,
      duplicateBulletsCount: duplicates.length,
      buzzwordHits: clicheCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Dimension 4: Spelling and Grammar Checks
// ---------------------------------------------------------------------------
function auditSpellingAndGrammar(resume: ResumeData): DimensionAuditResult {
  const findings: AuditFinding[] = [];
  const bullets = getAllBulletsWithMeta(resume);
  const textBlocks: Array<{ text: string; location: string; id: string }> = [
    ...(resume.summary ? [{ text: resume.summary, location: 'Professional Summary', id: 'summary' }] : []),
    ...bullets,
  ];
  let score = 100;
  let typosFound = 0;

  // 1. Common resume typos
  textBlocks.forEach((b) => {
    const words = b.text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    words.forEach((w) => {
      if (COMMON_TYPOS[w] && typosFound < 6) {
        typosFound++;
        score -= 10;
        findings.push({
          id: `spell-typo-${w}`,
          dimension: 'spelling',
          severity: 'warning',
          title: `Potential Spelling Error ("${w}")`,
          message: `The word "${w}" appears to be a typo for "${COMMON_TYPOS[w]}".`,
          evidence: b.text,
          location: b.location,
          suggestion: `Replace "${w}" with "${COMMON_TYPOS[w]}"`,
          recommendation: 'Review spelling carefully — automated parsers index words strictly.',
        });
      }
    });
  });

  // 2. Repeated consecutive words ("the the", "in in")
  const dupWordRegex = /\b([a-zA-Z]{2,})\s+\1\b/i;
  textBlocks.forEach((b) => {
    const match = b.text.match(dupWordRegex);
    if (match) {
      score -= 10;
      findings.push({
        id: `spell-dup-word-${match[1].toLowerCase()}`,
        dimension: 'spelling',
        severity: 'warning',
        title: `Repeated Consecutive Word ("${match[0]}")`,
        message: `Accidental duplicate word sequence detected: "${match[0]}".`,
        evidence: b.text,
        location: b.location,
        recommendation: `Remove the duplicate word "${match[1]}".`,
      });
    }
  });

  // 3. Unmatched parentheses or brackets
  bullets.forEach((b) => {
    const openParen = (b.text.match(/\(/g) || []).length;
    const closeParen = (b.text.match(/\)/g) || []).length;
    const openBracket = (b.text.match(/\[/g) || []).length;
    const closeBracket = (b.text.match(/\]/g) || []).length;

    if (openParen !== closeParen || openBracket !== closeBracket) {
      score -= 5;
      findings.push({
        id: `spell-unmatched-paren-${b.id}`,
        dimension: 'spelling',
        severity: 'info',
        title: 'Mismatched Parentheses / Brackets',
        message: 'Bullet has unbalanced opening and closing brackets or parentheses.',
        evidence: b.text,
        location: b.location,
        recommendation: 'Ensure all opening brackets "(" or "[" have matching closing counterparts.',
      });
    }
  });

  // 4. Initial capitalization check
  bullets.forEach((b) => {
    const firstWord = b.text.trim().split(/\s+/)[0] || '';
    const cleanWord = firstWord.replace(/[^a-zA-Z]/g, '');
    if (cleanWord && /^[a-z]/.test(cleanWord) && !KNOWN_LOWERCASE_WORDS.has(cleanWord.toLowerCase())) {
      score -= 4;
      findings.push({
        id: `spell-lowercase-start-${b.id}`,
        dimension: 'spelling',
        severity: 'info',
        title: 'Uncapitalized Bullet Opener',
        message: `Bullet begins with lowercase letter: "${cleanWord}".`,
        evidence: b.text,
        location: b.location,
        recommendation: 'Start bullet statements with an uppercase action verb.',
      });
    }
  });

  if (findings.length === 0) {
    findings.push({
      id: 'spell-clean-pass',
      dimension: 'spelling',
      severity: 'positive',
      title: 'Clean Spelling & Punctuation Hygiene',
      message: 'No common typographical errors, duplicate words, or unmatched punctuation detected.',
    });
  }

  score = Math.max(30, Math.min(100, score));

  return {
    key: 'spelling',
    label: DIMENSION_LABELS.spelling,
    score,
    weight: DIMENSION_WEIGHTS.spelling,
    status: score >= 85 ? 'exceptional' : score >= 70 ? 'good' : score >= 50 ? 'needs_improvement' : 'critical',
    summary:
      score >= 85
        ? 'Flawless typographical hygiene across all sections.'
        : 'Minor spelling, capitalization, or punctuation flags detected for review.',
    findings,
    metrics: {
      potentialTypos: typosFound,
      totalBulletsChecked: bullets.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Dimension 5: Bullet Consistency & Flow
// ---------------------------------------------------------------------------
function auditBulletConsistency(resume: ResumeData): DimensionAuditResult {
  const findings: AuditFinding[] = [];
  const bullets = getAllBulletsWithMeta(resume);
  let score = 100;

  if (bullets.length === 0) {
    return {
      key: 'consistency',
      label: DIMENSION_LABELS.consistency,
      score: 40,
      weight: DIMENSION_WEIGHTS.consistency,
      status: 'needs_improvement',
      summary: 'No bullet points available to assess consistency.',
      findings: [],
    };
  }

  // 1. Length distribution
  const lengths = bullets.map((b) => wordCount(b.text));
  const tooShort = bullets.filter((b) => wordCount(b.text) < 6);
  const tooLong = bullets.filter((b) => wordCount(b.text) > 38);
  const avgWords = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);

  if (tooShort.length > 0) {
    score -= tooShort.length * 6;
    findings.push({
      id: 'cons-too-short',
      dimension: 'consistency',
      severity: 'info',
      title: `${tooShort.length} Abbreviated Bullet(s) (< 6 words)`,
      message: 'Very short bullets often lack context and measurable evidence.',
      evidence: tooShort[0].text,
      location: tooShort[0].location,
      recommendation: 'Expand with the tools used, the problem solved, and the quantifiable outcome.',
    });
  }

  if (tooLong.length > 0) {
    score -= tooLong.length * 8;
    findings.push({
      id: 'cons-too-long',
      dimension: 'consistency',
      severity: 'warning',
      title: `${tooLong.length} Dense Paragraph Bullet(s) (> 38 words)`,
      message: 'Long run-on bullets are frequently skipped by recruiters during 6-second initial scans.',
      evidence: tooLong[0].text.slice(0, 120) + '…',
      location: tooLong[0].location,
      recommendation: 'Break dense multi-sentence paragraphs into two punchy, single-sentence accomplishment bullets.',
    });
  }

  if (tooShort.length === 0 && tooLong.length === 0) {
    findings.push({
      id: 'cons-length-ideal',
      dimension: 'consistency',
      severity: 'positive',
      title: 'Ideal Scannable Bullet Lengths',
      message: `Average bullet length is ${avgWords} words — optimal for both fast recruiter scanning and ATS tokenization.`,
    });
  }

  // 2. Ending punctuation consistency
  const endingWithPeriod = bullets.filter((b) => /\.$/.test(b.text.trim())).length;
  const periodRatio = endingWithPeriod / bullets.length;

  if (periodRatio > 0.15 && periodRatio < 0.85) {
    score -= 10;
    findings.push({
      id: 'cons-punctuation-mixed',
      dimension: 'consistency',
      severity: 'warning',
      title: 'Mixed Ending Punctuation',
      message: `${endingWithPeriod} of ${bullets.length} bullets end with a full stop, while ${bullets.length - endingWithPeriod} do not.`,
      recommendation: 'Choose one consistent style across your entire resume: either end all bullets with a period, or end all without.',
    });
  } else {
    findings.push({
      id: 'cons-punctuation-consistent',
      dimension: 'consistency',
      severity: 'positive',
      title: 'Uniform Punctuation Styling',
      message: periodRatio >= 0.85 ? 'Bullets consistently use terminal periods.' : 'Bullets consistently omit terminal periods.',
    });
  }

  // 3. Action verb starts
  const verbStarts = bullets.filter((b) => startsWithActionVerb(b.text).ok);
  const verbRatio = verbStarts.length / bullets.length;

  if (verbRatio >= 0.75) {
    findings.push({
      id: 'cons-verbs-strong',
      dimension: 'consistency',
      severity: 'positive',
      title: 'Consistent Action-Verb Openings',
      message: `${Math.round(verbRatio * 100)}% of bullets begin with strong action verbs.`,
    });
  } else {
    score -= 15;
    const weakOpeners = bullets.filter((b) => WEAK_OPENERS.some((w) => w.pattern.test(b.text.trim())));
    findings.push({
      id: 'cons-verbs-weak',
      dimension: 'consistency',
      severity: 'warning',
      title: 'Inconsistent Action-Oriented Phrasing',
      message: `Only ${Math.round(verbRatio * 100)}% of bullets start with a strong action verb.`,
      evidence: weakOpeners[0]?.text || bullets[0]?.text,
      recommendation: 'Start each bullet with past-tense power verbs (e.g. Architected, Developed, Spearheaded, Implemented). Avoid starting with "Responsible for" or nouns.',
    });
  }

  score = Math.max(30, Math.min(100, score));

  return {
    key: 'consistency',
    label: DIMENSION_LABELS.consistency,
    score,
    weight: DIMENSION_WEIGHTS.consistency,
    status: score >= 85 ? 'exceptional' : score >= 70 ? 'good' : score >= 50 ? 'needs_improvement' : 'critical',
    summary:
      score >= 80
        ? 'Well-calibrated bullet density, consistent punctuation, and strong active framing.'
        : 'Varied bullet lengths or mixed punctuation styles could be tightened for scannability.',
    findings,
    metrics: {
      averageWordsPerBullet: avgWords,
      actionVerbPercentage: Math.round(verbRatio * 100),
      punctuationConsistent: periodRatio <= 0.15 || periodRatio >= 0.85,
    },
  };
}

// ---------------------------------------------------------------------------
// Dimension 6: Essential Resume Sections
// ---------------------------------------------------------------------------
function auditEssentialSections(resume: ResumeData): DimensionAuditResult {
  const findings: AuditFinding[] = [];
  let score = 100;

  const hasSummary = Boolean(resume.summary?.trim());
  const hasExperience = (resume.experience || []).length > 0;
  const hasEducation = (resume.education || []).length > 0;
  const hasSkills = ((resume.skills?.technical || []).length + (resume.skills?.soft || []).length) > 0;
  const hasProjects = (resume.projects || []).length > 0;
  const hasCertifications = (resume.certifications || []).length > 0;

  // Context-aware adaptation:
  // If an applicant is a student or career changer with limited formal experience (<=1 role)
  // but has 2+ solid projects and education, do NOT penalize them harshly!
  const isEarlyCareerOrChanger = (resume.experience || []).length <= 1 && (hasProjects || hasEducation);

  if (hasSummary) {
    const words = wordCount(resume.summary);
    if (words >= 25 && words <= 120) {
      findings.push({
        id: 'sec-summary-good',
        dimension: 'sections',
        severity: 'positive',
        title: 'Targeted Professional Summary Present',
        message: `Summary is concise and well-framed (${words} words).`,
      });
    } else {
      score -= 5;
      findings.push({
        id: 'sec-summary-length',
        dimension: 'sections',
        severity: 'info',
        title: words < 25 ? 'Brief Summary Statement' : 'Lengthy Summary Statement',
        message: `Summary contains ${words} words. Ideal length is 30–80 words.`,
        recommendation: 'Focus on your core specialty, years of experience, key technical domain, and major delivered impact.',
      });
    }
  } else {
    score -= 10;
    findings.push({
      id: 'sec-summary-missing',
      dimension: 'sections',
      severity: 'warning',
      title: 'No Professional Summary',
      message: 'A concise 3–4 line summary immediately signals your target role and senior strengths to recruiters.',
      recommendation: 'Add a professional summary tailored to your target job title.',
    });
  }

  if (hasExperience) {
    findings.push({
      id: 'sec-exp-present',
      dimension: 'sections',
      severity: 'positive',
      title: 'Work Experience Section Documented',
      message: `${resume.experience.length} career position(s) documented with dates and roles.`,
    });
  } else if (isEarlyCareerOrChanger) {
    score -= 10; // Gentle deduction rather than failing the candidate
    findings.push({
      id: 'sec-exp-early-career',
      dimension: 'sections',
      severity: 'info',
      title: 'Project & Academic Focus (Early Career / Transition)',
      message: 'No formal corporate roles listed; project portfolio and academic qualifications carry primary evidence.',
      recommendation: 'Consider adding freelance work, internships, or open-source leadership to your experience section.',
    });
  } else {
    score -= 25;
    findings.push({
      id: 'sec-exp-missing',
      dimension: 'sections',
      severity: 'critical',
      title: 'Missing Work Experience Section',
      message: 'No professional experience entries detected.',
      recommendation: 'Add your employment history with company, job title, start/end dates, and achievements.',
    });
  }

  if (hasEducation) {
    findings.push({
      id: 'sec-edu-present',
      dimension: 'sections',
      severity: 'positive',
      title: 'Education Section Present',
      message: `${resume.education.length} degree(s) or academic program(s) listed.`,
    });
  } else if (!hasCertifications) {
    score -= 15;
    findings.push({
      id: 'sec-edu-missing',
      dimension: 'sections',
      severity: 'warning',
      title: 'No Education or Certification Section',
      message: 'Neither formal education nor industry certifications are listed.',
      recommendation: 'Add your degrees, bootcamps, or industry certifications (e.g. AWS, PMP).',
    });
  }

  if (hasSkills) {
    findings.push({
      id: 'sec-skills-present',
      dimension: 'sections',
      severity: 'positive',
      title: 'Skills Section Active',
      message: `${(resume.skills?.technical || []).length} technical and ${(resume.skills?.soft || []).length} soft skills categorized.`,
    });
  } else {
    score -= 20;
    findings.push({
      id: 'sec-skills-missing',
      dimension: 'sections',
      severity: 'critical',
      title: 'Missing Skills Section',
      message: 'A dedicated Skills section is essential for automated keyword matching.',
      recommendation: 'Add a categorized Skills section with technical tools, languages, and frameworks.',
    });
  }

  if (hasProjects || hasCertifications) {
    findings.push({
      id: 'sec-supporting-present',
      dimension: 'sections',
      severity: 'positive',
      title: 'Supporting Credentials Included',
      message: 'Includes valuable secondary evidence (Projects / Certifications) to reinforce domain authority.',
    });
  }

  score = Math.max(30, Math.min(100, score));

  return {
    key: 'sections',
    label: DIMENSION_LABELS.sections,
    score,
    weight: DIMENSION_WEIGHTS.sections,
    status: score >= 85 ? 'exceptional' : score >= 70 ? 'good' : score >= 50 ? 'needs_improvement' : 'critical',
    summary:
      score >= 80
        ? 'Comprehensive section architecture covering all primary recruiter checkpoints.'
        : 'Core section structure has gaps that should be addressed before submitting.',
    findings,
    metrics: {
      hasSummary,
      hasExperience,
      hasEducation,
      hasSkills,
      hasProjects,
      hasCertifications,
    },
  };
}

// ---------------------------------------------------------------------------
// Dimension 7: Core ATS Essentials
// ---------------------------------------------------------------------------
function auditAtsEssentials(resume: ResumeData): DimensionAuditResult {
  const findings: AuditFinding[] = [];
  let score = 100;

  // 1. Dates parseable & standardized
  const dates: string[] = [];
  (resume.experience || []).forEach((e) => {
    if (e.startDate) dates.push(e.startDate);
    if (e.endDate) dates.push(e.endDate);
  });
  (resume.education || []).forEach((ed) => {
    if (ed.startDate) dates.push(ed.startDate);
    if (ed.endDate) dates.push(ed.endDate);
  });

  const parseableDates = dates.filter((d) => /^\d{4}([/-]\d{2})?$|^present$/i.test(d.trim()));
  const dateRatio = dates.length ? parseableDates.length / dates.length : 1;

  if (dateRatio >= 0.85) {
    findings.push({
      id: 'ess-dates-clean',
      dimension: 'essentials',
      severity: 'positive',
      title: 'Parseable Date Format Standardization',
      message: 'Dates adhere to standard MM/YYYY or YYYY formats easily parsed by automated screening systems.',
    });
  } else {
    score -= 15;
    findings.push({
      id: 'ess-dates-inconsistent',
      dimension: 'essentials',
      severity: 'warning',
      title: 'Inconsistent Date Formatting',
      message: `${dates.length - parseableDates.length} date entries use non-standard syntax.`,
      recommendation: 'Use clean standard date formats such as "MM/YYYY" or "YYYY", and "Present" for ongoing roles.',
    });
  }

  // 2. Titles and Companies present on every experience
  const missingCompanyOrTitle = (resume.experience || []).filter((e) => !e.company?.trim() || !e.title?.trim());
  if (missingCompanyOrTitle.length > 0) {
    score -= 20;
    findings.push({
      id: 'ess-missing-role-metadata',
      dimension: 'essentials',
      severity: 'critical',
      title: 'Missing Employer or Job Title',
      message: `${missingCompanyOrTitle.length} role(s) are missing employer name or job title.`,
      recommendation: 'ATS parsers strictly require both company name and job title for tenure attribution.',
    });
  }

  // 3. Technical skills taxonomy alignment
  const techSkills = (resume.skills?.technical || []).filter((s) => s.trim());
  if (techSkills.length >= 6 && techSkills.length <= 35) {
    findings.push({
      id: 'ess-tech-skills-balanced',
      dimension: 'essentials',
      severity: 'positive',
      title: 'Balanced Technical Keyword Count',
      message: `${techSkills.length} technical skills listed — strong density without keyword stuffing.`,
    });
  } else if (techSkills.length < 6) {
    score -= 15;
    findings.push({
      id: 'ess-tech-skills-sparse',
      dimension: 'essentials',
      severity: 'warning',
      title: 'Sparse Technical Keyword Footprint',
      message: `Only ${techSkills.length} technical skill(s) listed.`,
      recommendation: 'Include the programming languages, platforms, databases, and frameworks you know.',
    });
  }

  // 4. Document Length
  const estPages = estimatePages(resume);
  if (estPages <= 2.2) {
    findings.push({
      id: 'ess-pages-appropriate',
      dimension: 'essentials',
      severity: 'positive',
      title: 'Appropriate Document Page Budget',
      message: `Estimated length is ~${estPages} page(s) — within optimal ATS and reviewer range.`,
    });
  } else {
    score -= 10;
    findings.push({
      id: 'ess-pages-long',
      dimension: 'essentials',
      severity: 'info',
      title: 'Multi-Page Resume Length',
      message: `Estimated length is ~${estPages} pages. Most corporate screening prioritizes 1–2 pages.`,
      recommendation: 'Condense older positions (over 7–10 years old) into brief summaries.',
    });
  }

  score = Math.max(30, Math.min(100, score));

  return {
    key: 'essentials',
    label: DIMENSION_LABELS.essentials,
    score,
    weight: DIMENSION_WEIGHTS.essentials,
    status: score >= 85 ? 'exceptional' : score >= 70 ? 'good' : score >= 50 ? 'needs_improvement' : 'critical',
    summary:
      score >= 80
        ? 'Standard ATS data fields, parseable date conventions, and well-distributed technical skills.'
        : 'Essential ATS fields need attention before applying to enterprise portals.',
    findings,
    metrics: {
      dateStandardizationRatio: Math.round(dateRatio * 100),
      estimatedPages: estPages,
      technicalSkillCount: techSkills.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Dimension 8: Recruiter Review Flags
// ---------------------------------------------------------------------------
function auditRecruiterFlags(resume: ResumeData): DimensionAuditResult {
  const findings: AuditFinding[] = [];
  let score = 100;

  // 1. Inverted date order check (end date before start date)
  (resume.experience || []).forEach((e, idx) => {
    const startY = parseYear(e.startDate);
    const endY = parseYear(e.endDate);
    if (startY && endY && endY < startY && !e.current) {
      score -= 15;
      findings.push({
        id: `rec-inverted-dates-${idx}`,
        dimension: 'recruiter',
        severity: 'critical',
        title: 'Inverted Employment Dates',
        message: `End date (${e.endDate}) is earlier than start date (${e.startDate}) for ${e.company || e.title}.`,
        recommendation: 'Correct the chronology on this position.',
        location: `Position: ${e.company || e.title}`,
      });
    }
  });

  // 2. Generic uninformative job titles
  const GENERIC_TITLES = ['worker', 'employee', 'staff', 'contractor', 'consultant', 'associate', 'intern'];
  (resume.experience || []).forEach((e) => {
    const lower = (e.title || '').trim().toLowerCase();
    if (GENERIC_TITLES.includes(lower)) {
      score -= 8;
      findings.push({
        id: `rec-generic-title-${e.id}`,
        dimension: 'recruiter',
        severity: 'warning',
        title: `Generic Job Title ("${e.title}")`,
        message: `The title "${e.title}" lacks functional context.`,
        recommendation: `Qualify the role with your functional domain (e.g. "Software Engineering Consultant" or "Financial Analyst").`,
        location: `Position: ${e.company}`,
      });
    }
  });

  // 3. Superlatives without proof
  const UNSUPPORTED_SUPERLATIVES = ['best in company', 'world-renowned', 'top performer in country', 'unmatched', 'flawless'];
  const bullets = getAllBulletsWithMeta(resume);
  bullets.forEach((b) => {
    UNSUPPORTED_SUPERLATIVES.forEach((term) => {
      if (b.text.toLowerCase().includes(term)) {
        score -= 5;
        findings.push({
          id: `rec-superlative-${term.replace(/\s+/g, '-')}`,
          dimension: 'recruiter',
          severity: 'info',
          title: `Unsubstantiated Superlative ("${term}")`,
          message: `Superlative claims like "${term}" can trigger skepticism unless supported by official awards or verifiable rank metrics.`,
          evidence: b.text,
          location: b.location,
          recommendation: 'Replace subjective superlatives with concrete deliverables or official recognition titles.',
        });
      }
    });
  });

  // Explicit Non-Discriminatory Clean Confirmation:
  // Guarantees and communicates that employment gaps, age, graduation dates,
  // gender, nationality, or parental leave are never flagged or penalized.
  findings.push({
    id: 'rec-ethical-non-discriminatory',
    dimension: 'recruiter',
    severity: 'positive',
    title: 'Ethical Screening Policy Verified',
    message: 'Career transitions, employment gaps, graduation dates, and personal backgrounds are never penalized.',
  });

  score = Math.max(40, Math.min(100, score));

  return {
    key: 'recruiter',
    label: DIMENSION_LABELS.recruiter,
    score,
    weight: DIMENSION_WEIGHTS.recruiter,
    status: score >= 85 ? 'exceptional' : score >= 70 ? 'good' : score >= 50 ? 'needs_improvement' : 'critical',
    summary:
      score >= 85
        ? 'High recruiter review readiness with clear chronology and credible claims.'
        : 'A few chronological or title clarity flags should be resolved before recruiter review.',
    findings,
  };
}

// ---------------------------------------------------------------------------
// Dimension 9: Inclusive & Modern Language
// ---------------------------------------------------------------------------
function auditInclusiveLanguage(resume: ResumeData): DimensionAuditResult {
  const findings: AuditFinding[] = [];
  const bullets = getAllBulletsWithMeta(resume);
  const fullText = [
    resume.summary || '',
    ...bullets.map((b) => b.text),
    ...(resume.skills?.technical || []),
    ...(resume.skills?.soft || []),
  ].join('\n');

  let score = 100;
  let flaggedCount = 0;

  INCLUSIVE_LANGUAGE_RULES.forEach((rule) => {
    if (rule.pattern.test(fullText)) {
      flaggedCount++;
      score -= 15;

      const matchedBullet = bullets.find((b) => rule.pattern.test(b.text));

      findings.push({
        id: `inc-rule-${rule.phrase.replace(/[\s/-]+/g, '-')}`,
        dimension: 'inclusivity',
        severity: 'info',
        title: `Inclusive Language Opportunity ("${rule.phrase}")`,
        message: rule.explanation,
        evidence: matchedBullet?.text,
        location: matchedBullet?.location,
        suggestion: `Consider alternative: ${rule.replacement}`,
        recommendation: `Modern hiring teams prioritize inclusive language. Replace "${rule.phrase}" with "${rule.replacement.split('/')[0].trim()}".`,
      });
    }
  });

  if (flaggedCount === 0) {
    findings.push({
      id: 'inc-clean-positive',
      dimension: 'inclusivity',
      severity: 'positive',
      title: 'Modern, Inclusive Language Alignment',
      message: 'Resume uses modern, professional, gender-neutral and bias-free terminology.',
    });
  }

  score = Math.max(40, Math.min(100, score));

  return {
    key: 'inclusivity',
    label: DIMENSION_LABELS.inclusivity,
    score,
    weight: DIMENSION_WEIGHTS.inclusivity,
    status: score >= 85 ? 'exceptional' : score >= 70 ? 'good' : score >= 50 ? 'needs_improvement' : 'critical',
    summary:
      flaggedCount === 0
        ? '100% compliant with modern inclusive hiring language conventions.'
        : `${flaggedCount} opportunity/opportunities to modernize wording with inclusive alternatives.`,
    findings,
    metrics: {
      inclusiveTermsCompliant: flaggedCount === 0,
      flagsCount: flaggedCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Main Advanced ATS Audit Orchestrator
// ---------------------------------------------------------------------------
export function runAdvancedAtsAudit(resume: ResumeData, ctx?: AuditContext): AdvancedAtsAudit {
  const dimParsing = auditParsingReadiness(resume, ctx);
  const dimQuant = auditQuantifiedImpact(resume);
  const dimRep = auditRepetitionAndWording(resume);
  const dimSpell = auditSpellingAndGrammar(resume);
  const dimCons = auditBulletConsistency(resume);
  const dimSec = auditEssentialSections(resume);
  const dimEss = auditAtsEssentials(resume);
  const dimRec = auditRecruiterFlags(resume);
  const dimInc = auditInclusiveLanguage(resume);

  const dimensions: Record<AuditDimensionKey, DimensionAuditResult> = {
    parsing: dimParsing,
    quantification: dimQuant,
    repetition: dimRep,
    spelling: dimSpell,
    consistency: dimCons,
    sections: dimSec,
    essentials: dimEss,
    recruiter: dimRec,
    inclusivity: dimInc,
  };

  // Compute weighted composite audit score
  let weightedSum = 0;
  (Object.keys(DIMENSION_WEIGHTS) as AuditDimensionKey[]).forEach((k) => {
    const dim = dimensions[k];
    weightedSum += (dim.score * dim.weight) / 100;
  });
  const overallScore = Math.max(0, Math.min(100, Math.round(weightedSum)));

  const allFindings: AuditFinding[] = [];
  (Object.values(dimensions) as DimensionAuditResult[]).forEach((d) => {
    allFindings.push(...d.findings);
  });

  const criticalCount = allFindings.filter((f) => f.severity === 'critical').length;
  const warningCount = allFindings.filter((f) => f.severity === 'warning').length;
  const infoCount = allFindings.filter((f) => f.severity === 'info').length;
  const positiveCount = allFindings.filter((f) => f.severity === 'positive').length;

  // Quick Wins: High-impact actionable critical & warning findings with recommendations
  const quickWins = allFindings
    .filter((f) => (f.severity === 'critical' || f.severity === 'warning') && f.recommendation)
    .slice(0, 5);

  // Strengths: Top positive achievements
  const strengths = allFindings.filter((f) => f.severity === 'positive').slice(0, 6);

  // Overall rating taxonomy
  let rating: AdvancedAtsAudit['rating'];
  if (overallScore >= 85) rating = 'exceptional';
  else if (overallScore >= 70) rating = 'competitive';
  else if (overallScore >= 55) rating = 'moderate';
  else rating = 'needs_work';

  // Overall qualitative summary
  let summary: string;
  if (rating === 'exceptional') {
    summary = `Exceptional ATS & Recruiter Readiness (${overallScore}/100). The resume demonstrates high parsing fidelity, strong quantified outcomes, and professional consistency.`;
  } else if (rating === 'competitive') {
    summary = `Competitive Candidate Profile (${overallScore}/100). Meets core screening criteria across most enterprise ATS systems with a few targeted optimization opportunities.`;
  } else if (rating === 'moderate') {
    summary = `Moderate ATS Compatibility (${overallScore}/100). The resume will parse in standard systems, but addressing the highlighted quick wins will significantly improve interview callbacks.`;
  } else {
    summary = `Needs Optimization Before Applying (${overallScore}/100). Critical formatting, keyword, or quantification gaps should be resolved to pass automated screening filters.`;
  }

  const bullets = getAllBulletsWithMeta(resume);
  const quantifiedBullets = bullets.filter((b) => containsMetric(b.text)).length;
  const actionVerbBullets = bullets.filter((b) => startsWithActionVerb(b.text).ok).length;
  const totalWords = bullets.reduce((sum, b) => sum + wordCount(b.text), 0);
  const avgWords = bullets.length ? Math.round(totalWords / bullets.length) : 0;
  // Average human reading speed: ~200 words per minute
  const readingTimeSeconds = Math.max(15, Math.round((totalWords / 200) * 60));

  return {
    overallScore,
    rating,
    summary,
    dimensions,
    allFindings,
    quickWins,
    strengths,
    stats: {
      totalFindings: allFindings.length,
      criticalCount,
      warningCount,
      infoCount,
      positiveCount,
      quantifiedBullets,
      totalBullets: bullets.length,
      quantifiedPercentage: bullets.length ? Math.round((quantifiedBullets / bullets.length) * 100) : 0,
      actionVerbBullets,
      actionVerbPercentage: bullets.length ? Math.round((actionVerbBullets / bullets.length) * 100) : 0,
      avgBulletWordCount: avgWords,
      readingTimeSeconds,
    },
  };
}
