// Deterministic extraction validation: per-section confidence plus document
// level sanity checks. Warnings surface in the UI so the user reviews the
// extraction before it becomes a Master CV — nothing is silently trusted.

import type { Confidence, ExtractionMeta } from './types';
import type { RawExperience, RawEducation } from './fields';
import type { ResumeData } from '../../types';

export interface ValidationInput {
  hasName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  summary: string;
  experience: RawExperience[];
  education: RawEducation[];
  technicalSkills: string[];
  projects: number;
  certifications: number;
  sectionKeys: Set<string>;
  anyHeadingFound: boolean;
  flattenedTwoColumn: boolean;
  meta: ExtractionMeta;
}

export interface ValidationOutput {
  confidence: Record<string, Confidence>;
  warnings: string[];
}

function dateValue(d: string): number | null {
  const m = d.match(/^(?:(\d{2})\/)?((?:19|20)\d{2})$/);
  if (!m) return null;
  return Number(m[2]) * 12 + Number(m[1] ?? 0);
}

/** Flags entries whose end precedes their start (same precision only). */
function chronologyWarnings(items: { startDate: string; endDate: string }[], label: string): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (!it.startDate || !it.endDate || /^(present|current|now)$/i.test(it.endDate)) continue;
    const s = dateValue(it.startDate);
    const e = dateValue(it.endDate);
    const samePrecision = /^\d{2}\//.test(it.startDate) === /^\d{2}\//.test(it.endDate);
    if (s !== null && e !== null && samePrecision && e < s) {
      out.push(`A${label} entry ends before it starts (${it.startDate} → ${it.endDate}) — please review its dates.`);
    }
  }
  return out;
}

export function validateExtraction(input: ValidationInput): ValidationOutput {
  const confidence: Record<string, Confidence> = {};
  const warnings: string[] = [];

  confidence.name = input.hasName ? 'high' : 'low';
  confidence.email = input.hasEmail ? 'high' : 'low';
  confidence.phone = input.hasPhone ? 'high' : 'low';
  confidence.summary = input.summary.split(/\s+/).filter(Boolean).length > 15 ? 'high' : 'low';

  // Experience: high when entries are complete (role + company + timeline),
  // medium when present but partial, low when nothing was found.
  const complete = input.experience.filter((e) => e.title && e.company && (e.startDate || e.endDate) && e.bullets.length > 0);
  if (input.experience.length === 0) {
    confidence.experience = 'low';
  } else if (complete.length === input.experience.length) {
    confidence.experience = 'high';
  } else {
    confidence.experience = 'medium';
  }

  confidence.education = input.education.length > 0 ? (input.education.every((e) => e.institution) ? 'high' : 'medium') : 'low';
  confidence.skills = input.technicalSkills.length > 0 ? 'medium' : 'low';
  confidence.projects = input.projects > 0 ? 'medium' : 'low';
  confidence.certifications = input.certifications > 0 ? 'high' : 'low';

  if (!input.anyHeadingFound) {
    warnings.push('No section headings were detected in this document — the content was mapped with best-effort heuristics. Please review every section.');
  }
  if (!input.sectionKeys.has('education')) {
    warnings.push('No education section was detected — add your education manually if it is missing.');
  }
  warnings.push(...chronologyWarnings(input.experience, 'n experience'));
  warnings.push(...chronologyWarnings(input.education, 'n education'));
  if (input.flattenedTwoColumn) {
    warnings.push(
      'This document appears to be a flattened two-column text export. Import the original PDF for more reliable layout extraction.',
    );
  }
  if (input.meta.multiColumn) {
    warnings.push('A multi-column layout was detected and reading order was reconstructed. Please verify nothing is out of place.');
  }
  return { confidence, warnings };
}

/** Summarizes detected sections for the UI (used by imports routes). */
export function detectedSections(resume: ResumeData): Record<string, boolean> {
  return {
    contact: Boolean(resume.personal.email || resume.personal.phone || resume.personal.linkedin),
    summary: Boolean(resume.summary),
    experience: resume.experience.length > 0,
    education: resume.education.length > 0,
    skills: resume.skills.technical.length + resume.skills.soft.length > 0,
    projects: resume.projects.length > 0,
    certifications: resume.certifications.length > 0,
    languages: resume.languages.length > 0,
  };
}
