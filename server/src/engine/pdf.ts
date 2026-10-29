// ATS-friendly PDF renderer (pdfkit).
//
// Follows the ATS formatting rules encoded from the MIT-licensed ResumeSkills
// methodology: single column, standard headings, simple bullets, consistent
// MM/YYYY dates, machine-selectable text, no graphics or tables.

import PDFDocument from 'pdfkit';
import { ResumeData, PageSize } from '../types';
import { ALL_SECTIONS } from '../types';

export type { PageSize };

export const PAGE_DIMENSIONS: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

export const DEFAULT_PAGE_SIZE: PageSize = 'A4';

const COLOR_INK = '#1a2233';
const COLOR_MUTED = '#4a5568';
const COLOR_RULE = '#d7dce5';

export type MarginDensity = 'compact' | 'normal' | 'spacious';

export interface RenderOpts {
  titleSuffix?: string; // e.g. job title for file naming
  template?: string;
  marginDensity?: MarginDensity;
  pageSize?: PageSize;
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

export function renderResumePdf(resume: ResumeData, opts: RenderOpts = {}): NodeJS.ReadableStream {
  const style = styleFor(opts.template);
  const density = opts.marginDensity || 'normal';
  const margin = density === 'compact' ? 36 : density === 'spacious' ? 64 : 54;

  const rawPageSize = opts.pageSize ? String(opts.pageSize).trim().toUpperCase() : DEFAULT_PAGE_SIZE;
  const pageSize: PageSize = rawPageSize === 'LETTER' ? 'LETTER' : 'A4';
  const dimensions = PAGE_DIMENSIONS[pageSize];
  const contentWidth = dimensions.width - margin * 2;
  const lineGapMultiplier = density === 'compact' ? 0.85 : density === 'spacious' ? 1.15 : 1.0;
  const sectionGapMultiplier = density === 'compact' ? 0.8 : density === 'spacious' ? 1.15 : 1.0;
  const effectiveLineGap = style.lineGap * lineGapMultiplier;
  const effectiveSectionGap = style.sectionGap * sectionGapMultiplier;

  const doc = new PDFDocument({
    size: pageSize,
    margins: { top: margin, bottom: margin, left: margin, right: margin },
    info: {
      Title: `${sanitizePdfText(resume.personal.fullName) || 'Resume'}${opts.titleSuffix ? ` — ${sanitizePdfText(opts.titleSuffix)}` : ''}`,
      Author: sanitizePdfText(resume.personal.fullName) || 'Curevo AI',
      Creator: 'Curevo AI',
    },
    bufferPages: true,
  });

  const p = resume.personal;
  const visible: string[] = (resume.sectionOrder && resume.sectionOrder.length > 0 ? resume.sectionOrder : [...ALL_SECTIONS]).filter(
    (k) => !(resume.hiddenSections || []).includes(k)
  );

  const heading = (title: string) => {
    doc.moveDown(effectiveSectionGap);
    const y = doc.y;
    doc.font(style.headingFont).fontSize(style.headingSize).fillColor(style.accentColor).text(
      style.capsHeadings ? sanitizePdfText(title).toUpperCase() : sanitizePdfText(title),
      margin,
      y,
      { characterSpacing: style.capsHeadings ? 1.2 : 0.2 }
    );
    doc
      .moveTo(margin, doc.y + 3)
      .lineTo(margin + contentWidth, doc.y + 3)
      .lineWidth(0.75)
      .strokeColor(style.ruleColor)
      .stroke();
    doc.moveDown(0.35);
  };

  const bodyText = (text: string, textOpts: PDFKit.Mixins.TextOptions = {}) => {
    doc.font(style.bodyFont).fontSize(style.bodySize).fillColor(COLOR_INK).text(sanitizePdfText(text), margin, doc.y, {
      width: contentWidth,
      lineGap: effectiveLineGap,
      ...textOpts,
    });
  };

  const bullet = (text: string) => {
    const clean = sanitizePdfText(text.replace(/\s+\u2022\s+/g, ' ').trim());
    doc.font(style.bodyFont).fontSize(style.bodySize).fillColor(COLOR_INK);
    const bx = margin + 4;
    doc.text('\u2022', margin, doc.y, { continued: false, width: 12 });
    doc.text(clean, bx + 8, doc.y, { width: contentWidth - 12, lineGap: effectiveLineGap });
  };

  const twoColRow = (left: string, leftBold: boolean, right: string) => {
    const y = doc.y;
    doc.font(leftBold ? style.headingFont : style.bodyFont).fontSize(style.bodySize + 0.5).fillColor(COLOR_INK);
    doc.text(sanitizePdfText(left), margin, y, { width: contentWidth * 0.72, continued: false });
    const afterLeft = doc.y;
    doc.font(style.bodyFont).fontSize(style.bodySize - 0.5).fillColor(COLOR_MUTED);
    doc.text(sanitizePdfText(right), margin + contentWidth * 0.72, y, { width: contentWidth * 0.28, align: 'right' });
    doc.y = Math.max(afterLeft, doc.y);
  };

  // ---- Header ----
  const name = sanitizePdfText(p.fullName || 'Your Name');
  doc.font(style.nameFont).fontSize(style.nameSize).fillColor(style.accentColor).text(name, margin, margin, { width: contentWidth });
  doc.moveDown(0.15);
  const contactBits: string[] = [];
  if (p.headline) contactBits.push(p.headline);
  if (p.email) contactBits.push(p.email);
  if (p.phone) contactBits.push(p.phone);
  if (p.location) contactBits.push(p.location);
  doc.font(style.bodyFont).fontSize(style.bodySize).fillColor(COLOR_MUTED).text(sanitizePdfText(contactBits.filter(Boolean).join('  |  ')), {
    width: contentWidth,
  });
  const linkBits = [p.linkedin, p.github, p.portfolio].filter(Boolean) as string[];
  if (linkBits.length > 0) {
    doc.moveDown(0.1);
    doc.font(style.bodyFont).fontSize(style.bodySize - 0.5).fillColor('#2b6cb0').text(sanitizePdfText(linkBits.join('  |  ')), { width: contentWidth });
  }

  // ---- Sections ----
  for (const key of visible) {
    switch (key) {
      case 'summary': {
        if (!resume.summary?.trim()) break;
        heading('Professional Summary');
        bodyText(resume.summary.trim());
        break;
      }
      case 'experience': {
        if (resume.experience.length === 0) break;
        heading('Professional Experience');
        for (const e of resume.experience) {
          twoColRow(e.title || e.company, true, formatDateRange(e.startDate, e.endDate, e.current));
          if (e.title && e.company) {
            doc.font(style.bodyFont).fontSize(style.bodySize).fillColor(COLOR_MUTED).text(`${sanitizePdfText(e.company)}${e.location ? `, ${sanitizePdfText(e.location)}` : ''}`, {
              width: contentWidth,
            });
          }
          doc.moveDown(0.15);
          for (const b of e.bullets.filter((x) => x.trim())) bullet(b);
          doc.moveDown(0.35);
        }
        break;
      }
      case 'projects': {
        if (resume.projects.length === 0) break;
        heading('Projects');
        for (const pr of resume.projects) {
          const tech = pr.tech && pr.tech.length > 0 ? `  |  ${pr.tech.join(', ')}` : '';
          twoColRow(pr.name || 'Project', true, pr.link || '');
          if (pr.description?.trim()) bodyText(pr.description.trim());
          if (tech) doc.font('Helvetica-Oblique').fontSize(style.bodySize - 0.5).fillColor(COLOR_MUTED).text(sanitizePdfText(tech.trim()), { width: contentWidth });
          for (const b of pr.bullets.filter((x) => x.trim())) bullet(b);
          doc.moveDown(0.3);
        }
        break;
      }
      case 'skills': {
        const tech = resume.skills.technical.filter((s) => s.trim());
        const soft = resume.skills.soft.filter((s) => s.trim());
        if (tech.length === 0 && soft.length === 0) break;
        heading('Skills');
        if (tech.length > 0) {
          doc.font(style.headingFont).fontSize(style.bodySize).fillColor(COLOR_INK).text('Technical Skills: ', {
            width: contentWidth,
            continued: true,
          });
          doc.font(style.bodyFont).text(sanitizePdfText(tech.join(', ')), { width: contentWidth });
          doc.moveDown(0.15);
        }
        if (soft.length > 0) {
          doc.font(style.headingFont).fontSize(style.bodySize).fillColor(COLOR_INK).text('Soft Skills: ', {
            width: contentWidth,
            continued: true,
          });
          doc.font(style.bodyFont).text(sanitizePdfText(soft.join(', ')), { width: contentWidth });
        }
        break;
      }
      case 'education': {
        if (resume.education.length === 0) break;
        heading('Education');
        for (const ed of resume.education) {
          twoColRow(`${ed.degree}${ed.field ? `, ${ed.field}` : ''}`, true, formatDateRange(ed.startDate, ed.endDate, false));
          doc.font(style.bodyFont).fontSize(style.bodySize).fillColor(COLOR_MUTED).text(
            sanitizePdfText([ed.institution, ed.grade].filter(Boolean).join('  |  ')),
            { width: contentWidth }
          );
          doc.moveDown(0.3);
        }
        break;
      }
      case 'certifications': {
        if (resume.certifications.length === 0) break;
        heading('Certifications');
        for (const c of resume.certifications) {
          bullet([c.name, c.issuer, c.year].filter(Boolean).join(' — '));
        }
        doc.moveDown(0.2);
        break;
      }
      case 'languages': {
        if (resume.languages.length === 0) break;
        heading('Languages');
        bodyText(resume.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join(', '));
        break;
      }
      case 'achievements': {
        if (resume.achievements.length === 0) break;
        heading('Achievements');
        for (const a of resume.achievements.filter((x) => x.trim())) bullet(a);
        doc.moveDown(0.2);
        break;
      }
      default: {
        // Custom sections (Publications, Volunteering, Interests, …) — same
        // heading/bullet treatment, fully ATS-safe.
        const custom = (resume.customSections || []).find((c) => c.id === key);
        if (!custom || custom.bullets.filter((b) => b.trim()).length === 0) break;
        heading(custom.title);
        for (const b of custom.bullets.filter((x) => x.trim())) bullet(b);
        doc.moveDown(0.2);
        break;
      }
    }
  }

  doc.end();
  return doc;
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
  const doc = new PDFDocument({
    size: normSize,
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    info: { Title: 'Cover letter', Author: sanitizePdfText(ownerName) || 'Curevo AI', Creator: 'Curevo AI' },
  });
  doc.font('Helvetica').fontSize(11).fillColor('#1a2233');
  doc.text(sanitizePdfText(letter.greeting), { lineGap: 3 });
  doc.moveDown(0.8);
  for (const paragraph of letter.paragraphs) {
    doc.text(sanitizePdfText(paragraph), { lineGap: 3 });
    doc.moveDown(0.8);
  }
  doc.moveDown(0.6);
  doc.text(sanitizePdfText(letter.closing));
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
