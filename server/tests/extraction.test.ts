// Regression suite for the layout-aware extraction engine, anchored on the
// real reference resume (two virtual internships) that previously failed to
// parse ("No work experience detected", portfolio became gmail.com, etc.).

import { describe, it, expect } from 'vitest';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractResumeFromText, extractFile } from '../src/engine/extract';
import { findDateRange, normalizeDate } from '../src/engine/extraction/dates';
import { extractLinks, extractPhoneFromLine } from '../src/engine/extraction/fields';
import { docxHtmlToLines } from '../src/engine/extraction/docxText';
import { AppError } from '../src/middleware/errors';

const REFERENCE_TXT = readFileSync(join(__dirname, 'fixtures', 'reference-resume.txt'), 'utf8');

function asFile(name: string, buffer: Buffer): Express.Multer.File {
  return { originalname: name, buffer, fieldname: 'file', encoding: '7bit', mimetype: 'application/octet-stream', size: buffer.length, stream: undefined as never, destination: '', filename: '', path: '' };
}

async function pdfToBuffer(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  draw(doc);
  doc.end();
  return done;
}

function drawReferenceResume(doc: PDFKit.PDFDocument): void {
  const H = (t: string) => doc.font('Helvetica-Bold').fontSize(11).text(t);
  const B = (t: string) => doc.font('Helvetica').fontSize(10).text(t);
  doc.font('Helvetica-Bold').fontSize(16).text('Aarav Sharma');
  doc.font('Helvetica').fontSize(10);
  doc.text('+91 98765 43210 | aarav.sharma@gmail.com');
  doc.text('linkedin.com/in/aaravsharma | github.com/aaravsharma | https://aaravsharma.dev');
  doc.moveDown(0.5);
  H('SUMMARY');
  B('Data science student with hands-on virtual internship experience across ML, cloud, and analytics.');
  H('EXPERIENCE');
  B('Data Science Virtual Intern');
  B('Altair (via AICTE NEAT & EduSkills)');
  B('Remote');
  B('Jan 2025 – Mar 2025');
  B('• Completed 240-hour Google AI-ML & Altair Data Science Master Virtual Internship with mentorship.');
  B('• Applied Google AI-ML techniques and Altair tools to real-world scenario-based exercises.');
  B('Cloud Virtual Intern');
  B('AICTE NEAT (AWS Academy Curriculum, EduSkills)');
  B('Remote');
  B('Apr 2024 – Jun 2024');
  B('• Completed a 10-week AWS Academy cloud internship covering AWS services and architecture.');
  B('• Provisioned containerised Java services on AWS EC2 under industry mentorship.');
  H('EDUCATION');
  B('B.Tech Computer Science, VIT University 2022 – 2026');
  H('SKILLS');
  B('Languages: Python, Java, SQL');
  B('Cloud & DevOps: AWS EC2, Docker');
  H('LANGUAGES');
  B('English (Fluent), Hindi (Native), Telugu (Conversational)');
}

function drawTwoColumnResume(doc: PDFKit.PDFDocument): void {
  const left = [
    'Aarav Sharma', '+91 98765 43210', 'aarav.sharma@gmail.com',
    'SKILLS', 'Python, Java, SQL', 'Pandas, NumPy', 'AWS EC2, Docker', 'Git, Excel',
  ];
  const right = [
    'EXPERIENCE', 'Data Science Virtual Intern', 'Altair (via AICTE NEAT & EduSkills)',
    'Jan 2025 – Mar 2025', '• Completed a 240-hour data science virtual internship with mentorship.',
    'Cloud Virtual Intern', 'Apr 2024 – Jun 2024', '• Completed a 10-week AWS Academy cloud internship.',
  ];
  let y = 60;
  for (const t of left) {
    doc.font('Helvetica').fontSize(10).text(t, 45, y, { width: 240, lineBreak: false });
    y += 15;
  }
  y = 60;
  for (const t of right) {
    doc.font('Helvetica').fontSize(10).text(t, 330, y, { width: 240, lineBreak: false });
    y += 15;
  }
}

async function buildMultiPagePdf(): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    doc.font('Helvetica-Bold').fontSize(16).text('Aarav Sharma');
    doc.font('Helvetica').fontSize(10);
    doc.text('+91 98765 43210 | aarav.sharma@gmail.com');
    doc.font('Helvetica-Bold').fontSize(11).text('EXPERIENCE');
    doc.font('Helvetica').fontSize(10).text('Data Science Virtual Intern');
    doc.text('Altair (via AICTE NEAT & EduSkills)');
    doc.text('Jan 2025 – Mar 2025');
    doc.text('• Completed a 240-hour data science virtual internship with mentorship.');
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).text('EDUCATION');
    doc.font('Helvetica').fontSize(10).text('B.Tech Computer Science, VIT University 2022 – 2026');
    doc.font('Helvetica-Bold').fontSize(11).text('SKILLS');
    doc.font('Helvetica').fontSize(10).text('Python, Java, SQL');
  });
}

async function buildSimpleDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.folder('word')!.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Aarav Sharma</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Backend engineer with 3 years of experience building APIs.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>EXPERIENCE</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Software Engineer, Finlio Technologies 08/2022 - Present</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>- Shipped REST APIs in Java and Spring Boot for production traffic.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>SKILLS</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Java, Spring Boot, PostgreSQL</w:t></w:r></w:p>` +
      `</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('date parsing', () => {
  it('parses month-name ranges, numeric ranges, year ranges and Present', () => {
    expect(findDateRange('Jan 2025 – Mar 2025')).toMatchObject({ start: '01/2025', end: '03/2025', current: false });
    expect(findDateRange('Apr 2024 – Jun 2024')).toMatchObject({ start: '04/2024', end: '06/2024' });
    expect(findDateRange('08/2022 - Present')).toMatchObject({ start: '08/2022', end: 'Present', current: true });
    expect(findDateRange('08/2022 - Current')).toMatchObject({ start: '08/2022', end: 'Present', current: true });
    expect(findDateRange('2017 - 2021')).toMatchObject({ start: '2017', end: '2021' });
    expect(findDateRange('May 2024')).toMatchObject({ start: '05/2024' });
    expect(findDateRange('Data Science Virtual Intern')).toBeNull();
    expect(normalizeDate('December 2024')).toBe('12/2024');
    expect(normalizeDate('3/2024')).toBe('03/2024');
    expect(normalizeDate('Present')).toBe('Present');
  });

  it('keeps year-only dates year-only and rejects embedded years', () => {
    expect(findDateRange('2025')).toMatchObject({ start: '2025', end: '', current: false });
    expect(findDateRange('2025')!.start).not.toMatch('/'); // no invented month
    expect(findDateRange('B.Tech Computer Science, VIT University 2022 – 2026')).toMatchObject({ start: '2022', end: '2026' });
    expect(findDateRange('Marketing 2025 cohort')).toBeNull(); // "2025" mid-text is not a date
    expect(findDateRange('Class of 2026')).toBeNull();
    expect(findDateRange('240-hour program')).toBeNull();
  });
});

describe('phone token stitching', () => {
  it('reconstructs international numbers across spaces, dashes and parentheses', () => {
    expect(extractPhoneFromLine('+91 98765 43210').replace(/\D/g, '')).toBe('919876543210');
    expect(extractPhoneFromLine('(+44) 7700-900-123').replace(/\D/g, '')).toBe('447700900123');
    expect(extractPhoneFromLine('+91-98765-43210').replace(/\D/g, '')).toBe('919876543210');
    expect(extractPhoneFromLine('Phone: +44 7700 900123').replace(/\D/g, '')).toBe('447700900123');
    expect(extractPhoneFromLine('0161 496 0008').replace(/\D/g, '')).toBe('01614960008');
  });
  it('does not swallow dates, year ranges or emails', () => {
    expect(extractPhoneFromLine('2022 - 2026')).toBe('');
    expect(extractPhoneFromLine('Jan 2025 – Mar 2025')).toBe('');
    expect(extractPhoneFromLine('08/2022 - Present')).toBe('');
    const fromContact = extractPhoneFromLine('+44 7700 900123 | aarav.sharma@example.com');
    expect(fromContact.replace(/\D/g, '')).toBe('447700900123');
  });
});

describe('wrapped bullets', () => {
  it('keeps continuation lines inside the same bullet (comma and lowercase wraps)', () => {
    const text = `EXPERIENCE
Software Engineer, Finlio Technologies 08/2022 - Present
• Built a distributed platform using Spring Boot,
Kafka, Redis, PostgreSQL and Docker.
• Shipped APIs serving 10k requests per day
with 99.9% uptime and observability.
`;
    const ex = extractResumeFromText(text);
    expect(ex.resume.experience.length).toBe(1);
    expect(ex.resume.experience[0].bullets.length).toBe(2);
    expect(ex.resume.experience[0].bullets[0]).toContain('Spring Boot, Kafka, Redis, PostgreSQL and Docker.');
    expect(ex.resume.experience[0].bullets[1]).toContain('99.9% uptime');
  });
});

describe('section fallback evidence (no EXPERIENCE heading)', () => {
  it('never turns projects, certifications, interests, links or education into experience', () => {
    const text = `Aarav Sharma
aarav.sharma@gmail.com

SKILLS
Python, Java, SQL

PROJECTS
Portfolio Website 2024
• Built with React and Vite.

CERTIFICATIONS
AWS Academy Graduate — Cloud Foundations (May 2024)

LINKS
https://leetcode.com/u/aaravsharma

EDUCATION
B.Tech Computer Science, VIT University 2022 – 2026
`;
    const ex = extractResumeFromText(text);
    expect(ex.resume.experience.length).toBe(0);
    expect(ex.resume.projects.length).toBe(1);
    expect(ex.resume.projects[0].name).toContain('Portfolio Website');
    expect(ex.resume.certifications.length).toBe(1);
    expect(ex.resume.certifications[0].name).toContain('AWS Academy Graduate');
    expect(ex.resume.education.length).toBe(1);
    expect(ex.resume.personal.portfolio).not.toContain('leetcode');
    expect(ex.resume.personal.otherLinks ?? []).toEqual(expect.arrayContaining([expect.stringContaining('leetcode.com')]));
    expect(ex.notes.some((n) => n.includes('No EXPERIENCE heading'))).toBe(true);
  });
});

describe('date sanity invariants', () => {
  it('flags entries whose end date precedes their start date', () => {
    const text = `EXPERIENCE
Data Science Intern, Altair 03/2025 - 01/2025
• Completed a structured internship.
`;
    const ex = extractResumeFromText(text);
    expect(ex.resume.experience[0].startDate).toBe('03/2025');
    expect(ex.resume.experience[0].endDate).toBe('01/2025');
    expect(ex.notes.some((n) => n.includes('ends before it starts'))).toBe(true);
  });
});

describe('strict contact/link rules', () => {
  it('never turns a free-mail address into the portfolio', () => {
    expect(extractLinks('mail me at x@gmail.com')).toMatchObject({ portfolio: '', linkedin: '', github: '' });
    expect(extractLinks('Contact: jane@yahoo.com or jane@hotmail.com')).toMatchObject({ portfolio: '' });
  });
  it('keeps email as email and picks the personal site as portfolio', () => {
    const links = extractLinks('aarav.sharma@gmail.com linkedin.com/in/aaravsharma github.com/aaravsharma https://aaravsharma.dev');
    expect(links.linkedin).toContain('linkedin.com/in/aaravsharma');
    expect(links.github).toContain('github.com/aaravsharma');
    expect(links.portfolio).toBe('https://aaravsharma.dev');
    expect(links.portfolio.toLowerCase()).not.toContain('gmail');
  });
  it('treats github.io pages as portfolio candidates and keeps other public links', () => {
    const links = extractLinks('https://janesmith.github.io/portfolio and https://leetcode.com/u/janedoe');
    expect(links.portfolio).toContain('janesmith.github.io');
    expect(links.otherLinks.some((l) => l.includes('leetcode.com'))).toBe(true);
  });
});

describe('reference resume (TXT)', () => {
  const ex = extractResumeFromText(REFERENCE_TXT);
  const r = ex.resume;

  it('extracts BOTH internships as real work experience', () => {
    expect(r.experience.length).toBe(2);
    expect(r.experience[0].title).toBe('Data Science Virtual Intern');
    expect(r.experience[0].company).toContain('Altair');
    expect(r.experience[0].startDate).toBe('01/2025');
    expect(r.experience[0].endDate).toBe('03/2025');
    expect(r.experience[0].dateDisplay).toBe('Jan 2025 – Mar 2025');
    expect(r.experience[0].location).toBe('Remote');
    expect(r.experience[0].bullets.length).toBe(2);
    expect(r.experience[0].bullets[0]).toContain('240-hour');

    expect(r.experience[1].title).toBe('Cloud Virtual Intern');
    expect(r.experience[1].company).toContain('AICTE NEAT');
    expect(r.experience[1].startDate).toBe('04/2024');
    expect(r.experience[1].endDate).toBe('06/2024');
    expect(r.experience[1].dateDisplay).toBe('Apr 2024 – Jun 2024');
    expect(r.experience[1].bullets.length).toBe(2);
    expect(r.experience[1].bullets[1]).toContain('AWS EC2');
    expect(ex.confidence.experience).toBe('high');
  });

  it('keeps the email an email and the portfolio a personal site', () => {
    expect(r.personal.email).toBe('aarav.sharma@gmail.com');
    expect(r.personal.phone.replace(/\D/g, '')).toContain('9876543210');
    expect(r.personal.linkedin).toContain('linkedin.com/in/aaravsharma');
    expect(r.personal.github).toContain('github.com/aaravsharma');
    expect(r.personal.portfolio).toBe('https://aaravsharma.dev');
    const fields: string[] = [r.personal.portfolio ?? '', r.personal.location ?? ''];
    for (const field of fields) {
      expect(field.toLowerCase()).not.toContain('gmail');
    }
  });

  it('keeps certifications and interests separate (combined heading split)', () => {
    expect(r.certifications.length).toBe(2);
    expect(r.certifications[0].name).toContain('AWS Academy Graduate');
    expect(r.certifications[0].year).toBe('2024');
    expect(r.certifications[1].name).toContain('Google AI-ML');
    const interests = r.customSections.find((c) => c.id === 'custom_interests');
    expect(interests).toBeDefined();
    expect(interests!.bullets).toEqual(['kabaddi', 'chess', 'stock market analysis']);
    expect(r.experience.some((e) => e.bullets.join(' ').includes('kabaddi'))).toBe(false);
    expect(r.certifications.some((c) => c.name.includes('kabaddi'))).toBe(false);
  });

  it('extracts education, categorized skills, projects and languages', () => {
    expect(r.education.length).toBe(1);
    expect(r.education[0].institution).toContain('VIT');
    expect(r.education[0].degree).toBe('B.Tech');
    expect(r.education[0].field).toContain('Computer Science');
    expect(r.education[0].startDate).toBe('2022');
    expect(r.education[0].endDate).toBe('2026');
    expect(r.skills.technical).toEqual(expect.arrayContaining(['Python', 'Java', 'SQL', 'AWS EC2', 'Docker']));
    expect(r.projects.length).toBe(1);
    expect(r.projects[0].name).toContain('Sales Dashboard');
    expect(r.projects[0].tech).toEqual(expect.arrayContaining(['Python', 'Altair']));
    expect(r.projects[0].bullets.length).toBe(1);
    expect(r.languages.length).toBe(3);
    expect(r.languages[0]).toMatchObject({ name: 'English', proficiency: 'Fluent' });
  });

  it('reflects the document section order', () => {
    const order = ex.resume.sectionOrder;
    expect(order.indexOf('summary')).toBeLessThan(order.indexOf('experience'));
    expect(order.indexOf('experience')).toBeLessThan(order.indexOf('education'));
    expect(order.indexOf('education')).toBeLessThan(order.indexOf('skills'));
    expect(order.indexOf('skills')).toBeLessThan(order.indexOf('projects'));
    expect(order).toContain('custom_interests');
  });

  it('prints the parsed structure for manual inspection (debug path)', () => {
    const overview = {
      contact: r.personal,
      summary: r.summary,
      skills: r.skills,
      education: r.education,
      experience: r.experience.map((e) => ({
        title: e.title,
        company: e.company,
        location: e.location ?? '',
        dates: e.dateDisplay ?? `${e.startDate} – ${e.endDate}`,
        bullets: e.bullets.length,
      })),
      projects: r.projects.map((p) => ({ name: p.name, tech: p.tech })),
      certifications: r.certifications.map((c) => ({ name: c.name, issuer: c.issuer, year: c.year })),
      interests: r.customSections.find((c) => c.id === 'custom_interests')?.bullets ?? [],
    };
    // eslint-disable-next-line no-console
    console.log(`REFERENCE RESUME PARSED STRUCTURE:\n${JSON.stringify(overview, null, 2)}`);
    expect(r.experience.length).toBe(2);
    expect(r.personal.portfolio).toBe('https://aaravsharma.dev');
    expect(r.certifications.length).toBe(2);
    expect((r.customSections.find((c) => c.id === 'custom_interests')?.bullets ?? []).length).toBe(3);
  });
});

describe('reference resume (PDF, layout-aware)', () => {
  it('reconstructs lines with coordinates and extracts both internships', async () => {
    const pdf = await pdfToBuffer(drawReferenceResume);
    const ex = await extractFile(asFile('reference.pdf', pdf));
    expect(ex.meta?.pageCount).toBe(1);
    expect(ex.meta?.multiColumn).toBe(false);
    expect(ex.resume.experience.length).toBe(2);
    expect(ex.resume.experience[0].title).toBe('Data Science Virtual Intern');
    expect(ex.resume.experience[0].company).toContain('Altair');
    expect(ex.resume.experience[0].startDate).toBe('01/2025');
    expect(ex.resume.experience[0].bullets.length).toBe(2);
    expect(ex.resume.experience[1].company).toContain('AICTE NEAT');
    expect(ex.resume.experience[1].endDate).toBe('06/2024');
    expect(ex.resume.personal.email).toBe('aarav.sharma@gmail.com');
    expect(ex.resume.personal.portfolio).toBe('https://aaravsharma.dev');
    expect(ex.resume.education[0].institution).toContain('VIT');
  });

  it('handles a two-column layout via reading-order reconstruction', async () => {
    const pdf = await pdfToBuffer(drawTwoColumnResume);
    const ex = await extractFile(asFile('twocolumn.pdf', pdf));
    expect(ex.meta?.multiColumn).toBe(true);
    expect(ex.resume.experience.length).toBe(2);
    expect(ex.resume.experience[0].title).toBe('Data Science Virtual Intern');
    expect(ex.resume.experience[0].company).toContain('Altair');
    expect(ex.resume.skills.technical).toEqual(expect.arrayContaining(['Python', 'Java', 'AWS EC2']));
  });

  it('extracts content across multiple pages', async () => {
    const ex = await extractFile(asFile('multipage.pdf', await buildMultiPagePdf()));
    expect(ex.meta?.pageCount).toBe(2);
    expect(ex.resume.experience.length).toBe(1);
    expect(ex.resume.experience[0].company).toContain('Altair');
    expect(ex.resume.education[0].institution).toContain('VIT');
    expect(ex.resume.skills.technical).toContain('Python');
  });
});

describe('DOCX ingestion', () => {
  it('walks mammoth HTML into bold/list-aware lines', () => {
    const lines = docxHtmlToLines(
      '<p><strong>Aarav Sharma</strong></p><p>EXPERIENCE</p><ul><li>Shipped Java services.</li></ul><p><strong>SKILLS</strong></p>',
    );
    expect(lines[0]).toMatchObject({ text: 'Aarav Sharma', bold: true });
    expect(lines[2]).toMatchObject({ text: 'Shipped Java services.', isListItem: true });
    expect(lines[3].bold).toBe(true);
  });

  it('extracts a real .docx end-to-end', async () => {
    const ex = await extractFile(asFile('resume.docx', await buildSimpleDocx()));
    expect(ex.resume.personal.fullName).toBe('Aarav Sharma');
    expect(ex.resume.experience.length).toBe(1);
    expect(ex.resume.experience[0].title).toBe('Software Engineer');
    expect(ex.resume.experience[0].company).toBe('Finlio Technologies');
    expect(ex.resume.experience[0].startDate).toBe('08/2022');
    expect(ex.resume.experience[0].current).toBe(true);
    expect(ex.resume.experience[0].bullets.length).toBe(1);
    expect(ex.resume.skills.technical).toEqual(expect.arrayContaining(['Java', 'Spring Boot', 'PostgreSQL']));
  });
});

describe('robustness', () => {
  it('extracts experience without any employment heading (flat text fallback)', () => {
    const text = `Aarav Sharma
aarav.sharma@gmail.com | +91 98765 43210

Data Science Virtual Intern
Altair (via AICTE NEAT & EduSkills)
Jan 2025 – Mar 2025
• Completed a 240-hour Google AI-ML & Altair data science internship with mentorship.
`;
    const ex = extractResumeFromText(text);
    expect(ex.resume.experience.length).toBe(1);
    expect(ex.resume.experience[0].title).toBe('Data Science Virtual Intern');
    expect(ex.resume.experience[0].company).toContain('Altair');
    expect(ex.notes.some((n) => n.includes('No EXPERIENCE heading'))).toBe(true);
  });

  it('never filters internship/trainee/apprentice roles', () => {
    const text = `EXPERIENCE
Engineering Trainee
RailWorks Technical Services
Aug 2023 - Nov 2023
• Assisted in track signalling diagnostics and reporting.
Apprentice Developer
CodeWorks Software Solutions
Jun 2023 - Jul 2023
• Fixed bugs in a Java billing module under supervision.
`;
    const ex = extractResumeFromText(text);
    expect(ex.resume.experience.length).toBe(2);
    expect(ex.resume.experience[0].title).toBe('Engineering Trainee');
    expect(ex.resume.experience[0].company).toContain('RailWorks');
    expect(ex.resume.experience[1].title).toBe('Apprentice Developer');
  });

  it('de-duplicates identical experience entries', () => {
    const text = `EXPERIENCE
Software Engineer, Acme Corp 01/2020 - 02/2021
• Did a thing with measurable impact.
Software Engineer, Acme Corp 01/2020 - 02/2021
• Did a thing with measurable impact.
`;
    const ex = extractResumeFromText(text);
    expect(ex.resume.experience.length).toBe(1);
  });

  it('rejects malformed PDF, DOCX and empty TXT with a friendly error', async () => {
    await expect(extractFile(asFile('broken.pdf', Buffer.from('this is not a pdf at all, honestly')))).rejects.toMatchObject({
      code: 'PARSE_FAILED',
      status: 422,
    } satisfies Partial<AppError>);
    await expect(extractFile(asFile('broken.docx', Buffer.from('not a zip file either')))).rejects.toMatchObject({
      code: 'PARSE_FAILED',
      status: 422,
    } satisfies Partial<AppError>);
    await expect(extractFile(asFile('empty.txt', Buffer.from('short')))).rejects.toMatchObject({
      code: 'PARSE_FAILED',
      status: 422,
    } satisfies Partial<AppError>);
  });

  it('rejects unsupported file types', async () => {
    await expect(extractFile(asFile('image.png', Buffer.from('x'.repeat(100))))).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });
});
