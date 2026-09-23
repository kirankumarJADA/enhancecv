// Job Description analysis engine.
//
// Requirement buckets (required / preferred), keyword extraction approach and
// seniority detection are informed by the MIT-licensed ResumeSkills project
// ("job-description-analyzer" skill).

import { JobAnalysis } from '../types';
import { SKILLS, SOFT_SKILLS, findSkillsInText, skillTermRegex } from '../lib/skills';
import { normalizeWhitespace, extractKeywords, stripBulletPrefix } from '../lib/text';

const TITLE_HINTS =
  /(engineer|developer|programmer|architect|manager|analyst|scientist|designer|consultant|administrator|specialist|intern|lead|director|technician|officer|associate|devops|sre|qa|tester|recruiter|accountant|marketer|sales)/i;

const SENIORITY_PATTERNS: { level: string; re: RegExp }[] = [
  { level: 'Intern', re: /\bintern(ship)?\b/i },
  { level: 'Graduate', re: /\b(graduate|entry[ -]?level|fresher|junior)\b/i },
  { level: 'Junior', re: /\bjunior\b/i },
  { level: 'Senior', re: /\b(senior|sr\.?)\b/i },
  { level: 'Staff', re: /\bstaff\b/i },
  { level: 'Principal', re: /\bprincipal\b/i },
  { level: 'Lead', re: /\b(lead|team lead|tech lead)\b/i },
  { level: 'Manager', re: /\b(engineering manager|development manager|project manager|product manager|delivery manager)\b/i },
  { level: 'Director', re: /\b(director|head of)\b/i },
];

const PREFERRED_SECTION_RE =
  /(?:nice[ -]to[ -]have|preferred(?: qualifications| skills| experience)?|bonus(?: points| if)?|good to have|desirable|plus(?:es)?|advantageous|additional skills)/i;
const REQUIRED_SECTION_RE =
  /(?:requirements|required(?: qualifications| skills| experience)?|must[ -]have|must have|minimum qualifications|basic qualifications|essential|what you.?ll need|what we.?re looking for|qualifications)/i;
const RESPONSIBILITIES_SECTION_RE =
  /(?:responsibilities|what you.?ll do|duties|the role|your role|day to day|key responsibilities)/i;

const DEGREE_RE =
  /\b(b\.? ?tech|bachelor'?s?(?: degree)?|b\.? ?e\.?|b\.? ?sc|master'?s?(?: degree)?|m\.? ?sc|m\.? ?tech|m\.? ?e\.?|mba|ph\.? ?d|doctorate|diploma|associate degree|high school|ged)\b[^.\n]*/gi;

const CERT_HINTS =
  /\b(certification|certified|certificate)\b/i;

const KNOWN_CERTS = [
  'AWS Certified Solutions Architect',
  'AWS Certified Developer',
  'AWS Certified Cloud Practitioner',
  'Certified Kubernetes Administrator',
  'Azure Administrator Associate',
  'Google Professional Cloud Architect',
  'PMP',
  'Certified Scrum Master',
  'Oracle Certified Professional',
  'CCNA',
  'CISSP',
  'CFA',
  'CPA',
  'Six Sigma',
  'ITIL',
];

interface SectionSpan {
  name: 'required' | 'preferred' | 'responsibilities' | 'other';
  start: number;
  end: number;
}

function detectSections(text: string): SectionSpan[] {
  const lines = text.split('\n');
  const spans: SectionSpan[] = [];
  let current: SectionSpan['name'] = 'other';
  let start = 0;
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const isHeadingLike = trimmed.length > 0 && trimmed.length < 80 && /:?$/.test(trimmed) &&
      (REQUIRED_SECTION_RE.test(trimmed) || PREFERRED_SECTION_RE.test(trimmed) || RESPONSIBILITIES_SECTION_RE.test(trimmed)) &&
      trimmed.split(/\s+/).length <= 10;
    if (isHeadingLike) {
      if (offset > start) spans.push({ name: current, start, end: offset });
      current = REQUIRED_SECTION_RE.test(trimmed)
        ? 'required'
        : PREFERRED_SECTION_RE.test(trimmed)
          ? 'preferred'
          : RESPONSIBILITIES_SECTION_RE.test(trimmed)
            ? 'responsibilities'
            : 'other';
      start = offset + line.length;
    }
    offset += line.length + 1;
  }
  spans.push({ name: current, start, end: text.length });
  return spans;
}

function sectionAt(spans: SectionSpan[], index: number): SectionSpan['name'] {
  for (const s of spans) {
    if (index >= s.start && index < s.end) return s.name;
  }
  return 'other';
}

function detectTitle(text: string, lines: string[]): string {
  // Explicit label first
  const labelMatch = text.match(/(?:job\s*title|position|role)\s*[:\-]\s*(.+)/i);
  if (labelMatch) return cleanTitle(labelMatch[1]);
  // First short, title-like line
  for (const raw of lines.slice(0, 6)) {
    const line = raw.trim().replace(/^[#*\-•\s]+/, '').replace(/[,|].*$/, '').trim();
    if (line.length >= 3 && line.length <= 70 && TITLE_HINTS.test(line) && !/\b(we|our|you|company|about|apply|job)\b/i.test(line)) {
      return cleanTitle(line);
    }
  }
  // Fallback: most frequent known skill-adjacent role word
  const m = text.match(/\b(senior|junior|lead|principal|staff)?\s?(java|python|frontend|front-end|backend|back-end|full[- ]?stack|cloud|devops|data|software|mobile|react|node)(\.js)?\s*(developer|engineer|architect)/i);
  if (m) return cleanTitle(m[0]);
  return 'Unknown Title';
}

function cleanTitle(t: string): string {
  return t.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function detectSeniority(text: string, title: string): string {
  for (const { level, re } of SENIORITY_PATTERNS) {
    if (re.test(title)) return level;
  }
  for (const { level, re } of SENIORITY_PATTERNS) {
    if (re.test(text)) return level;
  }
  return 'Not specified';
}

function detectYears(text: string): number | null {
  const matches = [...text.matchAll(/(\d{1,2})\s*\+?\s*(?:-|to|–)?\s*(\d{1,2})?\s*years?/gi)];
  let max = 0;
  for (const m of matches) {
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    const hi = Math.max(a, b);
    if (hi <= 25 && hi > max) max = hi;
  }
  return max > 0 ? max : null;
}

export function analyseJobDescription(rawText: string): JobAnalysis {
  const text = normalizeWhitespace(rawText);
  const lower = text.toLowerCase();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const spans = detectSections(text);

  const title = detectTitle(text, lines);
  const seniority = detectSeniority(text, title);
  const yearsRequired = detectYears(text);

  // Company detection
  let company = '';
  const companyMatch =
    text.match(/company\s*[:\-]\s*([A-Z][\w&.'\- ]{1,40})/) ||
    text.match(/(?:join|at)\s+([A-Z][\w&.'\-]+(?:\s+[A-Z][\w&.'\-]+){0,2})\s*,?\s*(?:we|you|is|are|a|an)/);
  if (companyMatch) company = companyMatch[1].trim().slice(0, 60);

  // Skill classification into required vs preferred using section position
  const required = new Set<string>();
  const preferred = new Set<string>();
  const allMentions = findSkillsInText(text);
  for (const mention of allMentions) {
    const sec = sectionAt(spans, mention.matchIndex);
    if (sec === 'preferred') preferred.add(mention.canonical);
    else required.add(mention.canonical);
  }
  // A skill appearing in a preferred section is often also required elsewhere;
  // treat preferred-only skills as preferred.
  for (const p of preferred) required.delete(p);

  // Explicitly-listed skills lines ("Skills: Java, Spring, SQL")
  const skillsLineMatch = text.match(/skills?\s*[:\-]\s*([^\n]{5,300})/i);
  if (skillsLineMatch) {
    for (const mention of findSkillsInText(skillsLineMatch[1])) {
      if (!preferred.has(mention.canonical)) required.add(mention.canonical);
    }
  }

  // Soft skills
  const softSkills = SOFT_SKILLS.filter((s) => {
    const re = skillTermRegex(s);
    return re.test(lower);
  }).map((s) => s.charAt(0).toUpperCase() + s.slice(1));

  // Responsibilities: bullet lines or lines under the responsibilities section
  const responsibilities: string[] = [];
  for (const raw of lines) {
    const isBullet = /^[\u2022\u25aa\u25cf\-–—*]/.test(raw) || /^\d+[.)]/.test(raw);
    const sec = sectionAt(spans, text.indexOf(raw));
    if ((isBullet || sec === 'responsibilities') && raw.length > 15 && raw.length < 220) {
      const cleaned = stripBulletPrefix(raw).trim();
      if (cleaned.length > 12 && !RESPONSIBILITIES_SECTION_RE.test(cleaned) && responsibilities.length < 15) {
        responsibilities.push(cleaned);
      }
    }
  }

  // Education requirements
  const educationRequirements: string[] = [];
  for (const m of text.matchAll(DEGREE_RE)) {
    const entry = m[0].trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!educationRequirements.some((e) => e.toLowerCase() === entry.toLowerCase())) {
      educationRequirements.push(entry);
    }
    if (educationRequirements.length >= 4) break;
  }

  // Certifications
  const certificationRequirements: string[] = [];
  for (const cert of KNOWN_CERTS) {
    if (skillTermRegex(cert.toLowerCase()).test(lower)) certificationRequirements.push(cert);
  }
  if (certificationRequirements.length === 0 && CERT_HINTS.test(text)) {
    const certLine = lines.find((l) => CERT_HINTS.test(l) && l.length < 160);
    if (certLine) certificationRequirements.push(certLine.replace(/^[^A-Za-z]*/, '').slice(0, 120));
  }

  // Keywords: taxonomy skills + salient free-text terms
  const taxonomy = [...required, ...preferred].map((s) => s.toLowerCase());
  const freeKeywords = extractKeywords(
    text.replace(/https?:\/\/\S+/g, ' '),
    30
  ).filter((k) => !taxonomy.some((t) => t.includes(k) || k.includes(t)));
  const keywords = [...taxonomy, ...freeKeywords].slice(0, 35);

  // Domain terms: repeated capitalized multi-word phrases (e.g. "Payment Gateway")
  const domainSet = new Map<string, number>();
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g)) {
    const phrase = m[1];
    if (phrase.split(/\s+/).every((w) => w.length > 2)) {
      domainSet.set(phrase, (domainSet.get(phrase) || 0) + 1);
    }
  }
  const domainTerms = [...domainSet.entries()]
    .filter(([p, n]) => n >= 2 || p.length > 14)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([p]) => p);

  return {
    title,
    company,
    seniority,
    yearsRequired,
    requiredSkills: [...required].sort(),
    preferredSkills: [...preferred].sort(),
    softSkills: [...new Set(softSkills)].slice(0, 10),
    responsibilities,
    educationRequirements,
    certificationRequirements,
    keywords,
    domainTerms,
  };
}
