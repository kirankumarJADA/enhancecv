// Curevo AI's canonical resume extraction pipeline.
//
// Ingestion (PDF via pdfjs-dist with text-item coordinates, DOCX via mammoth's
// HTML, TXT as lines) produces a single ParsedLine[] stream; the rest of the
// pipeline is deterministic: section detection -> field/entity extraction ->
// validation -> normalized ResumeData. There is exactly one extraction
// pipeline — every caller (imports, master upload) goes through here, and the
// result is always shown to the user for review before becoming a Master CV.

import {
  EducationItem,
  ExperienceItem,
  ProjectItem,
  ResumeData,
  SectionKey,
  DEFAULT_SECTION_ORDER,
} from '../types';
import { AppError } from '../middleware/errors';
import { isBulletLine, normalizeWhitespace, stripBulletPrefix } from '../lib/text';
import { ParsedLine, SectionSpan, ExtractionMeta, Confidence } from './extraction/types';
import { splitSections } from './extraction/sections';
import {
  makeId,
  parseContact,
  parseExperience,
  parseEducation,
  parseSkills,
  parseProjects,
  parseCertifications,
  parseInterestLines,
  parseLanguages,
  parseAchievements,
  parseSummary,
} from './extraction/fields';
import { validateExtraction } from './extraction/validate';
import { readPdfLayout } from './extraction/pdfText';
import { docxHtmlToLines } from './extraction/docxText';

export interface ExtractionResult {
  resume: ResumeData;
  confidence: Record<string, Confidence>;
  rawText: string;
  notes: string[];
  meta?: ExtractionMeta;
}

const CORE_SECTION_KEYS: Record<string, SectionKey> = {
  summary: 'summary',
  experience: 'experience',
  projects: 'projects',
  skills: 'skills',
  education: 'education',
  certifications: 'certifications',
  languages: 'languages',
  achievements: 'achievements',
};

const CUSTOM_BY_PART: Record<string, string> = {
  interests: 'custom_interests',
  publications: 'custom_publications',
  volunteering: 'custom_volunteering',
};

function buildSectionOrder(sections: SectionSpan[], customIds: string[]): SectionKey[] {
  const order: string[] = [];
  const contentful = new Set(sections.filter((s) => s.lines.length > 0 && s.key !== 'header').map((s) => s.key));
  // Detected sections keep their document order; combined headings such as
  // "CERTIFICATIONS & INTERESTS" contribute each of their parts.
  for (const span of sections) {
    if (!contentful.has(span.key)) continue;
    for (const part of span.key.split('+')) {
      const core = CORE_SECTION_KEYS[part];
      if (core && !order.includes(core)) order.push(core);
    }
  }
  for (const span of sections) {
    if (!contentful.has(span.key)) continue;
    for (const part of span.key.split('+')) {
      const id = CUSTOM_BY_PART[part];
      if (id && customIds.includes(id) && !order.includes(id)) order.push(id);
    }
  }
  // Core sections the document did not contain fall back to the default order
  // so the editor still receives a complete, valid sectionOrder.
  for (const key of DEFAULT_SECTION_ORDER) {
    if (!order.includes(key)) order.push(key);
  }
  return order as SectionKey[];
}

function linesFromText(rawText: string): ParsedLine[] {
  return normalizeWhitespace(rawText)
    .split('\n')
    .map((l) => ({ text: l.replace(/\s+$/, '') }))
    .filter((l) => l.text.trim().length > 0);
}

function textLength(lines: ParsedLine[]): number {
  return lines.reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0);
}

/** The single downstream pipeline every ingestion path feeds into. */
export function extractFromLines(input: ParsedLine[], meta: ExtractionMeta): ExtractionResult {
  // Stable reading-order index for every line, whatever the source format.
  const lines = input.map((l, i) => (l.index === undefined ? { ...l, index: i } : l));
  const sections = splitSections(lines);
  const fullText = lines.map((l) => l.text).join('\n');

  const { contact, warnings: contactWarnings } = parseContact(sections, fullText);

  const expWarnings: string[] = [];
  const rawExperience = parseExperience(sections, expWarnings);
  const experience: ExperienceItem[] = rawExperience.map((e, i) => ({
    id: makeId('exp', i + 1),
    company: e.company,
    title: e.title,
    location: e.location,
    startDate: e.startDate,
    endDate: e.endDate || (e.current ? 'Present' : ''),
    current: e.current,
    bullets: e.bullets,
    dateDisplay: e.dateDisplay,
  }));

  const eduWarnings: string[] = [];
  const rawEducation = parseEducation(sections, eduWarnings);
  const education: EducationItem[] = rawEducation.map((e, i) => ({
    id: makeId('edu', i + 1),
    institution: e.institution,
    degree: e.degree,
    field: e.field,
    startDate: e.startDate,
    endDate: e.endDate,
    grade: e.grade,
    dateDisplay: e.dateDisplay,
  }));

  const skillsWarnings: string[] = [];
  const skills = parseSkills(sections, fullText, skillsWarnings);

  const projects: ProjectItem[] = parseProjects(sections).map((p, i) => ({
    id: makeId('prj', i + 1),
    name: p.name,
    link: p.link,
    description: p.description,
    bullets: p.bullets,
    tech: p.tech,
  }));

  const certifications = parseCertifications(sections);
  const interestLines = parseInterestLines(sections);
  const certificationItems = certifications.map((c, i) => ({
    id: makeId('cert', i + 1),
    name: c.name,
    issuer: c.issuer,
    year: c.year,
  }));

  const languages = parseLanguages(sections).map((l, i) => ({
    id: makeId('lang', i + 1),
    name: l.name,
    proficiency: l.proficiency,
  }));

  const achievements = parseAchievements(sections);
  const summary = parseSummary(sections);

  // Interests become a custom section (never mixed into certifications), and
  // publications / volunteering map to custom sections too.
  const customSections: { id: string; title: string; bullets: string[] }[] = [];
  const interestBullets = interestLines
    .flatMap((l) => stripBulletPrefix(l).split(/\s*,\s*/))
    .map((t) => t.trim())
    .filter(Boolean);
  if (interestBullets.length > 0) {
    customSections.push({ id: 'custom_interests', title: 'Interests', bullets: interestBullets });
  }
  for (const key of ['publications', 'volunteering'] as const) {
    const bullets = sections
      .filter((s) => s.key === key)
      .flatMap((s) => s.lines)
      .map((l) => stripBulletPrefix(l.text.trim()))
      .filter(Boolean);
    if (bullets.length > 0) {
      customSections.push({
        id: `custom_${key}`,
        title: key.charAt(0).toUpperCase() + key.slice(1),
        bullets,
      });
    }
  }

  const resume: ResumeData = {
    personal: {
      fullName: contact.fullName,
      email: contact.email,
      phone: contact.phone,
      location: contact.location,
      linkedin: contact.linkedin,
      github: contact.github,
      portfolio: contact.portfolio,
      headline: '',
      otherLinks: contact.otherLinks,
    },
    summary,
    experience,
    projects,
    education,
    skills,
    certifications: certificationItems,
    languages,
    achievements,
    customSections,
    sectionOrder: buildSectionOrder(sections, customSections.map((c) => c.id)),
    hiddenSections: [],
  };

  const sectionKeys = new Set(sections.filter((s) => s.lines.length > 0).map((s) => s.key));
  const validation = validateExtraction({
    hasName: Boolean(contact.fullName),
    hasEmail: Boolean(contact.email),
    hasPhone: Boolean(contact.phone),
    summary,
    experience: rawExperience,
    education: rawEducation,
    technicalSkills: skills.technical,
    projects: projects.length,
    certifications: certificationItems.length,
    sectionKeys,
    anyHeadingFound: sections.some((s) => s.key !== 'header'),
    flattenedTwoColumn: meta.flattenedTwoColumn,
    meta,
  });

  const notes = [...new Set([...contactWarnings, ...expWarnings, ...eduWarnings, ...skillsWarnings, ...validation.warnings])];
  meta.sectionOrderDetected = resume.sectionOrder;
  meta.warnings = notes;

  return { resume, confidence: validation.confidence, rawText: fullText, notes, meta };
}

/**
 * Flattened two-column detection (F7): genuine single-column TXT resumes
 * rarely contain wide mid-line whitespace runs; text exports of two-column
 * PDFs are full of them. Detection happens on the RAW text because
 * normalizeWhitespace collapses the gaps before lines are built.
 */
function detectFlattenedTwoColumn(rawText: string): boolean {
  const rawLines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  if (rawLines.length < 6) return false;
  const gappy = rawLines.filter((l) => /\S\s{3,}\S/.test(l));
  return gappy.length >= 3 && gappy.length / rawLines.length >= 0.25;
}

export function extractResumeFromText(rawText: string): ExtractionResult {
  const lines = linesFromText(rawText);
  return extractFromLines(lines, {
    pageCount: 1,
    multiColumn: false,
    flattenedTwoColumn: detectFlattenedTwoColumn(rawText),
    sectionOrderDetected: [],
    warnings: [],
  });
}

const MIN_CONTENT_CHARS = 40;
const PARSE_FAILED_MSG = 'We could not read this file. It may be empty, scanned, or corrupted.';

export async function extractFile(file: Express.Multer.File): Promise<ExtractionResult> {
  const name = file.originalname.toLowerCase();

  if (name.endsWith('.pdf')) {
    // pdfjs-dist is the authoritative PDF reader: text items with coordinates
    // reconstruct lines, columns and reading order. Scanned/image-only or
    // encrypted PDFs surface as a friendly PARSE_FAILED.
    let layout;
    try {
      layout = await readPdfLayout(file.buffer);
    } catch {
      throw new AppError('PARSE_FAILED', PARSE_FAILED_MSG, 422);
    }
    if (textLength(layout.lines) < MIN_CONTENT_CHARS) {
      throw new AppError('PARSE_FAILED', PARSE_FAILED_MSG, 422);
    }
    return extractFromLines(layout.lines, {
      pageCount: layout.pageCount,
      multiColumn: layout.multiColumn,
      flattenedTwoColumn: false,
      sectionOrderDetected: [],
      warnings: [],
    });
  }

  if (name.endsWith('.docx')) {
    try {
      const mammoth = await import('mammoth');
      let lines: ParsedLine[] = [];
      try {
        const html = await mammoth.convertToHtml({ buffer: file.buffer });
        lines = docxHtmlToLines(html.value || '');
      } catch {
        lines = [];
      }
      if (lines.length === 0) {
        const raw = await mammoth.extractRawText({ buffer: file.buffer });
        lines = linesFromText(raw.value || '');
      }
      if (textLength(lines) < MIN_CONTENT_CHARS) {
        throw new AppError('PARSE_FAILED', PARSE_FAILED_MSG, 422);
      }
      return extractFromLines(lines, {
        pageCount: 1,
        multiColumn: false,
        flattenedTwoColumn: false,
        sectionOrderDetected: [],
        warnings: [],
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('PARSE_FAILED', PARSE_FAILED_MSG, 422);
    }
  }

  if (name.endsWith('.doc') || name.endsWith('.txt') || name.endsWith('.rtf')) {
    let text = file.buffer.toString('utf8');
    if (name.endsWith('.doc') || name.endsWith('.rtf')) {
      // legacy binary formats: best-effort ASCII salvage
      text = text.replace(/[^\x20-\x7E\n]/g, ' ');
    }
    if (text.replace(/\s/g, '').length < MIN_CONTENT_CHARS) {
      throw new AppError('PARSE_FAILED', PARSE_FAILED_MSG, 422);
    }
    return extractResumeFromText(text);
  }

  throw new AppError('UNSUPPORTED_FILE_TYPE', 'Unsupported file type. Please upload a PDF, DOCX or TXT file.', 400);
}
