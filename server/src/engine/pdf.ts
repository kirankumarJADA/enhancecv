// ATS-friendly PDF renderer (pdfkit).
//
// Follows the ATS formatting rules encoded from the MIT-licensed ResumeSkills
// methodology: single column, standard headings, simple bullets, consistent
// MM/YYYY dates, machine-selectable text, no graphics or tables.

import PDFDocument from 'pdfkit';
import { ResumeData } from '../types';
import { ALL_SECTIONS } from '../types';

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 54; // 0.75 inch
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLOR_INK = '#1a2233';
const COLOR_MUTED = '#4a5568';
const COLOR_RULE = '#d7dce5';

interface RenderOpts {
  titleSuffix?: string; // e.g. job title for file naming
  template?: string;
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
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: {
      Title: `${resume.personal.fullName || 'Resume'}${opts.titleSuffix ? ` — ${opts.titleSuffix}` : ''}`,
      Author: resume.personal.fullName || 'EnhanceCV',
      Creator: 'EnhanceCV',
    },
    bufferPages: true,
  });

  const p = resume.personal;
  const visible: string[] = (resume.sectionOrder && resume.sectionOrder.length > 0 ? resume.sectionOrder : [...ALL_SECTIONS]).filter(
    (k) => !(resume.hiddenSections || []).includes(k)
  );

  const heading = (title: string) => {
    doc.moveDown(style.sectionGap);
    const y = doc.y;
    doc.font(style.headingFont).fontSize(style.headingSize).fillColor(style.accentColor).text(
      style.capsHeadings ? title.toUpperCase() : title,
      MARGIN,
      y,
      { characterSpacing: style.capsHeadings ? 1.2 : 0.2 }
    );
    doc
      .moveTo(MARGIN, doc.y + 3)
      .lineTo(MARGIN + CONTENT_WIDTH, doc.y + 3)
      .lineWidth(0.75)
      .strokeColor(style.ruleColor)
      .stroke();
    doc.moveDown(0.35);
  };

  const bodyText = (text: string, opts: PDFKit.Mixins.TextOptions = {}) => {
    doc.font(style.bodyFont).fontSize(style.bodySize).fillColor(COLOR_INK).text(text, MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      lineGap: style.lineGap,
      ...opts,
    });
  };

  const bullet = (text: string) => {
    const clean = text.replace(/\s+\u2022\s+/g, ' ').trim();
    doc.font(style.bodyFont).fontSize(style.bodySize).fillColor(COLOR_INK);
    const bx = MARGIN + 4;
    doc.text('\u2022', MARGIN, doc.y, { continued: false, width: 12 });
    doc.text(clean, bx + 8, doc.y, { width: CONTENT_WIDTH - 12, lineGap: style.lineGap });
  };

  const twoColRow = (left: string, leftBold: boolean, right: string) => {
    const y = doc.y;
    doc.font(leftBold ? style.headingFont : style.bodyFont).fontSize(style.bodySize + 0.5).fillColor(COLOR_INK);
    doc.text(left, MARGIN, y, { width: CONTENT_WIDTH * 0.72, continued: false });
    const afterLeft = doc.y;
    doc.font(style.bodyFont).fontSize(style.bodySize - 0.5).fillColor(COLOR_MUTED);
    doc.text(right, MARGIN + CONTENT_WIDTH * 0.72, y, { width: CONTENT_WIDTH * 0.28, align: 'right' });
    doc.y = Math.max(afterLeft, doc.y);
  };

  // ---- Header ----
  const name = p.fullName || 'Your Name';
  doc.font(style.nameFont).fontSize(style.nameSize).fillColor(style.accentColor).text(name, MARGIN, MARGIN, { width: CONTENT_WIDTH });
  doc.moveDown(0.15);
  const contactBits: string[] = [];
  if (p.headline) contactBits.push(p.headline);
  if (p.email) contactBits.push(p.email);
  if (p.phone) contactBits.push(p.phone);
  if (p.location) contactBits.push(p.location);
  doc.font(style.bodyFont).fontSize(style.bodySize).fillColor(COLOR_MUTED).text(contactBits.filter(Boolean).join('  |  '), {
    width: CONTENT_WIDTH,
  });
  const linkBits = [p.linkedin, p.github, p.portfolio].filter(Boolean) as string[];
  if (linkBits.length > 0) {
    doc.moveDown(0.1);
    doc.font(style.bodyFont).fontSize(style.bodySize - 0.5).fillColor('#2b6cb0').text(linkBits.join('  |  '), { width: CONTENT_WIDTH });
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
            doc.font(style.bodyFont).fontSize(style.bodySize).fillColor(COLOR_MUTED).text(`${e.company}${e.location ? `, ${e.location}` : ''}`, {
              width: CONTENT_WIDTH,
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
          if (tech) doc.font('Helvetica-Oblique').fontSize(style.bodySize - 0.5).fillColor(COLOR_MUTED).text(tech.trim(), { width: CONTENT_WIDTH });
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
            width: CONTENT_WIDTH,
            continued: true,
          });
          doc.font(style.bodyFont).text(tech.join(', '), { width: CONTENT_WIDTH });
          doc.moveDown(0.15);
        }
        if (soft.length > 0) {
          doc.font(style.headingFont).fontSize(style.bodySize).fillColor(COLOR_INK).text('Soft Skills: ', {
            width: CONTENT_WIDTH,
            continued: true,
          });
          doc.font(style.bodyFont).text(soft.join(', '), { width: CONTENT_WIDTH });
        }
        break;
      }
      case 'education': {
        if (resume.education.length === 0) break;
        heading('Education');
        for (const ed of resume.education) {
          twoColRow(`${ed.degree}${ed.field ? `, ${ed.field}` : ''}`, true, formatDateRange(ed.startDate, ed.endDate, false));
          doc.font(style.bodyFont).fontSize(style.bodySize).fillColor(COLOR_MUTED).text(
            [ed.institution, ed.grade].filter(Boolean).join('  |  '),
            { width: CONTENT_WIDTH }
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
  const parts = [name, role ? role.replace(/[^a-zA-Z0-9]+/g, '_') : null, 'EnhanceCV'].filter(Boolean);
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

export function renderCoverLetterPdf(letter: CoverLetterContent, ownerName: string): NodeJS.ReadableStream {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    info: { Title: 'Cover letter', Author: ownerName || 'Curevo AI', Creator: 'Curevo AI' },
  });
  doc.font('Helvetica').fontSize(11).fillColor('#1a2233');
  doc.text(letter.greeting, { lineGap: 3 });
  doc.moveDown(0.8);
  for (const paragraph of letter.paragraphs) {
    doc.text(paragraph, { lineGap: 3 });
    doc.moveDown(0.8);
  }
  doc.moveDown(0.6);
  doc.text(letter.closing);
  doc.end();
  return doc;
}
