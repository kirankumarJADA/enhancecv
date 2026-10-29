// Comprehensive regression test suite for layout-aware PDF and DOCX extraction.
// Asserts:
// 1. Parser extracts specific expected text from supported formats (PDF & DOCX).
// 2. Empty, malformed, and unsupported files fail gracefully.
// 3. Worker/dependency resolution works from both application runtime and compiled build output (dist/).
// 4. Extracted content reaches the subsequent CV review and audit workflow cleanly.

import { describe, it, expect } from 'vitest';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { extractFile } from '../src/engine/extract';
import { parsePdfInWorker, parseDocxInWorker } from '../src/engine/extraction/isolatedParser';
import { buildApp } from '../src/app';

function asFile(name: string, buffer: Buffer): Express.Multer.File {
  return {
    originalname: name,
    buffer,
    fieldname: 'file',
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    size: buffer.length,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}

async function createSyntheticPdfBuffer(): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.font('Helvetica-Bold').fontSize(16).text('Aarav Sharma');
  doc.font('Helvetica').fontSize(10).text('aarav.sharma@example.com | +44 7700 900123 | London, UK');
  doc.text('linkedin.com/in/aaravsharma | github.com/aaravsharma');
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(11).text('PROFESSIONAL SUMMARY');
  doc.font('Helvetica').fontSize(10).text('Lead Distributed Systems Engineer with 8+ years building high-throughput event ledgers.');
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(11).text('EXPERIENCE');
  doc.font('Helvetica-Bold').fontSize(10).text('Staff Backend Engineer');
  doc.font('Helvetica').fontSize(10).text('Finlio Technologies | London, UK');
  doc.text('08/2021 – Present');
  doc.text('• Architected distributed event ledger processing 45,000 req/sec with 99.999% availability.');
  doc.text('• Spearheaded migration from monolithic services to event-driven Kafka architecture.');
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(11).text('EDUCATION');
  doc.font('Helvetica').fontSize(10).text('M.Sc. Computer Science, University of Edinburgh 2018 – 2020');
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(11).text('TECHNICAL SKILLS');
  doc.font('Helvetica').fontSize(10).text('Java, Go, Apache Kafka, Kubernetes, PostgreSQL, Docker');

  doc.end();
  return done;
}

async function createSyntheticDocxBuffer(): Promise<Buffer> {
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
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Elena Rostova</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>elena.rostova@cloudops.org | +1 415 555 0199 | San Francisco, CA</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>PROFESSIONAL SUMMARY</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Cloud Platform Engineer focused on Kubernetes automation, Terraform infrastructure, and zero-downtime deployment pipelines.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>EXPERIENCE</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Lead Cloud Platform Engineer</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Apex Infrastructure Labs</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>03/2021 – Present</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>• Automated zero-downtime multi-region Kubernetes deployments across 12 AWS clusters.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>• Standardized declarative infrastructure using Terraform and ArgoCD GitOps.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>SKILLS</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Terraform, Kubernetes, ArgoCD, Prometheus, AWS, Python</w:t></w:r></w:p>` +
      `</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('PDF/DOCX Extraction Regression Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Text Extraction Correctness from Supported Formats
  // ---------------------------------------------------------------------------
  describe('1. Format Text Extraction Correctness', () => {
    it('extracts specific expected text from a synthetic PDF resume', async () => {
      const pdfBuf = await createSyntheticPdfBuffer();
      const result = await extractFile(asFile('aarav_sharma.pdf', pdfBuf));

      expect(result.resume.personal.fullName).toBe('Aarav Sharma');
      expect(result.resume.personal.email).toBe('aarav.sharma@example.com');
      expect(result.resume.personal.phone).toContain('7700');
      expect(result.resume.summary).toContain('Distributed Systems Engineer');

      // Verify experience extraction
      expect(result.resume.experience.length).toBeGreaterThanOrEqual(1);
      const role1 = result.resume.experience[0];
      expect(role1.company).toContain('Finlio');
      expect(role1.bullets.some((b) => b.includes('45,000 req/sec'))).toBe(true);

      // Verify skills extraction
      const techSkills = result.resume.skills.technical.map((s) => s.toLowerCase());
      expect(techSkills).toContain('java');
      expect(techSkills).toContain('apache kafka');
      expect(techSkills).toContain('kubernetes');
    });

    it('extracts specific expected text from a synthetic DOCX resume', async () => {
      const docxBuf = await createSyntheticDocxBuffer();
      const result = await extractFile(asFile('elena_rostova.docx', docxBuf));

      expect(result.resume.personal.fullName).toBe('Elena Rostova');
      expect(result.resume.personal.email).toBe('elena.rostova@cloudops.org');
      expect(result.resume.personal.phone).toContain('555');

      // Verify experience extraction
      expect(result.resume.experience.length).toBeGreaterThanOrEqual(1);
      const role1 = result.resume.experience[0];
      expect(role1.bullets.some((b) => b.includes('multi-region Kubernetes deployments'))).toBe(true);

      // Verify skills extraction
      const techSkills = result.resume.skills.technical.map((s) => s.toLowerCase());
      expect(techSkills).toContain('terraform');
      expect(techSkills).toContain('kubernetes');
      expect(techSkills).toContain('argocd');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Graceful Failure for Empty, Malformed, and Unsupported Files
  // ---------------------------------------------------------------------------
  describe('2. Graceful Failure on Corrupted & Unsupported Inputs', () => {
    it('rejects an empty buffer gracefully with PARSE_FAILED (422)', async () => {
      const emptyBuf = Buffer.alloc(0);
      await expect(extractFile(asFile('empty.pdf', emptyBuf))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('rejects a truncated/malformed PDF with PARSE_FAILED (422)', async () => {
      const brokenPdf = Buffer.from('%PDF-1.4 corrupted binary junk that cannot be parsed %%EOF');
      await expect(extractFile(asFile('broken.pdf', brokenPdf))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('rejects a corrupt DOCX (broken zip structure) with PARSE_FAILED (422)', async () => {
      const brokenDocx = Buffer.from('PK\x03\x04 corrupt zip payload header with invalid stream');
      await expect(extractFile(asFile('broken.docx', brokenDocx))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('rejects unsupported file extensions with UNSUPPORTED_FILE_TYPE (400)', async () => {
      const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00 executable payload');
      await expect(extractFile(asFile('malware.exe', exeBuffer))).rejects.toMatchObject({
        code: 'UNSUPPORTED_FILE_TYPE',
        status: 400,
      });

      const jsBuffer = Buffer.from('console.log("hello world");');
      await expect(extractFile(asFile('script.js', jsBuffer))).rejects.toMatchObject({
        code: 'UNSUPPORTED_FILE_TYPE',
        status: 400,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Worker/Dependency Resolution from Runtime and Build Output
  // ---------------------------------------------------------------------------
  describe('3. Worker & Dependency Resolution Integrity', () => {
    it('executes PDF and DOCX parsing in isolated workers in the current tsx runtime', async () => {
      const pdfBuf = await createSyntheticPdfBuffer();
      const pdfWorkerRes = await parsePdfInWorker(pdfBuf);
      expect(pdfWorkerRes.numPages).toBe(1);
      expect(pdfWorkerRes.pages[0].items.length).toBeGreaterThan(5);

      const docxBuf = await createSyntheticDocxBuffer();
      const docxWorkerRes = await parseDocxInWorker(docxBuf);
      expect(docxWorkerRes.html).toContain('Elena Rostova');
      expect(docxWorkerRes.html).toContain('Kubernetes');
    });

    it('resolves dependencies and executes workers from compiled production build output (dist/)', async () => {
      const distParserPath = path.resolve(__dirname, '../dist/engine/extraction/isolatedParser.js');
      expect(fs.existsSync(distParserPath)).toBe(true);

      // Require the compiled production module directly
      const distParser = require(distParserPath);
      expect(typeof distParser.parsePdfInWorker).toBe('function');
      expect(typeof distParser.parseDocxInWorker).toBe('function');

      const pdfBuf = await createSyntheticPdfBuffer();
      const distPdfRes = await distParser.parsePdfInWorker(pdfBuf);
      expect(distPdfRes.numPages).toBe(1);
      expect(distPdfRes.pages[0].items.some((item: any) => item.text.includes('Aarav Sharma'))).toBe(true);

      const docxBuf = await createSyntheticDocxBuffer();
      const distDocxRes = await distParser.parseDocxInWorker(docxBuf);
      expect(distDocxRes.html).toContain('Elena Rostova');
      expect(distDocxRes.html).toContain('Apex Infrastructure Labs');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Extracted Content Reaches Subsequent CV Review and Audit Workflow
  // ---------------------------------------------------------------------------
  describe('4. Extracted Content Integration into Review & Audit Workflow', () => {
    it('correctly processes uploaded PDF through POST /api/public/parse and feeds into ATS audit', async () => {
      const app = await buildApp();
      const pdfBuf = await createSyntheticPdfBuffer();

      // Step A: Parse uploaded file via public API
      const parseRes = await request(app)
        .post('/api/public/parse')
        .attach('file', pdfBuf, 'aarav_sharma.pdf');

      expect(parseRes.status).toBe(200);
      expect(parseRes.body.resume).toBeDefined();
      expect(parseRes.body.resume.personal.fullName).toBe('Aarav Sharma');
      expect(parseRes.body.resume.experience[0].company).toContain('Finlio');
      expect(parseRes.body.resume.experience[0].bullets[0]).toContain('45,000 req/sec');

      // Step B: Submit the extracted resume to the ATS audit workflow
      const auditRes = await request(app)
        .post('/api/public/audit')
        .send({ resume: parseRes.body.resume });

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.audit).toBeDefined();
      expect(typeof auditRes.body.audit.overallScore).toBe('number');
      expect(auditRes.body.audit.overallScore).toBeGreaterThan(50);
      expect(auditRes.body.audit.dimensions).toBeDefined();
      expect(Object.keys(auditRes.body.audit.dimensions).length).toBe(9);
    });

    it('correctly processes uploaded DOCX through POST /api/public/parse and feeds into ATS audit', async () => {
      const app = await buildApp();
      const docxBuf = await createSyntheticDocxBuffer();

      // Step A: Parse uploaded DOCX via public API
      const parseRes = await request(app)
        .post('/api/public/parse')
        .attach('file', docxBuf, 'elena_rostova.docx');

      expect(parseRes.status).toBe(200);
      expect(parseRes.body.resume).toBeDefined();
      expect(parseRes.body.resume.personal.fullName).toBe('Elena Rostova');
      expect(parseRes.body.resume.experience[0].bullets[0]).toContain('multi-region Kubernetes deployments');

      // Step B: Submit the extracted resume to the ATS audit workflow
      const auditRes = await request(app)
        .post('/api/public/audit')
        .send({ resume: parseRes.body.resume });

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.audit).toBeDefined();
      expect(auditRes.body.audit.overallScore).toBeGreaterThan(50);
      expect(Object.keys(auditRes.body.audit.dimensions).length).toBe(9);
    });
  });
});
