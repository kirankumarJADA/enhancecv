// Real-Time ATS Writing Coach Engine
// Implements deterministic, local writing guidance for resume bullets based on:
// - ResumeSkills bullet-writing principles (MIT license)
// - Google X-Y-Z formula: Accomplished [X] as measured by [Y] by doing [Z]
// - Truth Guard principles: Never fabricate metrics or skills; distinguish missing evidence from lack of skill
// - Purely client-side execution (0 AI latency, 0 external network requests on keystroke)

export type FeedbackSeverity = 'strength' | 'tip' | 'warning';

export type FeedbackType =
  | 'power_verb'
  | 'weak_opener'
  | 'metric_present'
  | 'metric_opportunity'
  | 'repetition'
  | 'length'
  | 'jd_alignment';

export interface BulletFeedback {
  id: string;
  type: FeedbackType;
  severity: FeedbackSeverity;
  label: string;
  message: string;
  candidateQuestion?: string;
  actionableSuggestion?: string;
  suggestedVerbs?: string[];
}

export interface WritingCoachOptions {
  bulletIndex?: number;
  allBullets?: string[];
  targetSkills?: string[];
  missingSkills?: string[];
}

export const POWER_VERB_CATEGORIES: Record<string, string[]> = {
  leadership: [
    'Led',
    'Directed',
    'Managed',
    'Supervised',
    'Coordinated',
    'Spearheaded',
    'Orchestrated',
    'Oversaw',
    'Championed',
    'Mentored',
    'Guided',
    'Chaired',
  ],
  achievement: [
    'Achieved',
    'Delivered',
    'Exceeded',
    'Surpassed',
    'Attained',
    'Secured',
    'Won',
    'Earned',
    'Captured',
    'Generated',
    'Produced',
  ],
  growth: [
    'Grew',
    'Increased',
    'Boosted',
    'Expanded',
    'Scaled',
    'Elevated',
    'Maximized',
    'Accelerated',
    'Doubled',
    'Multiplied',
  ],
  creation: [
    'Created',
    'Developed',
    'Designed',
    'Built',
    'Launched',
    'Pioneered',
    'Established',
    'Founded',
    'Introduced',
    'Implemented',
    'Authored',
    'Initiated',
  ],
  optimization: [
    'Streamlined',
    'Optimized',
    'Optimised',
    'Enhanced',
    'Improved',
    'Transformed',
    'Restructured',
    'Modernized',
    'Modernised',
    'Automated',
    'Simplified',
    'Standardized',
  ],
  analysis: [
    'Analyzed',
    'Analysed',
    'Assessed',
    'Evaluated',
    'Identified',
    'Diagnosed',
    'Researched',
    'Investigated',
    'Audited',
    'Benchmarked',
    'Synthesized',
  ],
  collaboration: [
    'Collaborated',
    'Partnered',
    'Facilitated',
    'Presented',
    'Communicated',
    'Negotiated',
    'Influenced',
    'Co-authored',
    'Aligned',
  ],
  problemSolving: [
    'Resolved',
    'Solved',
    'Troubleshot',
    'Rectified',
    'Debugged',
    'Eliminated',
    'Reduced',
    'Mitigated',
    'Prevented',
    'Corrected',
    'Fixed',
  ],
  engineering: [
    'Engineered',
    'Architected',
    'Programmed',
    'Coded',
    'Migrated',
    'Integrated',
    'Configured',
    'Deployed',
    'Maintained',
    'Refactored',
    'Tested',
    'Documented',
    'Constructed',
  ],
};

export const ALL_POWER_VERBS = Object.values(POWER_VERB_CATEGORIES).flat();
export const POWER_VERB_SET = new Set(ALL_POWER_VERBS.map((v) => v.toLowerCase()));

export interface WeakOpenerDef {
  pattern: RegExp;
  phrase: string;
  suggestedVerbs: string[];
}

export const WEAK_OPENERS: WeakOpenerDef[] = [
  {
    pattern: /^(was\s+)?responsible for\b/i,
    phrase: 'Responsible for',
    suggestedVerbs: ['Orchestrated', 'Spearheaded', 'Directed', 'Managed', 'Delivered'],
  },
  {
    pattern: /^duties (included|were)\b/i,
    phrase: 'Duties included',
    suggestedVerbs: ['Executed', 'Delivered', 'Managed', 'Developed', 'Administered'],
  },
  {
    pattern: /^assisted (with|in)\b/i,
    phrase: 'Assisted with',
    suggestedVerbs: ['Collaborated with', 'Contributed to', 'Co-developed', 'Supported'],
  },
  {
    pattern: /^helped (with|in|to)?\b/i,
    phrase: 'Helped',
    suggestedVerbs: ['Facilitated', 'Co-engineered', 'Partnered to', 'Enabled'],
  },
  {
    pattern: /^worked on\b/i,
    phrase: 'Worked on',
    suggestedVerbs: ['Engineered', 'Developed', 'Designed', 'Built', 'Implemented'],
  },
  {
    pattern: /^worked with\b/i,
    phrase: 'Worked with',
    suggestedVerbs: ['Partnered with', 'Collaborated with', 'Integrated with'],
  },
  {
    pattern: /^tasked with\b/i,
    phrase: 'Tasked with',
    suggestedVerbs: ['Appointed to', 'Charged with', 'Spearheaded', 'Delivered'],
  },
  {
    pattern: /^in charge of\b/i,
    phrase: 'In charge of',
    suggestedVerbs: ['Oversaw', 'Supervised', 'Directed', 'Managed'],
  },
  {
    pattern: /^handled\b/i,
    phrase: 'Handled',
    suggestedVerbs: ['Resolved', 'Administered', 'Managed', 'Streamlined'],
  },
  {
    pattern: /^dealt with\b/i,
    phrase: 'Dealt with',
    suggestedVerbs: ['Resolved', 'Mitigated', 'Addressed', 'Negotiated'],
  },
  {
    pattern: /^involved in\b/i,
    phrase: 'Involved in',
    suggestedVerbs: ['Contributed to', 'Participated in designing', 'Co-authored'],
  },
  {
    pattern: /^participated in\b/i,
    phrase: 'Participated in',
    suggestedVerbs: ['Collaborated on', 'Contributed to', 'Delivered'],
  },
  {
    pattern: /^did\b/i,
    phrase: 'Did',
    suggestedVerbs: ['Executed', 'Implemented', 'Engineered'],
  },
  {
    pattern: /^made\b/i,
    phrase: 'Made',
    suggestedVerbs: ['Created', 'Authored', 'Built', 'Produced'],
  },
  {
    pattern: /^various\b/i,
    phrase: 'Various',
    suggestedVerbs: ['Multiple', 'Diverse', 'Cross-functional'],
  },
];

export function cleanBullet(bullet: string): string {
  return bullet
    .replace(/^\s*[\u2022\u25aa\u25cf\u2023\u2043\u00b7\-–—*o>]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .trim();
}

export function getLeadingWord(text: string): string {
  const cleaned = cleanBullet(text);
  const firstWord = cleaned.split(/\s+/)[0] || '';
  return firstWord.replace(/[^a-zA-Z]/g, '');
}

export function getVerbSynonyms(verb: string, limit = 4): string[] {
  const lower = verb.toLowerCase();
  for (const [, verbs] of Object.entries(POWER_VERB_CATEGORIES)) {
    if (verbs.some((v) => v.toLowerCase() === lower)) {
      return verbs.filter((v) => v.toLowerCase() !== lower).slice(0, limit);
    }
  }
  return ['Spearheaded', 'Delivered', 'Engineered', 'Optimized'].slice(0, limit);
}

export function containsMetric(text: string): boolean {
  return (
    /\d/.test(text) &&
    (/%|percent/i.test(text) ||
      /\d+\s*(x|hours|days|weeks|months|users|customers|clients|requests|reqs|ms|milliseconds|seconds|million|thousand|k\b|\+|records|transactions|orders|tickets|items|people|members|engineers|developers|countries|regions|teams)/i.test(text) ||
      /[$€£]\s*\d/.test(text) ||
      /\b\d+\s*(to|[-–])\s*\d+\b/.test(text))
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceOpenerWithVerb(bullet: string, newVerb: string): string {
  const cleaned = cleanBullet(bullet);
  for (const opener of WEAK_OPENERS) {
    if (opener.pattern.test(cleaned)) {
      return cleaned.replace(opener.pattern, newVerb);
    }
  }
  const words = cleaned.split(/\s+/);
  if (words.length > 0) {
    words[0] = newVerb;
    return words.join(' ');
  }
  return `${newVerb} ${cleaned}`;
}

export function analyzeBullet(rawBullet: string, options?: WritingCoachOptions): BulletFeedback[] {
  const cleaned = cleanBullet(rawBullet);
  if (!cleaned) return [];

  const feedback: BulletFeedback[] = [];
  const words = cleaned.split(/\s+/).filter(Boolean);
  const leadingWord = getLeadingWord(cleaned);

  // 1. Weak Opener Check
  let matchedWeakOpener: WeakOpenerDef | null = null;
  for (const opener of WEAK_OPENERS) {
    if (opener.pattern.test(cleaned)) {
      matchedWeakOpener = opener;
      break;
    }
  }

  if (matchedWeakOpener) {
    feedback.push({
      id: 'weak_opener',
      type: 'weak_opener',
      severity: 'warning',
      label: `Weak Opener: "${matchedWeakOpener.phrase}"`,
      message: `Starts with a passive duty phrase ("${matchedWeakOpener.phrase}") instead of an active contribution.`,
      actionableSuggestion: `Replace with an assertive power verb describing your specific action (e.g. ${matchedWeakOpener.suggestedVerbs.slice(0, 3).join(', ')}).`,
      suggestedVerbs: matchedWeakOpener.suggestedVerbs,
    });
  } else if (leadingWord && POWER_VERB_SET.has(leadingWord.toLowerCase())) {
    feedback.push({
      id: 'power_verb',
      type: 'power_verb',
      severity: 'strength',
      label: `Strong Action Verb: ${leadingWord}`,
      message: `Begins with an active, high-impact verb ("${leadingWord}").`,
    });
  } else if (words.length >= 3) {
    feedback.push({
      id: 'lead_with_action',
      type: 'power_verb',
      severity: 'tip',
      label: 'Lead with Action',
      message: 'Start with a strong past-tense action verb (e.g. Engineered, Accelerated, Designed) to capture recruiter attention.',
      suggestedVerbs: ['Engineered', 'Delivered', 'Accelerated', 'Implemented', 'Orchestrated'],
    });
  }

  // 2. Repetition Detection across bullets in the same section
  if (options?.allBullets && typeof options.bulletIndex === 'number' && leadingWord) {
    const currentWordLower = leadingWord.toLowerCase();

    // Check immediate predecessor
    if (options.bulletIndex > 0) {
      const prevWord = getLeadingWord(options.allBullets[options.bulletIndex - 1]);
      if (prevWord && prevWord.toLowerCase() === currentWordLower) {
        feedback.push({
          id: 'consecutive_repetition',
          type: 'repetition',
          severity: 'warning',
          label: `Repeated Opener ("${leadingWord}")`,
          message: `Repeats the exact same opening verb ("${leadingWord}") as the preceding bullet.`,
          actionableSuggestion: `Vary your vocabulary with synonyms like: ${getVerbSynonyms(leadingWord).join(', ')}.`,
          suggestedVerbs: getVerbSynonyms(leadingWord),
        });
      }
    }

    // Check global section frequency if not already flagged for consecutive repetition
    if (!feedback.some((f) => f.id === 'consecutive_repetition')) {
      let occurrences = 0;
      for (const b of options.allBullets) {
        if (getLeadingWord(b).toLowerCase() === currentWordLower) {
          occurrences++;
        }
      }
      if (occurrences >= 3) {
        feedback.push({
          id: 'repetition_frequency',
          type: 'repetition',
          severity: 'tip',
          label: `Frequent Verb ("${leadingWord}")`,
          message: `The verb "${leadingWord}" is used ${occurrences} times in this section.`,
          actionableSuggestion: `Consider alternating with other power verbs (e.g. ${getVerbSynonyms(leadingWord).join(', ')}).`,
          suggestedVerbs: getVerbSynonyms(leadingWord),
        });
      }
    }
  }

  // 3. Quantification & Measurable Outcomes
  if (containsMetric(cleaned)) {
    feedback.push({
      id: 'metric_present',
      type: 'metric_present',
      severity: 'strength',
      label: 'Quantified Impact',
      message: 'Includes measurable data points or metrics demonstrating verifiable results.',
    });
  } else if (words.length >= 4 && cleaned.length >= 25) {
    // Phase 3 Truth Guard: Never invent numbers, acknowledge qualitative contributions
    feedback.push({
      id: 'metric_opportunity',
      type: 'metric_opportunity',
      severity: 'tip',
      label: 'Metric Opportunity',
      message: 'Adding quantifiable scale or impact strengthens ATS scoring if numbers are available. (Qualitative contributions remain fully valid if exact metrics do not apply.)',
      candidateQuestion: 'Can you quantify the outcome (e.g. latency reduced by [X%], team size of [N], or adoption by [N users])?',
      actionableSuggestion: 'Use the Google X-Y-Z formula: "Accomplished [X] as measured by [Y] by doing [Z]" if you have measurable data.',
    });
  }

  // 4. Length and Scannability
  if (cleaned.length > 220 || words.length > 35) {
    feedback.push({
      id: 'length_long',
      type: 'length',
      severity: 'warning',
      label: `Length Warning (${cleaned.length} chars)`,
      message: `Bullet is ${cleaned.length} characters long. Dense bullets (>220 chars) are harder for recruiters and ATS scanners to scan quickly.`,
      actionableSuggestion: 'Aim for 1–2 focused lines (under 200 characters) following the X-Y-Z formula.',
    });
  } else if (cleaned.length < 20 || words.length < 4) {
    feedback.push({
      id: 'length_short',
      type: 'length',
      severity: 'tip',
      label: 'Brief Description',
      message: 'Bullet is very brief. Consider detailing what you built, the tools used, and the result achieved.',
    });
  }

  // 5. Job-Specific Keyword Alignment (ONLY if targetSkills are supplied)
  if (options?.targetSkills && options.targetSkills.length > 0) {
    const bulletLower = cleaned.toLowerCase();
    const matched = options.targetSkills.filter((skill) => {
      if (!skill.trim()) return false;
      const s = skill.toLowerCase().trim();
      const pattern = new RegExp(`(^|[^a-z0-9+#.-])${escapeRegExp(s)}($|[^a-z0-9+#.-])`, 'i');
      return pattern.test(bulletLower);
    });

    if (matched.length > 0) {
      feedback.push({
        id: 'jd_matched',
        type: 'jd_alignment',
        severity: 'strength',
        label: `Target Skill: ${matched.slice(0, 2).join(', ')}`,
        message: `Evidences target role keyword: "${matched.join(', ')}".`,
      });
    } else if (options.missingSkills && options.missingSkills.length > 0 && cleaned.length >= 30) {
      feedback.push({
        id: 'jd_missing_hint',
        type: 'jd_alignment',
        severity: 'tip',
        label: 'JD Alignment Opportunity',
        message: `Role prioritizes: ${options.missingSkills.slice(0, 3).join(', ')}.`,
        candidateQuestion: `If you worked with ${options.missingSkills.slice(0, 2).join(' or ')} during this project or role, mention it naturally to demonstrate alignment.`,
      });
    }
  }

  return feedback;
}
