// ATS-friendly PDF renderer (pdfkit).
//
// Follows the ATS formatting rules encoded from the MIT-licensed ResumeSkills
// methodology: single column, standard headings, simple bullets, consistent
// MM/YYYY dates, machine-selectable text, no graphics or tables.

import PDFDocument from 'pdfkit';
import { ResumeData, PageSize, SectionKey, ALL_SECTIONS } from '../types';
import { cleanStrayPipes, isSpokenLanguage } from './extraction/fields';

export type { PageSize };

export const PAGE_DIMENSIONS: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

export const DEFAULT_PAGE_SIZE: PageSize = 'A4';

export const ATS_STANDARD_ORDER: SectionKey[] = [
  'summary',
  'education',
  'skills',
  'experience',
  'projects',
  'certifications',
  'languages',
  'achievements',
];

const COLOR_INK = '#1a2233';
const COLOR_MUTED = '#4a5568';
const COLOR_RULE = '#d7dce5';

export type MarginDensity = 'compact' | 'normal' | 'spacious';

export interface RenderOpts {
  titleSuffix?: string; // e.g. job title for file naming
  template?: string;
  marginDensity?: MarginDensity;
  pageSize?: PageSize;
  enforceAtsOrder?: boolean;
  preserveOrder?: boolean;
}

/**
 * Normalizes Unicode characters to standard WinAnsi / ASCII text to prevent
 * PDFKit glyph substitution errors or garbled text across ATS parsers.
 */
export function sanitizePdfText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\u00A0/g, ' ') // Non-breaking space
    .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/\u20B9/g, 'Rs. ') // Indian Rupee to standard text
    .replace(/[\u2713\u2714]/g, '\u2022 ') // Checkmarks to bullet
    .replace(/\u2014/g, ' — ') // Em dash
    .replace(/\u2013/g, ' – '); // En dash
}

/**
 * Presentation-only template presets. Every preset stays single-column with
 * standard headings and selectable text — templates vary typography, spacing
 * and heading treatment only (ATS safety is a hard constraint).
 */
interface TemplateStyle {
  nameFont: string;
  nameSize: number;
  bodyFont: string;
  headingFont: string;
  headingSize: number;
  bodySize: number;
  capsHeadings: boolean;
  ruleColor: string;
  accentColor: string;
  lineGap: number;
  sectionGap: number;
}

const TEMPLATE_STYLES: Record<string, TemplateStyle> = {
  classic: { nameFont: 'Helvetica-Bold', nameSize: 20, bodyFont: 'Helvetica', headingFont: 'Helvetica-Bold', headingSize: 10.5, bodySize: 10, capsHeadings: true, ruleColor: '#d7dce5', accentColor: '#1a2233', lineGap: 1.4, sectionGap: 0.7 },
  modern: { nameFont: 'Helvetica-Bold', nameSize: 22, bodyFont: 'Helvetica', headingFont: 'Helvetica-Bold', headingSize: 10.5, bodySize: 10, capsHeadings: true, ruleColor: '#c7d2fe', accentColor: '#3b4fd8', lineGap: 1.6, sectionGap: 0.9 },
  minimal: { nameFont: 'Helvetica', nameSize: 18, bodyFont: 'Helvetica', headingFont: 'Helvetica', headingSize: 10.5, bodySize: 10, capsHeadings: false, ruleColor: '#e4e7ec', accentColor: '#1a2233', lineGap: 1.8, sectionGap: 1.1 },
  professional: { nameFont: 'Helvetica-Bold', nameSize: 19, bodyFont: 'Helvetica', headingFont: 'Helvetica-Bold', headingSize: 10.5, bodySize: 10, capsHeadings: true, ruleColor: '#cbd5e1', accentColor: '#0f2b46', lineGap: 1.2, sectionGap: 0.6 },
  technical: { nameFont: 'Helvetica-Bold', nameSize: 19, bodyFont: 'Helvetica', headingFont: 'Helvetica-Bold', headingSize: 10, bodySize: 9.8, capsHeadings: true, ruleColor: '#d1e7dd', accentColor: '#14532d', lineGap: 1.25, sectionGap: 0.6 },
  executive: { nameFont: 'Times-Bold', nameSize: 24, bodyFont: 'Times-Roman', headingFont: 'Times-Bold', headingSize: 11.5, bodySize: 10.5, capsHeadings: true, ruleColor: '#c2b8a3', accentColor: '#3f3527', lineGap: 1.5, sectionGap: 0.9 },
};

function styleFor(templateId?: string): TemplateStyle {
  return TEMPLATE_STYLES[templateId || 'classic'] || TEMPLATE_STYLES.classic;
}

function formatDateRange(start: string, end: string, current: boolean): string {
  const s = start || '';
  const e = current ? 'Present' : end || '';
  if (!s && !e) return '';
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

function generateResumeDoc(resume: ResumeData, opts: RenderOpts = {}, tightLevel = 0): PDFKit.PDFDocument {
  const style = styleFor(opts.template);
  const density = opts.marginDensity || 'normal';
  let margin = density === 'compact' ? 36 : density === 'spacious' ? 64 : 54;
  if (tightLevel === 1) {
    margin = 36;
  } else if (tightLevel >= 2) {
    margin = 30;
  }

  const rawPageSize = opts.pageSize ? String(opts.pageSize).trim().toUpperCase() : DEFAULT_PAGE_SIZE;
  const pageSize: PageSize = rawPageSize === 'LETTER' ? 'LETTER' : 'A4';
  const dimensions = PAGE_DIMENSIONS[pageSize];
  const contentWidth = dimensions.width - margin * 2;

  let lineGapMultiplier = density === 'compact' ? 0.85 : density === 'spacious' ? 1.15 : 1.0;
  let sectionGapMultiplier = density === 'compact' ? 0.8 : density === 'spacious' ? 1.15 : 1.0;
  let bodySize = style.bodySize;
  let headingSize = style.headingSize;
  let nameSize = style.nameSize;
  let minHeadingFollower = 45;

  if (tightLevel === 1) {
    lineGapMultiplier = 0.65;
    sectionGapMultiplier = 0.5;
    bodySize = Math.min(style.bodySize, 9.5);
    headingSize = Math.min(style.headingSize, 10);
    nameSize = Math.min(style.nameSize, 18);
    minHeadingFollower = 28;
  } else if (tightLevel >= 2) {
    lineGapMultiplier = 0.5;
    sectionGapMultiplier = 0.35;
    bodySize = Math.min(style.bodySize, 9.0);
    headingSize = Math.min(style.headingSize, 9.5);
    nameSize = Math.min(style.nameSize, 16);
    minHeadingFollower = 20;
  }

  const effectiveLineGap = Math.max(0.5, style.lineGap * lineGapMultiplier);
  const effectiveSectionGap = Math.max(0.2, style.sectionGap * sectionGapMultiplier);

  const doc = new PDFDocument({
    size: pageSize,
    margins: { top: margin, bottom: margin, left: margin, right: margin },
    info: {
      Title: `${sanitizePdfText(cleanStrayPipes(resume.personal.fullName)) || 'Resume'}${opts.titleSuffix ? ` — ${sanitizePdfText(opts.titleSuffix)}` : ''}`,
      Author: sanitizePdfText(cleanStrayPipes(resume.personal.fullName)) || 'Curevo AI',
      Creator: 'Curevo AI',
    },
    bufferPages: true,
  });

  const pageBottom = dimensions.height - margin;

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > pageBottom) {
      doc.addPage();
      doc.y = margin;
      doc.x = margin;
    }
  };

  const p = resume.personal;
  const rawOrder = resume.sectionOrder && resume.sectionOrder.length > 0 ? resume.sectionOrder : ATS_STANDARD_ORDER;
  const visible: string[] = (
    opts.preserveOrder
      ? rawOrder
      : [...rawOrder].sort((a, b) => {
          const rankA = ATS_STANDARD_ORDER.indexOf(a as SectionKey);
          const rankB = ATS_STANDARD_ORDER.indexOf(b as SectionKey);
          return (rankA === -1 ? 999 : rankA) - (rankB === -1 ? 999 : rankB);
        })
  ).filter((k) => !(resume.hiddenSections || []).includes(k));

  const heading = (title: string, minFollower = minHeadingFollower) => {
    const isTop = doc.y <= margin + 1;
    if (!isTop) {
      doc.moveDown(effectiveSectionGap);
    }

    doc.font(style.headingFont).fontSize(headingSize);
    const cleanTitle = style.capsHeadings ? sanitizePdfText(title).toUpperCase() : sanitizePdfText(title);
    const textHeight = doc.heightOfString(cleanTitle, {
      width: contentWidth,
      characterSpacing: style.capsHeadings ? 1.2 : 0.2,
    });
    ensureSpace(textHeight + 8 + minFollower);

    const y = doc.y;
    doc.fillColor(style.accentColor).text(
      cleanTitle,
      margin,
      y,
      { characterSpacing: style.capsHeadings ? 1.2 : 0.2, width: contentWidth }
    );
    doc
      .moveTo(margin, doc.y + 3)
      .lineTo(margin + contentWidth, doc.y + 3)
      .lineWidth(0.75)
      .strokeColor(style.ruleColor)
      .stroke();
    doc.moveDown(tightLevel > 0 ? 0.2 : 0.35);
  };

  const bodyText = (text: string, textOpts: PDFKit.Mixins.TextOptions = {}) => {
    const clean = sanitizePdfText(cleanStrayPipes(text));
    if (!clean) return;
    doc.font(style.bodyFont).fontSize(bodySize).fillColor(COLOR_INK);
    const textHeight = doc.heightOfString(clean, {
      width: contentWidth,
      lineGap: effectiveLineGap,
      ...textOpts,
    });
    if (doc.y + Math.min(textHeight, 26) > pageBottom) {
      doc.addPage();
      doc.y = margin;
      doc.x = margin;
    }
    doc.text(clean, margin, doc.y, {
      width: contentWidth,
      lineGap: effectiveLineGap,
      ...textOpts,
    });
  };

  const bullet = (text: string) => {
    const clean = sanitizePdfText(cleanStrayPipes(text.replace(/\s+\u2022\s+/g, ' ').trim()));
    if (!clean) return;
    doc.font(style.bodyFont).fontSize(bodySize).fillColor(COLOR_INK);
    const bulletTextWidth = contentWidth - 14;
    const bulletHeight = doc.heightOfString(clean, { width: bulletTextWidth, lineGap: effectiveLineGap });
    ensureSpace(bulletHeight + 2);

    const startY = doc.y;
    const bx = margin + 4;
    doc.text('\u2022', margin, startY, { width: 12, lineGap: effectiveLineGap });
    doc.text(clean, bx + 8, startY, { width: bulletTextWidth, lineGap: effectiveLineGap });
    doc.x = margin;
  };

  const twoColRow = (left: string, leftBold: boolean, right: string) => {
    const leftWidth = contentWidth * 0.72;
    const rightWidth = contentWidth * 0.28;
    const leftFont = leftBold ? style.headingFont : style.bodyFont;
    const leftSize = bodySize + 0.5;
    const rightSize = bodySize - 0.5;

    doc.font(leftFont).fontSize(leftSize);
    const cleanLeft = sanitizePdfText(cleanStrayPipes(left));
    const leftHeight = doc.heightOfString(cleanLeft, { width: leftWidth });

    doc.font(style.bodyFont).fontSize(rightSize);
    const cleanRight = sanitizePdfText(cleanStrayPipes(right));
    const rightHeight = doc.heightOfString(cleanRight, { width: rightWidth });
    const rowHeight = Math.max(leftHeight, rightHeight);

    ensureSpace(rowHeight + (tightLevel > 0 ? 16 : 28));

    const y = doc.y;
    doc.font(leftFont).fontSize(leftSize).fillColor(COLOR_INK);
    doc.text(cleanLeft, margin, y, { width: leftWidth, continued: false });
    const afterLeft = doc.y;

    doc.font(style.bodyFont).fontSize(rightSize).fillColor(COLOR_MUTED);
    doc.text(cleanRight, margin + leftWidth, y, { width: rightWidth, align: 'right' });
    doc.y = Math.max(afterLeft, doc.y, y + rowHeight);
    doc.x = margin;
  };

  // ---- Header ----
  const name = sanitizePdfText(cleanStrayPipes(p.fullName || 'Your Name'));
  doc.font(style.nameFont).fontSize(nameSize).fillColor(style.accentColor).text(name, margin, margin, { width: contentWidth });
  doc.moveDown(0.12);

  // Standard ATS Contact Order: Name on line 1, and Location | Phone | Email | LinkedIn | GitHub on line 2
  const contactItems: string[] = [];
  if (p.location) contactItems.push(cleanStrayPipes(p.location));
  if (p.phone) contactItems.push(cleanStrayPipes(p.phone));
  if (p.email) contactItems.push(cleanStrayPipes(p.email));
  if (p.linkedin) contactItems.push(cleanStrayPipes(p.linkedin));
  if (p.github) contactItems.push(cleanStrayPipes(p.github));
  if (p.portfolio) contactItems.push(cleanStrayPipes(p.portfolio));

  const contactLine = contactItems.filter(Boolean).join('  |  ');
  if (contactLine) {
    doc.font(style.bodyFont).fontSize(bodySize - 0.5).fillColor(COLOR_MUTED).text(
      sanitizePdfText(contactLine),
      margin,
      doc.y,
      { width: contentWidth }
    );
  }

  // Deduplication tracker
  const renderedSections = new Set<string>();

  // ---- Sections ----
  for (const key of visible) {
    const normKey = key.toLowerCase();
    if (renderedSections.has(normKey)) continue;

    switch (normKey) {
      case 'summary': {
        if (!resume.summary?.trim()) break;
        renderedSections.add('summary');
        heading('Professional Summary');
        bodyText(resume.summary.trim());
        break;
      }
      case 'education': {
        if (!resume.education || resume.education.length === 0) break;
        renderedSections.add('education');
        heading('Education');
        for (const ed of resume.education) {
          const cleanDegree = cleanStrayPipes(ed.degree);
          const cleanField = cleanStrayPipes(ed.field);
          const cleanInst = cleanStrayPipes(ed.institution);
          const cleanGrade = cleanStrayPipes(ed.grade);
          const dateStr = cleanStrayPipes(
            formatDateRange(cleanStrayPipes(ed.startDate), cleanStrayPipes(ed.endDate), false) || cleanStrayPipes(ed.dateDisplay)
          );

          const degField = [cleanDegree, cleanField].filter(Boolean).join(', ');
          twoColRow(degField || cleanInst, true, dateStr);

          const instGradeParts = degField ? [cleanInst, cleanGrade] : [cleanGrade];
          const instGrade = instGradeParts.filter(Boolean).join('  |  ');
          if (instGrade) {
            doc.font(style.bodyFont).fontSize(bodySize).fillColor(COLOR_MUTED).text(
              sanitizePdfText(instGrade),
              margin,
              doc.y,
              { width: contentWidth }
            );
          }
          doc.moveDown(tightLevel > 0 ? 0.16 : 0.3);
        }
        break;
      }
      case 'skills': {
        if (renderedSections.has('skills')) break;
        const hasCategories = Boolean(resume.skills?.categories && resume.skills.categories.length > 0);
        const tech = (resume.skills?.technical || []).map(cleanStrayPipes).filter(Boolean);
        const soft = (resume.skills?.soft || []).map(cleanStrayPipes).filter(Boolean);
        if (!hasCategories && tech.length === 0 && soft.length === 0) break;

        renderedSections.add('skills');
        heading('Technical Skills');

        if (hasCategories) {
          for (const cat of resume.skills.categories!) {
            const catItems = (cat.items || []).map(cleanStrayPipes).filter(Boolean);
            if (catItems.length === 0) continue;
            doc.font(style.headingFont).fontSize(bodySize).fillColor(COLOR_INK).text(`${sanitizePdfText(cleanStrayPipes(cat.category))}: `, {
              width: contentWidth,
              continued: true,
            });
            doc.font(style.bodyFont).text(sanitizePdfText(catItems.join(', ')), { width: contentWidth });
            doc.moveDown(tightLevel > 0 ? 0.08 : 0.12);
          }
          if (soft.length > 0 && !resume.skills.categories!.some((c) => c.category.toLowerCase().includes('soft'))) {
            doc.font(style.headingFont).fontSize(bodySize).fillColor(COLOR_INK).text('Soft Skills: ', {
              width: contentWidth,
              continued: true,
            });
            doc.font(style.bodyFont).text(sanitizePdfText(soft.join(', ')), { width: contentWidth });
            doc.moveDown(tightLevel > 0 ? 0.08 : 0.12);
          }
        } else {
          if (tech.length > 0) {
            doc.font(style.headingFont).fontSize(bodySize).fillColor(COLOR_INK).text('Technical Skills: ', {
              width: contentWidth,
              continued: true,
            });
            doc.font(style.bodyFont).text(sanitizePdfText(tech.join(', ')), { width: contentWidth });
            doc.moveDown(tightLevel > 0 ? 0.08 : 0.12);
          }
          if (soft.length > 0) {
            doc.font(style.headingFont).fontSize(bodySize).fillColor(COLOR_INK).text('Soft Skills: ', {
              width: contentWidth,
              continued: true,
            });
            doc.font(style.bodyFont).text(sanitizePdfText(soft.join(', ')), { width: contentWidth });
            doc.moveDown(tightLevel > 0 ? 0.08 : 0.12);
          }
        }
        break;
      }
      case 'experience': {
        if (!resume.experience || resume.experience.length === 0) break;
        renderedSections.add('experience');
        heading('Professional Experience');
        for (const e of resume.experience) {
          twoColRow(cleanStrayPipes(e.title || e.company), true, formatDateRange(e.startDate, e.endDate, e.current));
          if (e.title && e.company) {
            const compLoc = [cleanStrayPipes(e.company), cleanStrayPipes(e.location)].filter(Boolean).join(', ');
            doc.font(style.bodyFont).fontSize(bodySize).fillColor(COLOR_MUTED).text(
              sanitizePdfText(compLoc),
              margin,
              doc.y,
              { width: contentWidth }
            );
          }
          doc.moveDown(0.12);
          for (const b of e.bullets.map(cleanStrayPipes).filter(Boolean)) bullet(b);
          doc.moveDown(tightLevel > 0 ? 0.18 : 0.35);
        }
        break;
      }
      case 'projects': {
        if (!resume.projects || resume.projects.length === 0) break;
        renderedSections.add('projects');
        heading('Projects');
        for (const pr of resume.projects) {
          const tech = pr.tech && pr.tech.length > 0 ? `  |  ${pr.tech.map(cleanStrayPipes).join(', ')}` : '';
          twoColRow(cleanStrayPipes(pr.name || 'Project'), true, cleanStrayPipes(pr.link || ''));
          if (pr.description?.trim()) bodyText(cleanStrayPipes(pr.description.replace(/\s+/g, ' ').trim()));
          if (tech) {
            doc.font('Helvetica-Oblique').fontSize(bodySize - 0.5).fillColor(COLOR_MUTED).text(
              sanitizePdfText(cleanStrayPipes(tech.trim())),
              margin,
              doc.y,
              { width: contentWidth }
            );
          }
          for (const b of pr.bullets.map(cleanStrayPipes).filter(Boolean)) bullet(b);
          doc.moveDown(tightLevel > 0 ? 0.16 : 0.3);
        }
        break;
      }
      case 'certifications': {
        if (!resume.certifications || resume.certifications.length === 0) break;
        renderedSections.add('certifications');
        heading('Certifications');
        for (const c of resume.certifications) {
          bullet([cleanStrayPipes(c.name), cleanStrayPipes(c.issuer), cleanStrayPipes(c.year)].filter(Boolean).join(' — '));
        }
        doc.moveDown(tightLevel > 0 ? 0.10 : 0.2);
        break;
      }
      case 'languages': {
        if (renderedSections.has('languages')) break;
        if (!resume.languages || resume.languages.length === 0) break;

        // Strictly filter to genuine human spoken languages (reject Shell, YAML, Frameworks, JPA, etc.)
        const validLanguages = resume.languages.filter((l) => isSpokenLanguage(l.name, l.proficiency));
        if (validLanguages.length === 0) break;

        renderedSections.add('languages');
        heading('Languages');
        bodyText(validLanguages.map((l) => (l.proficiency ? `${cleanStrayPipes(l.name)} (${cleanStrayPipes(l.proficiency)})` : cleanStrayPipes(l.name))).join(', '));
        break;
      }
      case 'achievements': {
        if (!resume.achievements || resume.achievements.length === 0) break;
        renderedSections.add('achievements');
        heading('Achievements');
        for (const a of resume.achievements.map(cleanStrayPipes).filter(Boolean)) bullet(a);
        doc.moveDown(tightLevel > 0 ? 0.10 : 0.2);
        break;
      }
      default: {
        const custom = (resume.customSections || []).find((c) => c.id === key);
        if (!custom || custom.bullets.map(cleanStrayPipes).filter(Boolean).length === 0) break;
        renderedSections.add(key);
        heading(cleanStrayPipes(custom.title));
        for (const b of custom.bullets.map(cleanStrayPipes).filter(Boolean)) bullet(b);
        doc.moveDown(tightLevel > 0 ? 0.10 : 0.2);
        break;
      }
    }
  }

  return doc;
}

export function renderResumePdf(resume: ResumeData, opts: RenderOpts = {}): NodeJS.ReadableStream {
  if (opts.marginDensity === 'compact') {
    const doc = generateResumeDoc(resume, opts, 1);
    doc.end();
    return doc;
  }

  const trialDoc = generateResumeDoc(resume, opts, 0);
  const pageCount = trialDoc.bufferedPageRange().count;

  // A resume with 4+ experience entries or 11+ experience bullets is an established multi-page candidate profile
  const isMultiPageProfile =
    (resume.experience && resume.experience.length >= 4) ||
    (resume.experience && resume.experience.reduce((n, e) => n + (e.bullets?.length || 0), 0) >= 11);

  // Smart Single-Page Fit:
  // If a standard candidate profile overflows onto page 2 (pageCount > 1),
  // dynamically tighten spacing so it fits cleanly onto exactly 1 full page (numPages === 1).
  if (!isMultiPageProfile && pageCount > 1) {
    const tightDoc = generateResumeDoc(resume, opts, 1);
    const tightCount = tightDoc.bufferedPageRange().count;
    if (tightCount === 1) {
      tightDoc.end();
      return tightDoc;
    }
    // Level 2 ultra-tightening
    const ultraDoc = generateResumeDoc(resume, opts, 2);
    const ultraCount = ultraDoc.bufferedPageRange().count;
    if (ultraCount === 1) {
      ultraDoc.end();
      return ultraDoc;
    }
    ultraDoc.end();
    tightDoc.end();
    return tightDoc;
  }

  trialDoc.end();
  return trialDoc;
}

export function pdfFileName(resume: ResumeData, role?: string): string {
  const name = (resume.personal.fullName || 'Resume').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  const parts = [name, role ? role.replace(/[^a-zA-Z0-9]+/g, '_') : null, 'Curevo_AI'].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}

// ---------------------------------------------------------------------------
// Cover letter PDF (plain, ATS-safe, selectable text)
// ---------------------------------------------------------------------------

export interface CoverLetterContent {
  greeting: string;
  paragraphs: string[];
  closing: string;
}

export function renderCoverLetterPdf(letter: CoverLetterContent, ownerName: string, pageSize: PageSize = 'A4'): NodeJS.ReadableStream {
  const normSize: PageSize = String(pageSize).trim().toUpperCase() === 'LETTER' ? 'LETTER' : 'A4';
  const margin = 72;
  const doc = new PDFDocument({
    size: normSize,
    margins: { top: margin, bottom: margin, left: margin, right: margin },
    info: { Title: 'Cover letter', Author: sanitizePdfText(ownerName) || 'Curevo AI', Creator: 'Curevo AI' },
    bufferPages: true,
  });

  const contentWidth = doc.page.width - margin * 2;
  const pageBottom = doc.page.height - margin;

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > pageBottom) {
      doc.addPage();
      doc.y = margin;
      doc.x = margin;
    }
  };

  doc.font('Helvetica').fontSize(11).fillColor('#1a2233');
  doc.text(sanitizePdfText(letter.greeting), margin, doc.y, { width: contentWidth, lineGap: 3 });
  doc.moveDown(0.8);

  for (const paragraph of letter.paragraphs) {
    const pText = sanitizePdfText(paragraph);
    if (!pText) continue;
    const pHeight = doc.heightOfString(pText, { width: contentWidth, lineGap: 3 });
    // Keep at least the beginning of paragraph from breaking right at page bottom
    ensureSpace(Math.min(pHeight, 36));
    doc.text(pText, margin, doc.y, { width: contentWidth, lineGap: 3 });
    doc.moveDown(0.8);
  }

  const closingText = sanitizePdfText(letter.closing);
  if (closingText) {
    const closingHeight = doc.heightOfString(closingText, { width: contentWidth, lineGap: 2 });
    // Prevent orphan closing / sign-off on an isolated line
    ensureSpace(closingHeight + 16);
    doc.moveDown(0.6);
    doc.text(closingText, margin, doc.y, { width: contentWidth, lineGap: 2 });
  }

  doc.end();
  return doc;
}

export function coverLetterFileName(candidateName: string, role?: string, company?: string): string {
  const name = (candidateName || 'Cover_Letter').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  const parts = [
    name,
    role ? role.replace(/[^a-zA-Z0-9]+/g, '_') : null,
    company ? company.replace(/[^a-zA-Z0-9]+/g, '_') : null,
    'Cover_Letter',
    'Curevo_AI',
  ].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}
