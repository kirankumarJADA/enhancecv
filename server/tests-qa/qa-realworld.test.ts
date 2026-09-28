// REAL-WORLD RESUME QA — report-only harness against the frozen aaee6df engine.
// Run: npx vitest run --config vitest.qa.config.ts
// This file asserts nothing (except that the run completes): it prints the
// full extraction per resume and a pass/fail table vs expected semantics.

import { describe, it } from 'vitest';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import { extractResumeFromText, extractFile } from '../src/engine/extract';

// ---------------------------------------------------------------- helpers

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

interface Expectation {
  name: string;
  email: string;
  phoneDigits: string;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  summary: boolean;
  experience: { title: string; company: string; dates?: string; bullets?: number }[];
  education: number;
  projects: { name: string }[];
  certifications: number;
  interests: number;
  skills: number;
}

// ---------------------------------------------------------------- corpus

const R1_CLASSIC_US = `Sarah Mitchell
Austin, TX | (512) 555-0142 | sarah.mitchell@example.com
linkedin.com/in/sarahmitchell | github.com/sarahmitchell | https://sarahmitchell.dev

PROFESSIONAL SUMMARY
Product-minded backend engineer with 6 years of experience building distributed systems and payment platforms.

WORK EXPERIENCE

Senior Backend Engineer
Stripe
Austin, TX
Mar 2019 - Present
• Led the payments reconciliation team, processing $2B annual volume.
• Reduced settlement latency by 40% through event-driven redesign.
• Mentored 4 junior engineers across two teams.

Backend Engineer
Dell Technologies
Round Rock, TX
Jul 2016 - Feb 2019
• Built inventory APIs in Python and PostgreSQL serving 5k requests per second.
• Introduced Kafka pipelines cutting batch reporting from hours to minutes.

EDUCATION
B.S. Computer Science, University of Texas at Austin, 2012 - 2016

SKILLS
Python, Go, PostgreSQL, Kafka, Redis, Docker, Kubernetes, AWS

LANGUAGES
English (Native), Spanish (Professional)`;

const R3_UK_CAREER = `James O'Brien
Personal Profile
Chartered engineer with twelve years across fintech and telecoms, specialising in reliability and platform work.

CAREER HISTORY

Lead Site Reliability Engineer | BT Group | Ipswich, England | Sept 2018 - Present
- Own the observability platform for 14m customer accounts.
- Cut paging volume by 60% via SLO automation.

Site Reliability Engineer | Vodafone | Newbury, England | Oct 2014 - Sept 2018
- Automated network capacity forecasting in Python.

EDUCATION & TRAINING
MSc Data Science, University of Southampton, 2013 - 2014
BEng Electronic Engineering, University of Leeds, 2010 - 2013

KEY SKILLS
Terraform, Python, Grafana, AWS, Kubernetes, PostgreSQL

INTERESTS
Hill walking, Board games, Home brewing`;

const R4_NO_HEADINGS = `Priya Raghavan
priya.raghavan@example.com | +1 415 555 0164 | San Francisco, CA

Senior Data Engineer at Cloudflare, San Francisco — Jan 2020 to Present
- Own Kafka ingestion pipelines handling 80k events per second.
- Built dbt models standardising 40 data sources.

Data Engineer at Chewy, Boston — Jun 2017 to Dec 2019
- Migrated legacy ETL to Airflow, cutting run time by 70%.
- Built redshift dashboards for the merchandising team.

MS Computer Science, Georgia Institute of Technology, 2015 - 2017
BE Computer Engineering, University of Mumbai, 2011 - 2015
Skills: Python, Airflow, Kafka, Spark, Snowflake, Terraform, AWS`;

const R5_COMPANY_FIRST = `Daniel Cho
daniel.cho@example.com
github.com/danielcho

EXPERIENCE

Amazon Web Services
Cloud Support Associate Intern
June 2023 – August 2023
* Diagnosed 120+ customer cases across EC2 and S3.
* Automated ticket triage with AWS Lambda, saving 6 engineer-hours weekly.

Meta
Software Engineer Intern
06/2022 - 09/2022
- Shipped an internal tool used by 300 recruiters.
- Migrated 15 services to a new CI pipeline.

EDUCATION
BA Economics, University of Washington, 2019 - 2023`;

const R6_DENSE_TECH = `ALEX KUMAR
Senior Full-Stack Engineer
alex.kumar@example.com | +91 98765 43210 | Bengaluru, India
LinkedIn: linkedin.com/in/alexkumar | GitHub: github.com/alexkumar | Portfolio: https://alexkumar.tech

PROFILE
Full-stack engineer with 7 years across Java, React and cloud infrastructure. Led migrations for systems serving 30M users.

TECHNICAL SKILLS
Languages: Java, TypeScript, Python, Go
Frontend: React, Next.js, Redux, Tailwind CSS
Backend: Spring Boot, Node.js, GraphQL, gRPC
Data: PostgreSQL, MongoDB, Redis, Elasticsearch, Kafka
Cloud/DevOps: AWS, Terraform, Docker, Kubernetes, GitHub Actions

EXPERIENCE

Senior Software Engineer
Razorpay
Bengaluru
Aug 2021 - Present
• Led checkout microservices migration to Spring Boot 3; p99 latency down 35%.
• Built GraphQL federation gateway unifying 12 team schemas.
• Drove K8s adoption across 40 services.

Software Engineer
Flipkart
Bengaluru
Jul 2018 - Jul 2021
• Built search ranking service in Java handling 20k QPS.
• Cut Redis costs 45% via hot-key redesign.

PROJECTS
AirQuality India — https://github.com/alexkumar/airquality
Tech: React, Node.js, MongoDB
• Real-time AQI dashboard for 120 Indian cities with WebSocket updates.

Markdown Editor — https://github.com/alexkumar/mdeditor
Tech: TypeScript, Vite
• Collaborative editor with CRDT sync and offline support.

CERTIFICATIONS & AWARDS
AWS Certified Solutions Architect — Associate (2022)
Oracle Certified Professional: Java SE 17 (2021)
Winner, Flipkart Hackathon 2020

ACHIEVEMENTS
Scaled checkout to 10x traffic during Big Billion Days 2023 without downtime.`;

const R11_EDGE_LINKS = `Maya Novak
maya.novak@example.com
+44 7700 900123
https://mayanovak.example

work experience
Product Manager
Fintech Labs
London
Jan 2021 - CURRENT
· Owned the payments roadmap across 3 squads.
· Shipped instant payouts to 200k merchants.

education
MSc HCI, University of Bath, 2016 - 2017
BSc Psychology, University of Bristol, 2012 - 2016`;

const R12_TWOCOL_FLAT = `Lena Fischer                        Software Engineer
Berlin, Germany                     TSB Systems
+49 30 555 0199                     Mar 2020 - Present
lena.fischer@example.com            • Built payment APIs in Go.
SKILLS                              • Led a team of 4.
Go, Kubernetes, PostgreSQL          Junior Developer
LANGUAGES                           WebGmbH
German (Native)                     2017 - 2020
English (Fluent)                    • Built PHP services.`;

// ---- PDFs

function drawSidebarResume(doc: PDFKit.PDFDocument): void {
  const left = [
    'Sarah Mitchell', 'sarah.m@example.com', '+44 7700 900123', 'London, UK',
    'SKILLS', 'Java, Spring', 'AWS, Docker', 'React, Node.js',
    'CERTIFICATIONS', 'AWS SA Associate (2022)', 'LANGUAGES', 'English (Fluent)', 'German (Basic)',
  ];
  const right = [
    'EXPERIENCE', 'Senior Engineer', 'Monzo Bank', 'London, UK', 'Jan 2021 - Present',
    '• Built payments rails in Java serving 9m customers.', '• Led 3 engineers.',
    'Engineer', 'Revolut', 'Jul 2018 - Dec 2020', '• Built KYC APIs in Kotlin.',
    'EDUCATION', 'MSc Computer Science, Imperial College London, 2014 - 2018',
  ];
  let y = 50;
  for (const t of left) {
    doc.font('Helvetica').fontSize(9.5).text(t, 45, y, { width: 165, lineBreak: false });
    y += 14;
  }
  y = 50;
  for (const t of right) {
    doc.font('Helvetica').fontSize(9.5).text(t, 290, y, { width: 265, lineBreak: false });
    y += 14;
  }
}

function drawMultiPageResume(doc: PDFKit.PDFDocument): void {
  doc.font('Helvetica-Bold').fontSize(15).text('Omar Haddad');
  doc.font('Helvetica').fontSize(10);
  doc.text('omar.haddad@example.com | +971 50 123 4567 | Dubai, UAE');
  doc.font('Helvetica-Bold').fontSize(11).text('SUMMARY');
  doc.font('Helvetica').fontSize(10).text('Payments platform engineer with a decade across banking and startups.');
  doc.font('Helvetica-Bold').fontSize(11).text('EXPERIENCE');
  doc.font('Helvetica').fontSize(10);
  doc.text('Staff Engineer');
  doc.text('Emirates NBD');
  doc.text('Feb 2019 - Present');
  doc.text('• Rebuilt card issuing APIs in Java serving 4m cards.');
  doc.text('• Led the PCI-DSS remediation programme.');
  doc.text('Senior Engineer');
  doc.text('Careem');
  doc.text('Mar 2016 - Jan 2019');
  doc.text('• Built driver payout batch systems on AWS.');
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(11).text('EDUCATION');
  doc.font('Helvetica').fontSize(10);
  doc.text('MSc Software Engineering, Khalifa University, 2013 - 2015');
  doc.text('BSc Computer Science, American University of Sharjah, 2009 - 2013');
  doc.font('Helvetica-Bold').fontSize(11).text('PROJECTS');
  doc.font('Helvetica').fontSize(10);
  doc.text('OpenBank Sandbox');
  doc.text('Tech: Java, PostgreSQL');
  doc.text('• Mock open-banking server used by 300 students.');
  doc.font('Helvetica-Bold').fontSize(11).text('SKILLS');
  doc.font('Helvetica').fontSize(10).text('Java, Spring Boot, PostgreSQL, AWS, Docker');
  doc.text('Page 1 of 2');
}

function drawRightDatesResume(doc: PDFKit.PDFDocument): void {
  const lines: { text: string; x?: number; right?: string; bold?: boolean }[] = [
    { text: 'Grace Whitfield', bold: true },
    { text: 'grace.w@example.com | +44 161 496 0123 | Leeds, UK' },
    { text: 'SUMMARY', bold: true },
    { text: 'Backend engineer specialising in billing systems.' },
    { text: 'EXPERIENCE', bold: true },
    { text: 'Software Engineer', right: 'Mar 2019 - Present' },
    { text: 'Acme Systems' },
    { text: 'Austin, TX' },
    { text: '• Built billing APIs in Go.' },
    { text: '• Cut invoice generation from 40s to 3s.' },
    { text: 'Junior Engineer', right: 'Jun 2016 - Feb 2019' },
    { text: 'Beta Software Ltd' },
    { text: 'Leeds, UK' },
    { text: '• Maintained internal tools in Python.' },
    { text: 'EDUCATION', bold: true },
    { text: 'BSc Computer Science, University of Leeds, 2012 - 2016' },
  ];
  let y = 50;
  for (const l of lines) {
    doc.font(l.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    doc.text(l.text, 45, y, { width: 360, lineBreak: false, continued: false });
    if (l.right) doc.text(l.right, 415, y, { width: 150, lineBreak: false, align: 'right' });
    y += 16;
  }
}

// ---- DOCX builders

function docxXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}
function wp(text: string, bold = false): string {
  const rPr = bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}
function wpList(text: string): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

async function buildStructuredDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`);
  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder('word')!.file('_rels', '');
  zip.folder('word/_rels')!.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`);
  zip.folder('word')!.file('numbering.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
  zip.folder('word')!.file('document.xml', docxXml(
    wp('Nadia Petrov', true) +
    wp('nadia.petrov@example.com | +359 2 555 0111 | Sofia, Bulgaria') +
    wp('SUMMARY', true) +
    wp('Fintech product manager with 8 years across payments and lending.') +
    wp('EXPERIENCE', true) +
    wp('Product Manager') +
    wp('PaySafe Group') +
    wp('Apr 2020 - Present') +
    wpList('Owned card issuing product across 6 markets.') +
    wpList('Grew active cards from 400k to 1.2m in two years.') +
    wp('Product Owner') +
    wp('MyPOS') +
    wp('Sep 2017 - Mar 2020') +
    wpList('Launched merchant onboarding self-serve flow.') +
    wp('EDUCATION', true) +
    wp('MSc Finance, University of National and World Economy, 2015 - 2017') +
    wp('PROJECTS', true) +
    wp('Lending Calculator') +
    wpList('Open-source APR calculator with 2k GitHub stars.') +
    wp('CERTIFICATIONS & INTERESTS', true) +
    wp('Certified Scrum Product Owner (2021)') +
    wp('Interests: skiing, photography, chess'),
  ));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function buildPlainDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder('word')!.file('document.xml', docxXml(
    wp('Tom Adeyemi') +
    wp('tom.adeyemi@example.com | +44 7700 900987') +
    wp('EXPERIENCE') +
    wp('Backend Developer') +
    wp('HealthBridge') +
    wp('Nov 2021 - Present') +
    wp('• Built appointment APIs in C# serving 60 clinics.') +
    wp('• Cut no-show rates 18% with SMS reminders.') +
    wp('Graduate Developer') +
    wp('Softworks') +
    wp('Sep 2019 - Oct 2021') +
    wp('• Fixed and tested .NET billing modules.') +
    wp('EDUCATION') +
    wp('BSc Business Computing, University of Manchester, 2015 - 2019') +
    wp('SKILLS') +
    wp('C#, .NET, SQL Server, Azure, Git'),
  ));
  return zip.generateAsync({ type: 'nodebuffer' });
}

// ---------------------------------------------------------------- expectations

interface QaCase {
  id: string;
  label: string;
  format: string;
  layout: string;
  build: () => Promise<Buffer> | Buffer;
  useFile: boolean;
  fileName: string;
  expect: Expectation;
}

const CASES: QaCase[] = [
  {
    id: 'R01', label: 'Classic single-column US', format: 'TXT', layout: 'single-column', useFile: false, fileName: '',
    build: () => R1_CLASSIC_US,
    expect: {
      name: 'Sarah Mitchell', email: 'sarah.mitchell@example.com', phoneDigits: '5125550142',
      linkedin: 'linkedin.com/in/sarahmitchell', github: 'github.com/sarahmitchell', portfolio: 'https://sarahmitchell.dev',
      summary: true,
      experience: [
        { title: 'Senior Backend Engineer', company: 'Stripe', dates: 'Mar 2019 - Present', bullets: 3 },
        { title: 'Backend Engineer', company: 'Dell Technologies', dates: 'Jul 2016 - Feb 2019', bullets: 2 },
      ],
      education: 1, projects: [], certifications: 0, interests: 0, skills: 8,
    },
  },
  {
    id: 'R02', label: 'Sidebar two-column', format: 'PDF', layout: 'two-column sidebar', useFile: true, fileName: 'sidebar.pdf',
    build: () => pdfToBuffer(drawSidebarResume),
    expect: {
      name: 'Sarah Mitchell', email: 'sarah.m@example.com', phoneDigits: '447700900123',
      linkedin: null, github: null, portfolio: null,
      summary: false,
      experience: [
        { title: 'Senior Engineer', company: 'Monzo Bank', dates: 'Jan 2021 - Present', bullets: 2 },
        { title: 'Engineer', company: 'Revolut', dates: 'Jul 2018 - Dec 2020', bullets: 1 },
      ],
      education: 1, projects: [], certifications: 1, interests: 0, skills: 6,
    },
  },
  {
    id: 'R03', label: 'UK headings, pipe-inline entries', format: 'TXT', layout: 'single-column', useFile: false, fileName: '',
    build: () => R3_UK_CAREER,
    expect: {
      name: "James O'Brien", email: '', phoneDigits: '', // corpus intentionally has no phone line
      linkedin: null, github: null, portfolio: null,
      summary: true,
      experience: [
        { title: 'Lead Site Reliability Engineer', company: 'BT Group', dates: 'Sept 2018 - Present', bullets: 2 },
        { title: 'Site Reliability Engineer', company: 'Vodafone', dates: 'Oct 2014 - Sept 2018', bullets: 1 },
      ],
      education: 2, projects: [], certifications: 0, interests: 3, skills: 6,
    },
  },
  {
    id: 'R04', label: 'No section headings, sentence-style', format: 'TXT', layout: 'single-column flat', useFile: false, fileName: '',
    build: () => R4_NO_HEADINGS,
    expect: {
      name: 'Priya Raghavan', email: 'priya.raghavan@example.com', phoneDigits: '14155550164',
      linkedin: null, github: null, portfolio: null,
      summary: false,
      experience: [
        { title: 'Senior Data Engineer', company: 'Cloudflare', dates: 'Jan 2020 to Present', bullets: 2 },
        { title: 'Data Engineer', company: 'Chewy', dates: 'Jun 2017 to Dec 2019', bullets: 2 },
      ],
      // heading-less document: education lines are correctly KEPT OUT of
      // experience (F1) and no education section is fabricated (0 + warning)
      education: 0, projects: [], certifications: 0, interests: 0, skills: 7,
    },
  },
  {
    id: 'R05', label: 'Company-first entry order, mixed bullets', format: 'TXT', layout: 'single-column', useFile: false, fileName: '',
    build: () => R5_COMPANY_FIRST,
    expect: {
      name: 'Daniel Cho', email: 'daniel.cho@example.com', phoneDigits: '',
      linkedin: null, github: 'github.com/danielcho', portfolio: null,
      summary: false,
      experience: [
        { title: 'Cloud Support Associate Intern', company: 'Amazon Web Services', dates: 'June 2023 – August 2023', bullets: 2 },
        { title: 'Software Engineer Intern', company: 'Meta', dates: '06/2022 - 09/2022', bullets: 2 },
      ],
      education: 1, projects: [], certifications: 0, interests: 0, skills: 0,
    },
  },
  {
    id: 'R06', label: 'Dense technical, categorized skills, links inline', format: 'TXT', layout: 'single-column dense', useFile: false, fileName: '',
    build: () => R6_DENSE_TECH,
    expect: {
      name: 'ALEX KUMAR', email: 'alex.kumar@example.com', phoneDigits: '919876543210',
      linkedin: 'linkedin.com/in/alexkumar', github: 'github.com/alexkumar', portfolio: 'https://alexkumar.tech',
      summary: true,
      experience: [
        { title: 'Senior Software Engineer', company: 'Razorpay', dates: 'Aug 2021 - Present', bullets: 3 },
        { title: 'Software Engineer', company: 'Flipkart', dates: 'Jul 2018 - Jul 2021', bullets: 2 },
      ],
      education: 0, projects: [{ name: 'AirQuality India' }, { name: 'Markdown Editor' }], certifications: 2, interests: 0, skills: 21,
    },
  },
  {
    id: 'R07', label: 'Multi-page with page footers', format: 'PDF', layout: 'single-column, 2 pages', useFile: true, fileName: 'multipage.pdf',
    build: () => pdfToBuffer(drawMultiPageResume),
    expect: {
      name: 'Omar Haddad', email: 'omar.haddad@example.com', phoneDigits: '971501234567',
      linkedin: null, github: null, portfolio: null,
      summary: true,
      experience: [
        { title: 'Staff Engineer', company: 'Emirates NBD', dates: 'Feb 2019 - Present', bullets: 2 },
        { title: 'Senior Engineer', company: 'Careem', dates: 'Mar 2016 - Jan 2019', bullets: 1 },
      ],
      education: 2, projects: [{ name: 'OpenBank Sandbox' }], certifications: 0, interests: 0, skills: 5,
    },
  },
  {
    id: 'R08', label: 'Right-aligned dates, company below title', format: 'PDF', layout: 'single-column, right dates', useFile: true, fileName: 'rightdates.pdf',
    build: () => pdfToBuffer(drawRightDatesResume),
    expect: {
      name: 'Grace Whitfield', email: 'grace.w@example.com', phoneDigits: '441614960123',
      linkedin: null, github: null, portfolio: null,
      summary: true,
      experience: [
        { title: 'Software Engineer', company: 'Acme Systems', dates: 'Mar 2019 - Present', bullets: 2 },
        { title: 'Junior Engineer', company: 'Beta Software Ltd', dates: 'Jun 2016 - Feb 2019', bullets: 1 },
      ],
      education: 1, projects: [], certifications: 0, interests: 0, skills: 0,
    },
  },
  {
    id: 'R09', label: 'DOCX with real list items + bold headings', format: 'DOCX', layout: 'single-column', useFile: true, fileName: 'structured.docx',
    build: buildStructuredDocx,
    expect: {
      name: 'Nadia Petrov', email: 'nadia.petrov@example.com', phoneDigits: '35925550111',
      linkedin: null, github: null, portfolio: null,
      summary: true,
      experience: [
        { title: 'Product Manager', company: 'PaySafe Group', dates: 'Apr 2020 - Present', bullets: 2 },
        { title: 'Product Owner', company: 'MyPOS', dates: 'Sep 2017 - Mar 2020', bullets: 1 },
      ],
      education: 1, projects: [{ name: 'Lending Calculator' }], certifications: 1, interests: 3, skills: 0,
    },
  },
  {
    id: 'R10', label: 'DOCX plain paragraphs, glyph bullets', format: 'DOCX', layout: 'single-column', useFile: true, fileName: 'plain.docx',
    build: buildPlainDocx,
    expect: {
      name: 'Tom Adeyemi', email: 'tom.adeyemi@example.com', phoneDigits: '447700900987',
      linkedin: null, github: null, portfolio: null,
      summary: false,
      experience: [
        { title: 'Backend Developer', company: 'HealthBridge', dates: 'Nov 2021 - Present', bullets: 2 },
        { title: 'Graduate Developer', company: 'Softworks', dates: 'Sep 2019 - Oct 2021', bullets: 1 },
      ],
      education: 1, projects: [], certifications: 0, interests: 0, skills: 5,
    },
  },
  {
    id: 'R11', label: 'Lowercase headings, portfolio-only, middle-dot bullets', format: 'TXT', layout: 'single-column', useFile: false, fileName: '',
    build: () => R11_EDGE_LINKS,
    expect: {
      name: 'Maya Novak', email: 'maya.novak@example.com', phoneDigits: '447700900123',
      linkedin: null, github: null, portfolio: 'https://mayanovak.example',
      summary: false,
      experience: [{ title: 'Product Manager', company: 'Fintech Labs', dates: 'Jan 2021 - CURRENT', bullets: 2 }],
      education: 2, projects: [], certifications: 0, interests: 0, skills: 0,
    },
  },
  {
    id: 'R12', label: 'Text export of two-column PDF (interleaved columns)', format: 'TXT', layout: 'two-column flattened to text', useFile: false, fileName: '',
    build: () => R12_TWOCOL_FLAT,
    expect: {
      name: 'Lena Fischer', email: 'lena.fischer@example.com', phoneDigits: '49305550199',
      linkedin: null, github: null, portfolio: null,
      summary: false,
      experience: [
        { title: 'Software Engineer', company: 'TSB Systems', dates: 'Mar 2020 - Present', bullets: 2 },
        { title: 'Junior Developer', company: 'WebGmbH', dates: '2017 - 2020', bullets: 1 },
      ],
      education: 0, projects: [], certifications: 0, interests: 0, skills: 3,
    },
  },
];

// ---------------------------------------------------------------- runner

interface RowResult {
  id: string;
  format: string;
  layout: string;
  pass: boolean;
  diffs: string[];
  actual: unknown;
  pages?: number;
  multiColumn?: boolean;
  sectionOrder?: string[];
}

describe('REAL-WORLD RESUME QA (report-only, frozen aaee6df baseline)', () => {
  it('runs the full corpus and prints the QA table', async () => {
    const rows: RowResult[] = [];

    for (const c of CASES) {
      let raw: string | Buffer = await c.build();
      let ex;
      if (c.useFile) {
        ex = await extractFile(asFile(c.fileName, raw as Buffer));
      } else {
        ex = extractResumeFromText(raw as string);
      }
      const r = ex.resume;
      const diffs: string[] = [];
      const e = c.expect;

      const eq = (label: string, expected: unknown, actual: unknown) => {
        const ok = JSON.stringify(expected) === JSON.stringify(actual);
        if (!ok) diffs.push(`${label}: expected ${JSON.stringify(expected)} | actual ${JSON.stringify(actual)}`);
        return ok;
      };

      const expPairs = r.experience.map((x) => ({ title: x.title, company: x.company, dates: x.dateDisplay || `${x.startDate} - ${x.endDate}`, bullets: x.bullets.length }));
      const expMatch =
        expPairs.length === e.experience.length &&
        e.experience.every((x, i) =>
          expPairs[i] &&
          expPairs[i].title === x.title &&
          expPairs[i].company === x.company &&
          (x.dates === undefined || expPairs[i].dates.replace(/\s*–\s*/g, ' - ') === x.dates.replace(/\s*–\s*/g, ' - ') || expPairs[i].dates === x.dates) &&
          (x.bullets === undefined || expPairs[i].bullets === x.bullets),
        );
      if (!expMatch) diffs.push(`EXPERIENCE: expected ${JSON.stringify(e.experience)} | actual ${JSON.stringify(expPairs)}`);

      const projPairs = r.projects.map((p) => ({ name: p.name, tech: p.tech }));
      if (projPairs.length !== e.projects.length) diffs.push(`PROJECTS: expected ${e.projects.length} | actual ${projPairs.length} (${JSON.stringify(projPairs.map((p) => p.name))})`);

      if (!eq('NAME', e.name, r.personal.fullName)) void 0;
      if (e.email && !eq('EMAIL', e.email, r.personal.email)) void 0;
      if (e.phoneDigits) {
        const got = (r.personal.phone || '').replace(/\D/g, '');
        if (!eq('PHONE(digits)', e.phoneDigits, got)) void 0;
      }
      if (!eq('LINKEDIN', e.linkedin, r.personal.linkedin || null)) void 0;
      if (!eq('GITHUB', e.github, r.personal.github || null)) void 0;
      if (!eq('PORTFOLIO', e.portfolio, r.personal.portfolio || null)) void 0;
      if (!eq('SUMMARY_PRESENT', e.summary, r.summary.length > 20)) void 0;
      if (!eq('EDUCATION_COUNT', e.education, r.education.length)) void 0;
      if (!eq('CERTIFICATIONS_COUNT', e.certifications, r.certifications.length)) void 0;
      const interests = (r.customSections.find((x) => x.id === 'custom_interests') || { bullets: [] }).bullets;
      if (!eq('INTERESTS_COUNT', e.interests, interests.length)) void 0;
      const skillCount = r.skills.technical.length + r.skills.soft.length;
      if (e.skills > 0 && Math.abs(skillCount - e.skills) > 3) diffs.push(`SKILLS: expected ~${e.skills} | actual ${skillCount} (${JSON.stringify(r.skills.technical)})`);

      rows.push({
        id: c.id,
        format: c.format,
        layout: c.layout,
        pass: diffs.length === 0,
        diffs,
        actual: {
          name: r.personal.fullName, email: r.personal.email, phone: r.personal.phone,
          linkedin: r.personal.linkedin, github: r.personal.github, portfolio: r.personal.portfolio,
          otherLinks: r.personal.otherLinks, summaryLen: r.summary.length,
          experience: expPairs, experienceLocations: r.experience.map((x) => x.location ?? ''),
          education: r.education.map((x) => ({ institution: x.institution, degree: x.degree, dates: x.dateDisplay })),
          projects: projPairs, certifications: r.certifications.map((x) => x.name),
          interests, skills: r.skills.technical, notes: ex.notes, sectionOrder: r.sectionOrder,
        },
        pages: ex.meta?.pageCount,
        multiColumn: ex.meta?.multiColumn,
        sectionOrder: r.sectionOrder,
      });
    }

    // -------- print per-resume detail for every FAIL, compact JSON for all
    for (const row of rows) {
      console.log(`\n===== ${row.id} (${row.format}, ${row.layout}) ${row.pass ? 'PASS' : 'FAIL'} =====`);
      console.log(JSON.stringify(row.actual));
      if (!row.pass) {
        for (const d of row.diffs) console.log(`  DIFF ${d}`);
      }
    }

    // -------- QA table
    console.log('\n===== QA TABLE =====');
    console.log('ID   | Format | Layout                               | ExpExp/Got | ProjExp/Got | Contact | Links | Dates | Sections | Verdict');
    for (const row of rows) {
      const a = row.actual as { experience: { dates: string }[]; portfolio: unknown; linkedin: unknown; github: unknown; email: string; phone: string; name: string };
      const contactOk = Boolean(a.name && a.email);
      const datesOk = row.diffs.every((d) => !d.startsWith('EXPERIENCE:') || !d.includes('dates'));
      const linksOk = row.diffs.every((d) => !d.startsWith('LINKEDIN') && !d.startsWith('GITHUB') && !d.startsWith('PORTFOLIO'));
      const sectionsOk = row.diffs.every((d) => !d.startsWith('CERTIFICATIONS') && !d.startsWith('INTERESTS') && !d.startsWith('EDUCATION'));
      const expGot = `${(row.actual as { experience: unknown[] }).experience.length}`;
      const projGot = `${(row.actual as { projects: unknown[] }).projects.length}`;
      const expExp = String(CASES.find((c) => c.id === row.id)!.expect.experience.length);
      const projExp = String(CASES.find((c) => c.id === row.id)!.expect.projects.length);
      console.log(
        `${row.id} | ${row.format.padEnd(4)} | ${row.layout.padEnd(36)} | ${expExp}/${expGot.padEnd(6)} | ${projExp}/${projGot.padEnd(5)} | ${contactOk ? 'OK' : 'BAD'}      | ${linksOk ? 'OK' : 'BAD'}    | ${datesOk ? 'OK' : 'BAD'}    | ${sectionsOk ? 'OK' : 'BAD'}       | ${row.pass ? 'PASS' : 'FAIL'}`,
      );
      if (row.multiColumn) console.log(`     ^ multiColumn detected: ${row.multiColumn}, pages: ${row.pages}`);
      const notes = (row.actual as { notes: string[] }).notes || [];
      if (notes.some((n) => n.includes('flattened two-column'))) {
        console.log(`     ^ AMBIG: flattened two-column warning emitted (R12-class input)`);
      }
    }
    const passed = rows.filter((r) => r.pass).length;
    console.log(`\nTOTAL: ${passed}/${rows.length} complete passes; ${rows.length - passed} with at least one diff`);
  }, 120000);
});
