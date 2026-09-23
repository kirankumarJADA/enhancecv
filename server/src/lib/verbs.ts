// Power/action verb taxonomy, informed by the MIT-licensed ResumeSkills project
// (https://github.com/Paramchoudhary/ResumeSkills), "resume-bullet-writer" skill.

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
  ],
  collaboration: [
    'Collaborated',
    'Partnered',
    'Facilitated',
    'Presented',
    'Communicated',
    'Negotiated',
    'Influenced',
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
  ],
};

export const ALL_POWER_VERBS: string[] = Object.values(POWER_VERB_CATEGORIES).flat();

const verbLower = new Set(ALL_POWER_VERBS.map((v) => v.toLowerCase()));

// Weak openings that indicate vague phrasing (kept from the same methodology's
// "weak bullet" detection). Replacement verbs are chosen conservatively — only
// rewording, never changing the claim.
export const WEAK_OPENERS: { pattern: RegExp; reason: string }[] = [
  { pattern: /^worked on\b/i, reason: 'vague opener "Worked on"' },
  { pattern: /^worked with\b/i, reason: 'vague opener "Worked with"' },
  { pattern: /^helped\b/i, reason: 'vague opener "Helped"' },
  { pattern: /^assisted (with|in)\b/i, reason: 'vague opener "Assisted with"' },
  { pattern: /^responsible for\b/i, reason: 'passive opener "Responsible for"' },
  { pattern: /^was responsible for\b/i, reason: 'passive opener "Was responsible for"' },
  { pattern: /^involved in\b/i, reason: 'vague opener "Involved in"' },
  { pattern: /^participated in\b/i, reason: 'vague opener "Participated in"' },
  { pattern: /^did\b/i, reason: 'vague opener "Did"' },
  { pattern: /^made\b/i, reason: 'vague opener "Made"' },
  { pattern: /^handled\b/i, reason: 'weak opener "Handled"' },
  { pattern: /^dealt with\b/i, reason: 'weak opener "Dealt with"' },
  { pattern: /^tasked with\b/i, reason: 'passive opener "Tasked with"' },
  { pattern: /^in charge of\b/i, reason: 'passive opener "In charge of"' },
  { pattern: /^various\b/i, reason: 'vague opener "Various"' },
  { pattern: /^duties included\b/i, reason: 'passive opener "Duties included"' },
];

export function isPowerVerbStart(sentence: string): boolean {
  const first = sentence.trim().split(/\s+/)[0];
  if (!first) return false;
  return verbLower.has(first.toLowerCase().replace(/[^a-z]/g, ''));
}

/**
 * Suggest a stronger opener for a weak bullet start. Returns null when no
 * confident mapping exists — we never guess at the expense of truth.
 */
export function strongerOpener(text: string): { verb: string; reason: string } | null {
  for (const w of WEAK_OPENERS) {
    if (w.pattern.test(text.trim())) {
      return { verb: '', reason: w.reason };
    }
  }
  return null;
}
