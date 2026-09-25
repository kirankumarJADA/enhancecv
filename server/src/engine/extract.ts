// CV extraction engine: turns raw text from an uploaded PDF/DOCX into a
// structured (but user-reviewable) ResumeData. Heuristic, never silently
// trusted — the UI always shows the extraction for editing before saving.

import {
  EducationItem,
  ExperienceItem,
  ProjectItem,
  ResumeData,
  DEFAULT_SECTION_ORDER,
} from '../types';
import { AppError } from '../middleware/errors';
import { findSkillsInText, splitSkillList } from '../lib/skills';
import { isBulletLine, normalizeWhitespace, stripBulletPrefix, wordCount } from '../lib/text';

export interface ExtractionResult {
  resume: ResumeData;
  confidence: Record<string, 'high' | 'medium' | 'low'>;
  rawText: string;
  notes: string[];
}

const SECTION_PATTERNS: { key: string; re: RegExp }[] = [
  { key: 'experience', re: /^(work\s+)?(professional\s+)?(experience|employment)(\s+history)?$/i },
  { key: 'education', re: /^(education|academic(s)?(\s+background)?|qualifications)$/i },
  { key: 'skills', re: /^(technical\s+skills|skills(\s+(&|and)\s+(tools|abilities))?|skills summary|technologies)$/i },
  { key: 'projects', re: /^(projects|personal\s+projects|key\s+projects|academic\s+projects)$/i },
  { key: 'certifications', re: /^(certifications?|licenses?|courses?(\s+(&|and)\s+certifications)?)$/i },
  { key: 'languages', re: /^languages$/i },
  { key: 'achievements', re: /^(achievements?|awards?|honors?|honours?|accomplishments)$/i },
  { key: 'summary', re: /^(professional\s+)?(summary|profile|objective|about(\s+me)?)$/i },
  { key: 'soft', re: /^(soft\s+skills)$/i },
];

function detectSectionHeading(line: string): string | null {
  const clean = line.trim().replace(/[:\-–—]+$/, '').trim();
  if (clean.length === 0 || clean.length > 40) return null;
  // heading if short line, no ending period, and matches a known pattern
  if (/[.,]$/.test(clean)) return null;
  for (const p of SECTION_PATTERNS) {
    if (p.re.test(clean)) return p.key;
  }
  return null;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(in|profile)\/[a-z0-9\-_%]+/i;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-z0-9\-_]+/i;
const PORTFOLIO_RE = /(?:https?:\/\/)?(?:www\.)?((?!linkedin|github)[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s,]*)?)/i;
const DATE_RANGE_RE = /((?:0?[1-9]|1[0-2])\/)?\s*(19|20)\d{2}\s*(?:-|–|—|to)\s*((?:0?[1-9]|1[0-2])\/)?\s*((19|20)\d{2}|present|current|now|date)/i;

function looksLikeName(line: string): boolean {
  const clean = line.trim().replace(/[^a-zA-Z\s'.-]/g, '').trim();
  if (clean.length < 3 || clean.length > 50) return false;
  const words = clean.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) => /^[A-Z][a-zA-Z'’.-]*$/.test(w) || /^[A-Z.]+$/.test(w));
}

function normDate(s: string): string {
  const t = s.trim();
  if (!t) return '';
  if (/present|current|now|date/i.test(t)) return 'Present';
  const m = t.match(/((\d{1,2})\/)?((19|20)\d{2})/);
  if (m) return m[2] ? `${m[2].padStart(2, '0')}/${m[3]}` : m[3];
  return t.slice(0, 10);
}

export function extractResumeFromText(rawText: string): ExtractionResult {
  const text = normalizeWhitespace(rawText);
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  const notes: string[] = [];
  const confidence: Record<string, 'high' | 'medium' | 'low'> = {};

  // ----- contact info (scan the whole doc) -----
  const email = text.match(EMAIL_RE)?.[0] || '';
  const linkedin = text.match(LINKEDIN_RE)?.[0] || '';
  const github = text.match(GITHUB_RE)?.[0] || '';
  let phone = '';
  let location = '';
  let portfolio = '';
  let fullName = '';

  const headerLines: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (headerLines.length >= 1 && fullName) break;
      continue;
    }
    if (detectSectionHeading(t)) break;
    headerLines.push(t);
    if (!fullName && looksLikeName(t) && !EMAIL_RE.test(t) && !DATE_RANGE_RE.test(t)) {
      fullName = t.replace(/\s+/g, ' ');
    }
    if (headerLines.length > 12) break;
  }

  const headerText = headerLines.join('\n');
  if (!phone) {
    const m = headerText.match(PHONE_RE);
    if (m && /\d{6,}/.test(m[0].replace(/\D/g, ''))) phone = m[0].trim();
  }
  if (!phone) {
    const m = text.match(PHONE_RE);
    if (m && /\d{7,}/.test(m[0].replace(/\D/g, ''))) phone = m[0].trim();
  }
  const locMatch = text.match(/\b([A-Z][a-zA-Z.'-]+(?:\s[A-Z][a-zA-Z.'-]+)*),\s*([A-Z]{2}|[A-Z][a-zA-Z]+)\b/);
  if (locMatch) location = locMatch[0];
  if (!portfolio) {
    const pm = text.match(PORTFOLIO_RE);
    if (pm && !/\.(png|jpe?g|pdf|docx?|org|io\/[a-z]{4,})$/i.test(pm[1])) portfolio = pm[0];
  }

  confidence.email = email ? 'high' : 'low';
  confidence.phone = phone ? 'high' : 'low';
  confidence.name = fullName ? 'high' : 'low';
  if (!fullName) notes.push('Could not confidently detect your name — please set it below.');
  if (!email) notes.push('No email detected — please add it.');
  if (!phone) notes.push('No phone number detected — please add it.');

  // ----- split body into sections -----
  const sectionBodies = new Map<string, string[]>();
  let current = 'header';
  for (const line of lines) {
    const heading = detectSectionHeading(line);
    if (heading) {
      current = heading;
      if (!sectionBodies.has(current)) sectionBodies.set(current, []);
      continue;
    }
    const arr = sectionBodies.get(current) || [];
    arr.push(line);
    sectionBodies.set(current, arr);
  }

  const bodyOf = (key: string): string[] => sectionBodies.get(key) || [];

  // ----- summary -----
  let summary = '';
  const summaryLines = bodyOf('summary').filter((l) => l.trim() && !isBulletLine(l));
  if (summaryLines.length > 0) {
    summary = summaryLines.join(' ').replace(/\s+/g, ' ').trim();
    // stop at first sentence-ish boundary of 400 chars
    if (summary.length > 600) summary = summary.slice(0, 600);
  }
  confidence.summary = wordCount(summary) > 15 ? 'high' : 'low';

  // ----- experience -----
  const experience: ExperienceItem[] = [];
  const expLines = bodyOf('experience');
  let currentExp: ExperienceItem | null = null;
  let pendingHeader: string[] = [];
  const flushPending = () => {
    if (currentExp && pendingHeader.length > 0) {
      currentExp.company = pendingHeader[pendingHeader.length - 1];
      if (pendingHeader.length > 1) currentExp.title = pendingHeader[0];
      pendingHeader = [];
    }
  };
  for (const raw of expLines) {
    const line = raw.trim();
    if (!line) continue;
    const dateMatch = line.match(DATE_RANGE_RE);
    if (dateMatch && !isBulletLine(line)) {
      flushPending();
      const datePart = dateMatch[0];
      const rest = line.replace(datePart, '').replace(/[|,–—-]+\s*$/, '').trim();
      const endDate = normDate(dateMatch[4] ? dateMatch[0].split(/(?:-|–|—|to)/i)[1] : '');
      const startDate = normDate(dateMatch[0].split(/(?:-|–|—|to)/i)[0]);
      currentExp = {
        id: `exp_${experience.length + 1}_${Math.random().toString(36).slice(2, 8)}`,
        company: '',
        title: '',
        location: rest && !rest.includes(',') ? '' : rest.split(',')[1]?.trim() || '',
        startDate,
        endDate: endDate || 'Present',
        current: /present|current|now/i.test(datePart),
        bullets: [],
      };
      if (rest) {
        const parts = rest.split(/\s*[|,•]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          currentExp.title = parts[0];
          currentExp.company = parts[1];
          if (parts[2]) currentExp.location = parts[2];
        } else {
          pendingHeader = [rest];
        }
      }
      experience.push(currentExp);
      continue;
    }
    if (isBulletLine(line) && currentExp) {
      flushPending();
      currentExp.bullets.push(stripBulletPrefix(line));
      continue;
    }
    if (currentExp && currentExp.bullets.length === 0) {
      // context line before bullets: could be company/title continuation
      if (pendingHeader.length < 3) pendingHeader.push(line);
      continue;
    }
    if (!currentExp && line.length > 3 && line.length < 120) {
      // Company/Title line possibly followed by a date line below
      pendingHeader.push(line);
      if (pendingHeader.length > 4) pendingHeader = pendingHeader.slice(-3);
    }
  }
  flushPending();
  const meaningfulExp = experience.filter((e) => e.company || e.title || e.bullets.length > 0);
  confidence.experience = meaningfulExp.length > 0 ? 'medium' : 'low';
  if (meaningfulExp.length === 0) notes.push('No work experience detected — add your roles manually below.');

  // ----- education -----
  const education: EducationItem[] = [];
  const eduLines = bodyOf('education');
  let currentEdu: EducationItem | null = null;
  for (const raw of eduLines) {
    const line = raw.trim();
    if (!line) continue;
    const dateMatch = line.match(DATE_RANGE_RE);
    const degreeMatch = line.match(/\b(b\.? ?tech|b\.? ?e\.?|bachelor'?s?|b\.? ?sc|master'?s?|m\.? ?sc|m\.? ?tech|m\.? ?e\.?|mba|ph\.? ?d|doctorate|diploma|associate)\b[^|,;]*/i);
    if (degreeMatch) {
      const degree = degreeMatch[0].trim();
      const rest = line.replace(degreeMatch[0], '').replace(/[|,–—-]+\s*$/, '').trim();
      const datePart = dateMatch?.[0] || '';
      const dates = datePart ? datePart.split(/(?:-|–|—|to)/i).map(normDate) : ['', ''];
      currentEdu = {
        id: `edu_${education.length + 1}_${Math.random().toString(36).slice(2, 8)}`,
        institution: rest || '',
        degree: degree.charAt(0).toUpperCase() + degree.slice(1),
        field: rest.match(/\bin\s+([A-Za-z &]+)$/i)?.[1] || '',
        startDate: dates[0] || '',
        endDate: dates[1] || '',
        grade: '',
      };
      education.push(currentEdu);
    } else if (dateMatch && currentEdu && !currentEdu.startDate) {
      const dates = dateMatch[0].split(/(?:-|–|—|to)/i).map(normDate);
      currentEdu.startDate = dates[0] || '';
      currentEdu.endDate = dates[1] || '';
    } else if (currentEdu && !currentEdu.institution && line.length < 100 && !isBulletLine(line)) {
      currentEdu.institution = line;
    }
  }
  confidence.education = education.length > 0 ? 'medium' : 'low';

  // ----- skills -----
  const technical: string[] = [];
  const soft: string[] = [];
  const skillLines = bodyOf('skills');
  const softLines = bodyOf('soft');
  const addSkills = (arr: string[], target: string[]) => {
    for (const line of arr) {
      if (!line.trim()) continue;
      for (const s of splitSkillList(stripBulletPrefix(line))) {
        const clean = s.replace(/\s{2,}/g, ' ').trim();
        if (clean && !target.some((t) => t.toLowerCase() === clean.toLowerCase())) target.push(clean);
      }
    }
  };
  addSkills(skillLines, technical);
  addSkills(softLines, soft);
  // Fallback: harvest taxonomy skills from the whole document when no skills section
  if (technical.length === 0) {
    for (const s of findSkillsInText(text)) {
      if (!technical.some((t) => t.toLowerCase() === s.canonical.toLowerCase())) technical.push(s.canonical);
    }
    if (technical.length > 0) notes.push('No dedicated skills section was found — technical skills were harvested from your document text. Please review.');
  }
  confidence.skills = technical.length > 0 ? 'medium' : 'low';

  // ----- projects -----
  const projects: ProjectItem[] = [];
  let currentProj: ProjectItem | null = null;
  for (const raw of bodyOf('projects')) {
    const line = raw.trim();
    if (!line) continue;
    if (isBulletLine(line)) {
      (currentProj?.bullets || (currentProj = {
        id: `prj_${projects.length + 1}_${Math.random().toString(36).slice(2, 8)}`,
        name: 'Project',
        bullets: [],
      }, currentProj).bullets).push(stripBulletPrefix(line));
      continue;
    }
    if (line.length < 90) {
      currentProj = {
        id: `prj_${projects.length + 1}_${Math.random().toString(36).slice(2, 8)}`,
        name: line.replace(/^\d+[.)]\s*/, ''),
        bullets: [],
      };
      projects.push(currentProj);
    } else if (currentProj && !currentProj.description) {
      currentProj.description = line;
    }
  }
  confidence.projects = projects.length > 0 ? 'medium' : 'low';

  // ----- certifications -----
  const certifications: { id: string; name: string; issuer?: string; year?: string }[] = [];
  for (const raw of bodyOf('certifications')) {
    const line = stripBulletPrefix(raw.trim());
    if (!line || line.length < 3) continue;
    const year = line.match(/(19|20)\d{2}/)?.[0] || '';
    const parts = line.split(/\s*[-–—,|]\s*/).filter(Boolean);
    certifications.push({
      id: `cert_${certifications.length + 1}_${Math.random().toString(36).slice(2, 8)}`,
      name: parts[0] || line,
      issuer: parts[1] || '',
      year,
    });
  }

  // ----- languages -----
  const languages: { id: string; name: string; proficiency?: string }[] = [];
  for (const raw of bodyOf('languages')) {
    const line = stripBulletPrefix(raw.trim());
    if (!line) continue;
    for (const part of splitSkillList(line)) {
      const m = part.match(/^([A-Za-z]+)\s*\(([^)]+)\)$/) || part.match(/^([A-Za-z]+)\s*[-–—:]\s*(.+)$/);
      if (m) {
        languages.push({ id: `lang_${languages.length + 1}_${Math.random().toString(36).slice(2, 8)}`, name: m[1], proficiency: m[2] });
      } else if (/^[A-Za-z]{3,}$/.test(part)) {
        languages.push({ id: `lang_${languages.length + 1}_${Math.random().toString(36).slice(2, 8)}`, name: part });
      }
    }
  }

  // ----- achievements -----
  const achievements: string[] = [];
  for (const raw of bodyOf('achievements')) {
    const line = stripBulletPrefix(raw.trim());
    if (line && line.length > 5) achievements.push(line);
  }

  const resume: ResumeData = {
    personal: {
      fullName,
      email,
      phone,
      location,
      linkedin: linkedin || '',
      github: github || '',
      portfolio: portfolio || '',
      headline: '',
    },
    summary,
    experience: meaningfulExp,
    projects,
    education,
    skills: { technical, soft },
    certifications,
    languages,
    achievements,
    customSections: [],
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    hiddenSections: [],
  };

  return { resume, confidence, rawText: text, notes };
}

export async function extractFile(file: Express.Multer.File): Promise<ExtractionResult> {
  const name = file.originalname.toLowerCase();
  let text = '';
  if (name.endsWith('.pdf')) {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(file.buffer);
    text = parsed.text;
  } else if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    text = result.value;
  } else if (name.endsWith('.doc') || name.endsWith('.txt') || name.endsWith('.rtf')) {
    text = file.buffer.toString('utf8');
    if (name.endsWith('.doc') || name.endsWith('.rtf')) {
      // legacy binary formats: best-effort ASCII salvage
      text = text.replace(/[^\x20-\x7E\n]/g, ' ');
    }
  } else {
    throw new AppError('UNSUPPORTED_FILE_TYPE', 'Unsupported file type. Please upload a PDF, DOCX or TXT file.', 400);
  }
  if (!text || text.replace(/\s/g, '').length < 40) {
    throw new AppError('PARSE_FAILED', 'We could not read this file. It may be empty, scanned, or corrupted.', 422);
  }
  return extractResumeFromText(text);
}
