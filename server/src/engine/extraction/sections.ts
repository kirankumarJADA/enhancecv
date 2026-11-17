// Section detection: splits reconstructed lines into labelled spans.
// A heading must be a short standalone line whose normalized text matches a
// known heading phrase (any letter case) — "WORK EXPERIENCE", "Internships",
// "Technical Skills & Competencies", "Certifications & Interests", etc.
// Combined headings like "Certifications & Interests" split into two sections.

import type { ParsedLine, SectionSpan } from './types';
import { findDateRange } from './dates';
import { isBulletLine } from '../../lib/text';

type HeadingDef = { key: string; re: RegExp };

const HEADING_DEFS: HeadingDef[] = [
  { key: 'summary', re: /^(professional\s+|career\s+|profile\s+|executive\s+|personal\s+)?(summary|profile|objective|about(\s+me)?)(\s+summary)?$/i },
  {
    key: 'experience',
    re: new RegExp(
      '^(work|professional|employment|relevant|industry|career|internship|technical|other)?\\s*' +
      '(experience|employment|history|internships?|roles?|background)' +
      '(\\s+(history|experience|background|internships?|(&|and)\\s+internships?))?$',
      'i',
    ),
  },
  { key: 'education', re: /^(education|academic(s)?(\s+(background|history|qualifications?))?|educational\s+qualifications?|qualifications)$/i },
  {
    key: 'skills',
    re: /^(technical\s+|core\s+|key\s+|it\s+)?(skills|competencies|technologies|tech(nical)?\s+stack|expertise|proficiencies)(\s+(summary|overview|(&|and)\s+(tools|abilities|competencies|technologies)))?$/i,
  },
  { key: 'soft', re: /^(soft|interpersonal)\s+skills$/i },
  { key: 'projects', re: /^(personal\s+|academic\s+|key\s+|selected\s+|major\s+)?projects?$/i },
  { key: 'certifications', re: /^(certifications?|certificates?|licenses?|licences?|courses?|training|credentials)(\s+(&|and)\s+(certifications?|courses?|training|workshops?))?$/i },
  { key: 'achievements', re: /^(achievements?|awards?|honors?|honours?|accomplishments?|extra[\s-]?curricular(\s+activities)?)$/i },
  { key: 'languages', re: /^languages(\s+known)?$/i },
  { key: 'links', re: /^(links?|relevant\s+links|useful\s+links|online\s+(profiles?|links?)|find\s+me\s+online|where\s+to\s+find\s+me)$/i },
  { key: 'publications', re: /^(publications|research(\s+(papers|work|experience|publications))?|papers(\s+published)?)$/i },
  { key: 'volunteering', re: /^(volunteer(ing)?(\s+(experience|work))?|community(\s+(service|involvement|work))?|social\s+(work|service))$/i },
  { key: 'interests', re: /^(interests?|hobbies|hobbies(\s+(&|and)\s+interests)?|interests(\s+(&|and)\s+hobbies)?|extra[\s-]?curricular\s+interests?)$/i },
];

// Longer compound phrases first so they win over single-word matches.
const COMBINED_SPLIT_RE = /^(.+?)\s*(?:&|and|\+|\/)\s*(.+)$/i;

function matchHeading(clean: string): string | null {
  for (const def of HEADING_DEFS) {
    if (def.re.test(clean)) return def.key;
  }
  return null;
}

/**
 * Matches compound section headers (e.g., "APPLIED MACHINE LEARNING & DATA SCIENCE PROJECTS",
 * "INDUSTRY & PRACTICAL EXPERIENCE", "EDUCATION & ACADEMIC CREDENTIALS") based on core section keywords.
 */
function matchCompoundHeading(clean: string): string | null {
  // 1. Projects: PROJECT / PROJECTS
  if (/\bprojects?\b/i.test(clean)) {
    return 'projects';
  }
  // 2. Experience: EXPERIENCE / EMPLOYMENT / INTERNSHIP / HISTORY
  if (/\b(experiences?|employment|internships?|history|work\s+history)\b/i.test(clean)) {
    return 'experience';
  }
  // 3. Education: EDUCATION / ACADEMIC / CREDENTIAL
  if (/\b(education|academics?|credentials?)\b/i.test(clean)) {
    return 'education';
  }
  // 4. Skills: SKILL / SKILLS / COMPETENCIES / TECHNOLOGIES
  if (/\b(skills?|competencies|technologies|proficiencies)\b/i.test(clean)) {
    return 'skills';
  }
  // 5. Summary: SUMMARY / PROFILE / OBJECTIVE
  if (/\b(summary|profiles?|objectives?)\b/i.test(clean)) {
    return 'summary';
  }
  // 6. Certifications & Awards: CERTIFICATION / CERTIFICATES / AWARD
  if (/\b(certifications?|certificates?|licenses?|licences?)\b/i.test(clean)) {
    return 'certifications';
  }
  if (/\b(achievements?|awards?|honors?|honours?)\b/i.test(clean)) {
    return 'achievements';
  }
  // 7. Languages
  if (/\blanguages?\b/i.test(clean)) {
    return 'languages';
  }
  // 8. Publications
  if (/\b(publications?|research)\b/i.test(clean)) {
    return 'publications';
  }
  // 9. Volunteering
  if (/\b(volunteer(ing)?|community\s+service)\b/i.test(clean)) {
    return 'volunteering';
  }
  // 10. Interests
  if (/\b(interests?|hobbies)\b/i.test(clean)) {
    return 'interests';
  }
  return null;
}

function isHeadingCasing(text: string, words: string[]): boolean {
  // ALL CAPS (e.g. APPLIED MACHINE LEARNING & DATA SCIENCE PROJECTS)
  if (/[A-Z]/.test(text) && text === text.toUpperCase()) return true;
  // Title Case where significant words start with uppercase (e.g. Industry & Practical Experience)
  const minorWords = new Set(['and', '&', 'of', 'in', 'for', 'the', 'to', 'a', 'an', 'with', 'at', 'by']);
  const nonMinor = words.filter((w) => !minorWords.has(w.toLowerCase()));
  return nonMinor.length > 0 && nonMinor.every((w) => /^[A-Z0-9]/.test(w));
}

/** Strips decoration and decides whether a line is a section heading. */
export function detectHeading(line: ParsedLine): { key: string; title: string } | null {
  let text = line.text.trim();
  if (!text) return null;
  if (line.isListItem || isBulletLine(line.text)) return null;
  text = text.replace(/^[\s•·▪◦‣\-–*]+/, '').replace(/[\s:;•·]+$/, '').trim();
  if (text.length === 0 || text.length > 80) return null;
  if (/[.,!?]$/.test(text)) return null; // sentence, not a heading
  if (text.includes(':') || text.includes(',') || text.includes('|') || /https?:|\/\//i.test(text)) return null;
  if (findDateRange(text)) return null; // a timeline line, not a heading
  if (text.includes('@')) return null;
  const words = text.split(/\s+/);
  if (words.length > 8) return null;
  // Guard against page headers/footers like "Page 2" and bare numbers.
  if (/^(page\s*)?[\d.ivxlcdm]+$/i.test(text)) return null;

  // Direct phrase match (any case): "Experience", "Work Experience", "Technical Skills".
  const key = matchHeading(text);
  if (key) return { key, title: text };

  // Combined heading: "Certifications & Interests", "Education & Academic Credentials", "Skills & Tools"
  const combined = text.match(COMBINED_SPLIT_RE);
  if (combined) {
    const leftPart = combined[1].trim();
    const rightPart = combined[2].trim();
    const a = matchHeading(leftPart) || matchCompoundHeading(leftPart);
    const b = matchHeading(rightPart) || matchCompoundHeading(rightPart);
    if (a && b) {
      if (a === b) return { key: a, title: text };
      // "Education & Academic Credentials" maps to education
      if ((a === 'education' && /credentials?/i.test(rightPart)) || (b === 'education' && /credentials?/i.test(leftPart))) {
        return { key: 'education', title: text };
      }
      return { key: `${a}+${b}`, title: text };
    }
  }

  // Compound Section Header Detection:
  // Standalone short heading line (<= 8 words, ALL CAPS or Title Case, no trailing period)
  if (isHeadingCasing(text, words)) {
    const compoundKey = matchCompoundHeading(text);
    if (compoundKey) {
      return { key: compoundKey, title: text };
    }
  }

  return null;
}

/** Splits lines into ordered section spans. Lines before the first heading go to 'header'. */
export function splitSections(lines: ParsedLine[]): SectionSpan[] {
  const sections: SectionSpan[] = [{ key: 'header', title: 'Header', lines: [] }];
  for (const line of lines) {
    const heading = detectHeading(line);
    if (heading) {
      // A repeated heading simply opens another span; field parsers read all
      // spans sharing the same key in document order.
      sections.push({ key: heading.key, title: heading.title, lines: [] });
      continue;
    }
    if (!line.text.trim()) continue; // blank lines separate blocks but never start sections
    sections[sections.length - 1].lines.push(line);
  }
  return sections.filter((s) => s.key !== 'header' || s.lines.length > 0);
}

export function bodyOf(sections: SectionSpan[], key: string): ParsedLine[] {
  return sections.filter((s) => s.key === key).flatMap((s) => s.lines);
}
