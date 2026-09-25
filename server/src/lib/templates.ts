// Resume template registry.
//
// CONTENT (ResumeData) stays fully separate from PRESENTATION (template).
// Every template is single-column, standard-heading, selectable-text — ATS
// safety is non-negotiable, so templates vary typography/spacing/heading
// treatment only, never layout structure.

export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  atsSafe: true;
  /** Deterministic recommendation hints. */
  bestFor: string[];
}

export const TEMPLATES: ResumeTemplate[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'The original Curevo layout — traditional serif-free styling trusted by every industry.',
    atsSafe: true,
    bestFor: ['general', 'business', 'finance', 'administration'],
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Clean spacing with a subtle accent on section headings, for product, marketing and startup roles.',
    atsSafe: true,
    bestFor: ['product', 'marketing', 'startup', 'design'],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Maximum whitespace and quiet typography — ideal for graduates and early-career applications.',
    atsSafe: true,
    bestFor: ['graduate', 'entry', 'intern', 'academic'],
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Denser, formal presentation suited to consulting, operations and senior business roles.',
    atsSafe: true,
    bestFor: ['consulting', 'operations', 'manager', 'senior'],
  },
  {
    id: 'technical',
    name: 'Technical',
    description: 'Tight, keyword-forward structure that keeps a full skills inventory visible for engineering roles.',
    atsSafe: true,
    bestFor: ['software', 'engineer', 'developer', 'data', 'devops', 'technical'],
  },
  {
    id: 'executive',
    name: 'Executive',
    description: 'Authoritative spacing and strong name presence for leadership and director-level applications.',
    atsSafe: true,
    bestFor: ['director', 'executive', 'head', 'vp', 'leadership'],
  },
];

export const DEFAULT_TEMPLATE_ID = 'classic';

export function getTemplate(id: string | null | undefined): ResumeTemplate {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

export function isValidTemplate(id: string): boolean {
  return TEMPLATES.some((t) => t.id === id);
}

/**
 * Deterministic template recommendation.
 *
 * Inputs come from the existing deterministic JD analysis / ATS analysis —
 * never from AI. Returns the recommended template plus a human-readable
 * reason. The user always keeps manual control.
 */
export function recommendTemplate(input: {
  jobTitle?: string;
  seniority?: string;
  requiredSkills?: string[];
  technicalSkillCount?: number;
  experienceCount?: number;
  yearsExperience?: number | null;
}): { templateId: string; reason: string } {
  const title = `${input.jobTitle || ''}`.toLowerCase();
  const skills = (input.requiredSkills || []).map((s) => s.toLowerCase());
  const techSignals = [
    'java', 'python', 'javascript', 'typescript', 'react', 'node', 'sql', 'aws', 'docker',
    'kubernetes', 'spring', 'api', 'devops', 'data', 'machine learning', 'backend', 'frontend',
  ];
  const techHits = skills.filter((s) => techSignals.some((t) => s.includes(t))).length;
  const titleTech = techSignals.some((t) => title.includes(t));
  const leadership = /(director|head of|vp|vice president|chief|executive)/i.test(title) ||
    input.seniority === 'Director';
  const senior = /(senior|staff|principal|lead)/i.test(title) || input.seniority === 'Senior' || input.seniority === 'Staff' || input.seniority === 'Principal';
  const entry = /(graduate|intern|junior|entry)/i.test(title) || input.seniority === 'Intern' || input.seniority === 'Graduate' || input.seniority === 'Junior';

  if (leadership) {
    return { templateId: 'executive', reason: 'Leadership or director-level role — the Executive template gives your experience authoritative presence while keeping a fully parseable structure.' };
  }
  if ((titleTech || techHits >= 3 || (input.technicalSkillCount || 0) >= 8)) {
    return { templateId: 'technical', reason: 'Software or data role detected — the Technical template keeps your skills inventory prominent with a clean ATS-safe structure.' };
  }
  if (entry && (input.experienceCount || 0) <= 1) {
    return { templateId: 'minimal', reason: 'Early-career application — the Minimal template puts your education and projects first without visual noise.' };
  }
  if (senior) {
    return { templateId: 'professional', reason: 'Senior role — the Professional template presents your track record in a formal, recruiter-friendly density.' };
  }
  if (/(product|marketing|growth|design)/i.test(title)) {
    return { templateId: 'modern', reason: 'Product or marketing role — the Modern template balances personality with strict ATS compatibility.' };
  }
  return { templateId: 'classic', reason: 'A safe, widely trusted default — Classic is accepted everywhere and fully machine-readable.' };
}
