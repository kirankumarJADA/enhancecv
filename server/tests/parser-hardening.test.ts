// Regression test suite for Phase 4C parser hardening and resource limits.
// Validates file signatures, ZIP central directory inspection, decomp-bomb defense,
// binary/control character filtering, multilingual UTF-8 support, 50k character ceilings,
// worker timeouts, and error response consistency.

import { describe, it, expect } from 'vitest';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import {
  extractFile,
  extractResumeFromText,
  validateTextBuffer,
  isPdf,
  MAX_FILE_SIZE,
  MAX_EXTRACTED_CHARS,
} from '../src/engine/extract';
import { inspectZipArchive, MAX_ZIP_ENTRIES, MAX_COMPRESSION_RATIO } from '../src/engine/extraction/zipGuard';
import { parseDocxInWorker, parsePdfInWorker, MAX_PDF_PAGES } from '../src/engine/extraction/isolatedParser';
import { AppError } from '../src/middleware/errors';

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

async function createPdfBuffer(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  draw(doc);
  doc.end();
  return done;
}

async function buildSyntheticDocx(bodyXml: string): Promise<Buffer> {
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
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('Phase 4C — Parser Hardening & Resource Limits', () => {
  // -------------------------------------------------------------
  // 1. Valid PDF, DOCX, and TXT extraction
  // -------------------------------------------------------------
  describe('1. Valid Document Ingestion', () => {
    it('extracts structured resume data from a valid PDF', async () => {
      const buf = await createPdfBuffer((doc) => {
        doc.font('Helvetica-Bold').fontSize(16).text('Aarav Sharma');
        doc.font('Helvetica').fontSize(10).text('aarav@example.com | +91 98765 43210');
        doc.font('Helvetica-Bold').fontSize(12).text('EXPERIENCE');
        doc.font('Helvetica').fontSize(10).text('Software Engineer, Tech Corp 2022 - Present');
        doc.text('• Built resilient backend services processing 10k requests per second.');
        doc.font('Helvetica-Bold').fontSize(12).text('SKILLS');
        doc.font('Helvetica').fontSize(10).text('TypeScript, Node.js, PostgreSQL');
      });

      const res = await extractFile(asFile('resume.pdf', buf));
      expect(res.resume.personal.fullName).toBe('Aarav Sharma');
      expect(res.resume.experience.length).toBeGreaterThan(0);
      expect(res.resume.skills.technical).toContain('TypeScript');
    });

    it('extracts structured resume data from a valid DOCX', async () => {
      const docxBuf = await buildSyntheticDocx(
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Aarav Sharma</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>aarav@example.com | +91 98765 43210</w:t></w:r></w:p>` +
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>EXPERIENCE</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Software Engineer, Tech Corp 2022 - Present</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>• Engineered event-driven microservices in Go and Kafka.</w:t></w:r></w:p>` +
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>SKILLS</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Go, Kafka, PostgreSQL, Docker</w:t></w:r></w:p>`,
      );

      const res = await extractFile(asFile('resume.docx', docxBuf));
      expect(res.resume.personal.fullName).toBe('Aarav Sharma');
      expect(res.resume.experience.length).toBeGreaterThan(0);
      expect(res.resume.skills.technical).toContain('Go');
    });

    it('extracts structured resume data from a valid TXT', async () => {
      const txt = [
        'Aarav Sharma',
        'aarav@example.com | +91 98765 43210',
        '',
        'EXPERIENCE',
        'Software Engineer, Tech Corp 2022 - Present',
        '• Designed low-latency data pipelines in Python and Redis.',
        '',
        'SKILLS',
        'Python, Redis, PostgreSQL',
      ].join('\n');

      const res = await extractFile(asFile('resume.txt', Buffer.from(txt, 'utf8')));
      expect(res.resume.personal.fullName).toBe('Aarav Sharma');
      expect(res.resume.skills.technical).toContain('Python');
    });
  });

  // -------------------------------------------------------------
  // 2. Incorrect file signatures and mismatched extensions
  // -------------------------------------------------------------
  describe('2. File Signatures and Mismatched Extensions', () => {
    it('rejects a text file disguised with a .pdf extension', async () => {
      const fakePdf = Buffer.from('This is plain text without any PDF header at all.');
      await expect(extractFile(asFile('fake.pdf', fakePdf))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('rejects random binary data disguised as a .pdf', async () => {
      const garbage = Buffer.from([0x00, 0x12, 0xff, 0xfe, 0x33, 0x44, 0x55]);
      await expect(extractFile(asFile('corrupt.pdf', garbage))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('rejects a plain text file disguised with a .docx extension', async () => {
      const fakeDocx = Buffer.from('Just plain text pretending to be a Word document.');
      await expect(extractFile(asFile('fake.docx', fakeDocx))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('rejects a real PDF renamed with a .docx extension', async () => {
      const realPdf = await createPdfBuffer((doc) => doc.text('Some real PDF content'));
      await expect(extractFile(asFile('mismatched.docx', realPdf))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('detects isPdf accurately', () => {
      expect(isPdf(Buffer.from('%PDF-1.4\n...'))).toBe(true);
      expect(isPdf(Buffer.from('PK\x03\x04...'))).toBe(false);
      expect(isPdf(Buffer.from(''))).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 3. Corrupt PDFs and DOCX archives
  // -------------------------------------------------------------
  describe('3. Corrupt PDFs and Archives', () => {
    it('rejects a truncated PDF with %PDF- header but broken body', async () => {
      const truncatedPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
      await expect(extractFile(asFile('truncated.pdf', truncatedPdf))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('rejects a DOCX archive with truncated ZIP structure', async () => {
      const partialZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      await expect(extractFile(asFile('broken.docx', partialZip))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });
  });

  // -------------------------------------------------------------
  // 4. ZIP entry-count, uncompressed-size, and compression-ratio limits
  // -------------------------------------------------------------
  describe('4. DOCX ZIP Protection & Decompression Bomb Defense', () => {
    it(`rejects ZIP archives with more than ${MAX_ZIP_ENTRIES} entries`, async () => {
      const zip = new JSZip();
      zip.file('[Content_Types].xml', '<xml></xml>');
      zip.folder('word')!.file('document.xml', '<w:document></w:document>');
      for (let i = 0; i < 251; i++) {
        zip.file(`dummy_file_${i}.txt`, `Dummy entry ${i}`);
      }
      const bombBuf = await zip.generateAsync({ type: 'nodebuffer' });

      expect(() => inspectZipArchive(bombBuf)).toThrow(AppError);
      await expect(extractFile(asFile('too_many_entries.docx', bombBuf))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it(`rejects ZIP archives exceeding ${MAX_COMPRESSION_RATIO}:1 compression ratio`, async () => {
      const zip = new JSZip();
      zip.file('[Content_Types].xml', '<xml></xml>');
      // Highly repetitive string compresses 1000:1 with DEFLATE
      zip.folder('word')!.file('document.xml', 'A'.repeat(80_000));
      const ratioBomb = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      expect(() => inspectZipArchive(ratioBomb)).toThrow(AppError);
      await expect(extractFile(asFile('ratio_bomb.docx', ratioBomb))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('rejects a ZIP archive that lacks Word document structure', async () => {
      const zip = new JSZip();
      zip.file('photo.png', Buffer.from('fake image data'));
      zip.file('notes.txt', 'some notes');
      const nonDocxZip = await zip.generateAsync({ type: 'nodebuffer' });

      expect(() => inspectZipArchive(nonDocxZip)).toThrow(AppError);
      await expect(extractFile(asFile('not_a_resume.docx', nonDocxZip))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });
  });

  // -------------------------------------------------------------
  // 5. Invalid/binary TXT while preserving multilingual UTF-8 text
  // -------------------------------------------------------------
  describe('5. TXT Validation and Multilingual Preservation', () => {
    it('rejects plain text files containing null bytes', () => {
      const withNulls = Buffer.from('Aarav Sharma\x00Software Engineer\x00resume');
      expect(() => validateTextBuffer(withNulls)).toThrow(AppError);
    });

    it('rejects files with excessive control characters (binary disguised as text)', () => {
      const binaryDisguised = Buffer.from('Resume Header\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f' + 'A'.repeat(50));
      expect(() => validateTextBuffer(binaryDisguised)).toThrow(AppError);
    });

    it('safely preserves multilingual UTF-8 resume text without corruption', async () => {
      const multilingualResume = [
        'Eleonore Mueller',
        'eleonore.mueller@example.fr | +33 6 12 34 56 78',
        'Paris, France | linkedin.com/in/eleonore',
        '',
        'SUMMARY',
        'Ingénieure logicielle passionnée par les architectures distribuées et l’intelligence artificielle.',
        '',
        'EXPERIENCE',
        'Lead Developer, Tech Solutions (2021 – Present)',
        '• Conception de microservices haute disponibilité avec Node.js et PostgreSQL.',
        '• Optimisation des temps de réponse API de 45% grâce à Redis.',
        '',
        'SKILLS',
        'TypeScript, Node.js, Python, PostgreSQL, Docker, Kubernetes',
        '',
        'LANGUAGES',
        'Français (Natif), Allemand (Courant), Anglais (Bilingue)',
      ].join('\n');

      const buf = Buffer.from(multilingualResume, 'utf8');
      const validated = validateTextBuffer(buf);
      expect(validated).toContain('Ingénieure');
      expect(validated).toContain('Français');

      const res = await extractFile(asFile('resume_fr.txt', buf));
      expect(res.resume.personal.fullName).toBe('Eleonore Mueller');
      expect(res.resume.skills.technical).toContain('TypeScript');
      expect(res.resume.summary).toContain('Ingénieure');
      expect(res.rawText).toContain('Français');
    });

    it('preserves non-Latin scripts (Hindi / Devanagari and Chinese)', () => {
      const hindiChineseText = 'आरव शर्मा — 软件工程师 — Aarav Sharma\naarav@example.com\n' + 'A'.repeat(50);
      const buf = Buffer.from(hindiChineseText, 'utf8');
      const validated = validateTextBuffer(buf);
      expect(validated).toContain('आरव शर्मा');
      expect(validated).toContain('软件工程师');
    });
  });

  // -------------------------------------------------------------
  // 6. Extracted text exceeding 50,000 characters
  // -------------------------------------------------------------
  describe('6. Extracted Text Ceiling (50,000 characters)', () => {
    it(`rejects text content exceeding ${MAX_EXTRACTED_CHARS} characters in extractResumeFromText`, () => {
      const hugeText = 'Aarav Sharma | Software Engineer\n' + 'A'.repeat(MAX_EXTRACTED_CHARS + 100);
      expect(() => extractResumeFromText(hugeText)).toThrow(AppError);
      expect(() => extractResumeFromText(hugeText)).toThrow(/50,000 characters/);
    });

    it(`rejects oversized TXT file uploads exceeding ${MAX_EXTRACTED_CHARS} characters`, async () => {
      const hugeResume = 'Aarav Sharma\n' + '• Built scalable systems.\n'.repeat(2500);
      expect(hugeResume.length).toBeGreaterThan(MAX_EXTRACTED_CHARS);

      await expect(extractFile(asFile('huge.txt', Buffer.from(hugeResume, 'utf8')))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });
  });

  // -------------------------------------------------------------
  // 7. Parser timeout and worker cleanup
  // -------------------------------------------------------------
  describe('7. Worker Timeout & Cleanup', () => {
    it('terminates DOCX worker and rejects with PARSE_FAILED when timeout expires', async () => {
      const docxBuf = await buildSyntheticDocx(
        `<w:p><w:r><w:t>Aarav Sharma</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Backend engineer with 5 years experience.</w:t></w:r></w:p>`,
      );

      // Force a short 50ms timeout to trigger worker termination
      await expect(parseDocxInWorker(docxBuf, 50)).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('terminates PDF worker and rejects with PARSE_FAILED when timeout expires', async () => {
      const pdfBuf = await createPdfBuffer((doc) => {
        doc.text('Aarav Sharma');
      });

      // Force a short 50ms timeout to trigger worker termination
      await expect(parsePdfInWorker(pdfBuf, 50)).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it(`rejects PDFs exceeding the maximum page limit of ${MAX_PDF_PAGES} pages`, async () => {
      const longPdfBuf = await createPdfBuffer((doc) => {
        for (let i = 1; i <= 22; i++) {
          doc.text(`Page ${i} content`);
          if (i < 22) doc.addPage();
        }
      });

      await expect(parsePdfInWorker(longPdfBuf, 15000, 20)).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });
  });

  // -------------------------------------------------------------
  // 8. Existing extraction behavior and error responses
  // -------------------------------------------------------------
  describe('8. Compatibility and Error Boundaries', () => {
    it('rejects unsupported file formats with 400 UNSUPPORTED_FILE_TYPE', async () => {
      const buf = Buffer.from('some data');
      await expect(extractFile(asFile('resume.exe', buf))).rejects.toMatchObject({
        code: 'UNSUPPORTED_FILE_TYPE',
        status: 400,
      });
      await expect(extractFile(asFile('resume.png', buf))).rejects.toMatchObject({
        code: 'UNSUPPORTED_FILE_TYPE',
        status: 400,
      });
    });

    it('rejects oversized files exceeding MAX_FILE_SIZE (8 MB) with 413 FILE_TOO_LARGE', async () => {
      const bigBuf = Buffer.alloc(MAX_FILE_SIZE + 1024);
      await expect(extractFile(asFile('huge.pdf', bigBuf))).rejects.toMatchObject({
        code: 'FILE_TOO_LARGE',
        status: 413,
      });
    });

    it('rejects empty files (0 bytes) with 422 PARSE_FAILED', async () => {
      const emptyBuf = Buffer.alloc(0);
      await expect(extractFile(asFile('empty.pdf', emptyBuf))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
      await expect(extractFile(asFile('empty.txt', emptyBuf))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });

    it('rejects files with less than minimum content characters', async () => {
      const tinyTxt = Buffer.from('Too short');
      await expect(extractFile(asFile('tiny.txt', tinyTxt))).rejects.toMatchObject({
        code: 'PARSE_FAILED',
        status: 422,
      });
    });
  });
});
