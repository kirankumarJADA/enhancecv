// Section detection: splits reconstructed lines into labelled spans.
// A heading must be a short standalone line whose normalized text matches a
// known heading phrase (any letter case) — "WORK EXPERIENCE", "Internships",
// "Technical Skills & Competencies", "Certifications & Interests", etc.
// Combined headings like "Certifications & Interests" split into two sections.

import type { ParsedLine, SectionSpan } from './types';
import { findDateRange } from './dates';

type HeadingDef = { key: string; re: RegExp };

const HEADING_DEFS: HeadingDef[] = [
  { key: 'summary', re: /^(professional\s+|career\s+|profile\s+|executive\s+)?(summary|profile|objective|about(\s+me)?)(\s+summary)?$/i },
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

/** Strips decoration and decides whether a line is a section heading. */
export function detectHeading(line: ParsedLine): { key: string; title: string } | null {
  let text = line.text.trim();
  if (!text) return null;
  if (line.isListItem) return null;
  text = text.replace(/^[\s•·▪◦‣\-–*]+/, '').replace(/[\s:;•·]+$/, '').trim();
  if (text.length === 0 || text.length > 48) return null;
  if (/[.,!?]$/.test(text)) return null; // sentence, not a heading
  if (findDateRange(text)) return null; // a timeline line, not a heading
  if (text.includes('@')) return null;
  const words = text.split(/\s+/);
  if (words.length > 6) return null;
  // Guard against page headers/footers like "Page 2" and bare numbers.
  if (/^(page\s*)?[\d.ivxlcdm]+$/i.test(text)) return null;

  // Direct phrase match (any case): "Experience", "Work Experience", "Technical Skills".
  const key = matchHeading(text);
  if (key) return { key, title: text };

  // Combined heading: "Certifications & Interests", "Skills & Tools" — both
  // halves must independently be known headings.
  const combined = text.match(COMBINED_SPLIT_RE);
  if (combined) {
    const a = matchHeading(combined[1].trim());
    const b = matchHeading(combined[2].trim());
    if (a && b && a !== b) return { key: `${a}+${b}`, title: text };
    if (a && b && a === b) return { key: a, title: text };
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
