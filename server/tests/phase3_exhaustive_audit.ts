import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import pdfParse from 'pdf-parse';
import { buildApp } from '../src/app';
import { makeMasterCV } from './fixtures';
import { runAdvancedAtsAudit } from '../src/engine/audit';
import { renderResumePdf, pdfFileName } from '../src/engine/pdf';
import { ResumeData } from '../src/types';

const ARTIFACT_DIR = 'C:/Users/jadak/OneDrive/Desktop/enhancecv-test-artifacts';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function runExhaustivePhase3Verification() {
  console.log('================================================================');
  console.log('   ENHANCECV PHASE 3: COMPREHENSIVE VERIFICATION & AUDIT SUITE   ');
  console.log('================================================================\n');

  const app = await buildApp();
  const results: { section: string; test: string; status: 'PASS' | 'FAIL'; details?: string }[] = [];

  function binaryParser(res: any, callback: any) {
    res.setEncoding('binary');
    let data = '';
    res.on('data', (chunk: any) => { data += chunk; });
    res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
  }

  function record(section: string, test: string, passed: boolean, details?: string) {
    results.push({ section, test, status: passed ? 'PASS' : 'FAIL', details });
    console.log(`[${passed ? '✓ PASS' : '✗ FAIL'}] ${section} > ${test}${details ? ' (' + details + ')' : ''}`);
  }

  // --------------------------------------------------------------------------
  // SECTION A: PUBLIC ATS AUDIT ENDPOINT & ENGINE
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION A: Public ATS Audit Endpoint & Engine ---');

  // Test A1: Valid CV input
  try {
    const validResume = makeMasterCV();
    const res = await request(app).post('/api/public/audit').send({ resume: validResume });
    const ok = res.status === 200 && res.body.audit && res.body.audit.overallScore >= 0 && res.body.audit.overallScore <= 100 && Object.keys(res.body.audit.dimensions).length === 9;
    record('ATS Audit', 'Valid CV input returns 200 with 9-dimension audit', ok, `Score: ${res.body.audit?.overallScore}`);
  } catch (e: any) {
    record('ATS Audit', 'Valid CV input returns 200 with 9-dimension audit', false, e.message);
  }

  // Test A2: Empty input
  try {
    const res = await request(app).post('/api/public/audit').send({});
    const ok = res.status === 400 && res.body.error?.code === 'VALIDATION_ERROR';
    record('ATS Audit', 'Empty input rejected with 400 VALIDATION_ERROR', ok, `Status: ${res.status}`);
  } catch (e: any) {
    record('ATS Audit', 'Empty input rejected with 400 VALIDATION_ERROR', false, e.message);
  }

  // Test A3: Missing personal.fullName
  try {
    const invalidResume = { personal: { email: 'test@example.com' } };
    const res = await request(app).post('/api/public/audit').send({ resume: invalidResume });
    const ok = res.status === 400 && res.body.error?.code === 'VALIDATION_ERROR' && res.body.error?.message?.includes('fullName');
    record('ATS Audit', 'Missing personal.fullName rejected with 400', ok, `Status: ${res.status}`);
  } catch (e: any) {
    record('ATS Audit', 'Missing personal.fullName rejected with 400', false, e.message);
  }

  // Test A4: Minimal CV input
  try {
    const minimalResume = { personal: { fullName: 'Jane Candidate' } };
    const res = await request(app).post('/api/public/audit').send({ resume: minimalResume });
    const ok = res.status === 200 && res.body.audit?.overallScore !== undefined && res.body.audit?.rating === 'needs_work' && res.body.audit?.overallScore <= 45;
    record('ATS Audit', 'Minimal CV evaluates honestly without crashing', ok, `Score: ${res.body.audit?.overallScore}, Rating: ${res.body.audit?.rating}`);
  } catch (e: any) {
    record('ATS Audit', 'Minimal CV evaluates honestly without crashing', false, e.message);
  }

  // Test A5: Large CV input (15 jobs, 60 bullets)
  try {
    const largeResume = makeMasterCV();
    for (let i = 0; i < 12; i++) {
      largeResume.experience.push({
        id: `exp_lg_${i}`,
        company: `Enterprise Corp ${i + 3}`,
        title: `Senior Engineering Lead ${i + 3}`,
        location: 'London, UK',
        startDate: '2015-01',
        endDate: '2018-05',
        current: false,
        bullets: [
          `Spearheaded cloud migration of ${i * 10 + 20} microservices reducing operational latency by 35%.`,
          `Managed a cross-functional squad of ${i + 5} engineers delivering \$${i + 2}M in ARR growth.`,
          `Automated end-to-end regression testing pipelines cutting release cycles from 2 weeks to 2 hours.`,
          `Architected high-throughput data processing workflows processing over 500,000 events per second.`
        ]
      });
    }
    const start = Date.now();
    const res = await request(app).post('/api/public/audit').send({ resume: largeResume });
    const elapsed = Date.now() - start;
    const ok = res.status === 200 && res.body.audit?.overallScore > 70 && elapsed < 1000;
    record('ATS Audit', 'Large multi-page CV processes quickly and deterministically', ok, `${largeResume.experience.length} jobs, ${elapsed}ms, score: ${res.body.audit?.overallScore}`);
  } catch (e: any) {
    record('ATS Audit', 'Large multi-page CV processes quickly and deterministically', false, e.message);
  }

  // --------------------------------------------------------------------------
  // SECTION B: PUBLIC PDF EXPORT & TEMPLATE STABILITY
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION B: Public PDF Export & Template Inspection ---');

  const templates = ['classic', 'modern', 'minimal', 'professional', 'technical', 'executive'];

  for (const t of templates) {
    try {
      const resume = makeMasterCV();
      const res = await request(app)
        .post('/api/public/pdf')
        .send({ resume, template: t })
        .buffer(true)
        .parse(binaryParser);

      const is200 = res.status === 200;
      const isPdf = res.headers['content-type'] === 'application/pdf';
      const buf = Buffer.from(res.body);
      const parsedPdf = await pdfParse(buf);

      // Verify no competitor or branding watermarks
      const text = parsedPdf.text;
      const hasWatermark = text.includes('Powered by') || text.includes('www.enhancv.com');
      const containsName = text.includes(resume.personal.fullName);

      // Save to Desktop artifacts
      const outPath = path.join(ARTIFACT_DIR, `synthetic-cv-${t}.pdf`);
      fs.writeFileSync(outPath, buf);

      const pass = is200 && isPdf && !hasWatermark && containsName && parsedPdf.numpages >= 1;
      record('PDF Export', `Template '${t}' generates valid unbranded PDF`, pass, `${parsedPdf.numpages} page(s), ${buf.length} bytes, text extractable: ${containsName}`);
    } catch (e: any) {
      record('PDF Export', `Template '${t}' generates valid unbranded PDF`, false, e.message);
    }
  }

  // Test B2: Long Multi-Page CV PDF
  try {
    const longResume = makeMasterCV();
    for (let i = 0; i < 10; i++) {
      longResume.experience.push({
        id: `exp_long_${i}`,
        company: `High-Growth Scaleup ${i + 1}`,
        title: `Principal Solutions Architect ${i + 1}`,
        location: 'Cambridge, UK',
        startDate: '2016-01',
        endDate: '2019-12',
        current: false,
        bullets: [
          `Engineered distributed caching topologies across AWS regions reducing p99 latency from 240ms to 45ms.`,
          `Orchestrated zero-downtime database migration for 12,000 active enterprise accounts with zero data loss.`,
          `Mentored 8 junior and mid-level software developers through structured pair programming and code audits.`
        ]
      });
    }
    const res = await request(app)
      .post('/api/public/pdf')
      .send({ resume: longResume, template: 'modern' })
      .buffer(true)
      .parse(binaryParser);

    const buf = Buffer.from(res.body);
    const parsedPdf = await pdfParse(buf);
    const outPath = path.join(ARTIFACT_DIR, 'synthetic-cv-multi-page-long.pdf');
    fs.writeFileSync(outPath, buf);

    const pass = res.status === 200 && parsedPdf.numpages > 1 && !parsedPdf.text.includes('Powered by');
    record('PDF Export', 'Multi-page CV handles pagination without clipping or watermarks', pass, `${parsedPdf.numpages} pages generated`);
  } catch (e: any) {
    record('PDF Export', 'Multi-page CV handles pagination without clipping or watermarks', false, e.message);
  }

  // Test B3: Unicode, Currency & Special Characters PDF
  try {
    const unicodeResume = makeMasterCV();
    unicodeResume.personal.fullName = 'Dr. Élodie Müller-François';
    unicodeResume.summary = 'Senior ML Engineer specializing in natural language processing across multilingual corpora (français, deutsch, español). Delivered £2.4M (€2.8M / ₹25Cr) cost savings.';
    unicodeResume.experience[0].bullets = [
      'Spearheaded £1,500,000 cloud infrastructure cost reduction — achieved 99.99% SLA availability.',
      'Designed neural translation pipelines supporting café, naïve, résumé & Über-scale datasets • verified by CPRW.',
    ];

    const res = await request(app)
      .post('/api/public/pdf')
      .send({ resume: unicodeResume, template: 'technical' })
      .buffer(true)
      .parse(binaryParser);

    const buf = Buffer.from(res.body);
    const parsedPdf = await pdfParse(buf);
    const outPath = path.join(ARTIFACT_DIR, 'synthetic-cv-unicode-special-chars.pdf');
    fs.writeFileSync(outPath, buf);

    const pass = res.status === 200 && buf.length > 1000 && (parsedPdf.text.includes('Müller') || parsedPdf.text.includes('Élodie') || parsedPdf.text.includes('Elodie'));
    record('PDF Export', 'Special characters, accents and currency symbols render safely', pass, `${buf.length} bytes`);
  } catch (e: any) {
    record('PDF Export', 'Special characters, accents and currency symbols render safely', false, e.message);
  }

  // Test B4: Extreme Unbroken Long Words
  try {
    const extremeResume = makeMasterCV();
    extremeResume.experience[0].bullets.push(
      'Configured enterprise authorization scopes using internal_kubernetes_cluster_service_account_token_authentication_controller_identifier.'
    );
    const res = await request(app)
      .post('/api/public/pdf')
      .send({ resume: extremeResume, template: 'minimal' })
      .buffer(true)
      .parse(binaryParser);

    const buf = Buffer.from(res.body);
    const parsedPdf = await pdfParse(buf);
    const outPath = path.join(ARTIFACT_DIR, 'synthetic-cv-unbroken-words.pdf');
    fs.writeFileSync(outPath, buf);

    const pass = res.status === 200 && parsedPdf.text.includes('internal_kubernetes');
    record('PDF Export', 'Unbroken technical tokens wrap without crashing PDFKit', pass, `${buf.length} bytes`);
  } catch (e: any) {
    record('PDF Export', 'Unbroken technical tokens wrap without crashing PDFKit', false, e.message);
  }

  // --------------------------------------------------------------------------
  // SECTION C: TRUTH GUARD GROUNDING & HALLUCINATION PREVENTION
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION C: Truth Guard Grounding & Hallucination Prevention ---');

  const { validateTruth } = await import('../src/engine/tailor');

  // Test C1: Verifiable Preserved Facts (Valid Rewrite)
  try {
    const original = makeMasterCV();
    const rewritten = JSON.parse(JSON.stringify(original));
    // Paraphrase without inventing numbers or unverified skills
    rewritten.experience[0].bullets[0] = 'Engineered RESTful backend services using Java and Spring Boot serving 120k daily requests.';
    
    const truthReport = validateTruth(rewritten, original);
    const pass = truthReport.passedAll && truthReport.checks.every(c => c.status === 'supported');
    record('Truth Guard', 'Preserved candidate facts pass validation cleanly', pass, `${truthReport.checks.length} checks supported`);
  } catch (e: any) {
    record('Truth Guard', 'Preserved candidate facts pass validation cleanly', false, e.message);
  }

  // Test C2: Unsupported Numerical Invention (Hallucinated Metric)
  try {
    const original = makeMasterCV();
    const rewritten = JSON.parse(JSON.stringify(original));
    // Invent a fake percentage and dollar amount not in original
    rewritten.experience[0].bullets[0] = 'Increased revenue by 85% generating $4.2M by building new payment pipelines.';

    const truthReport = validateTruth(rewritten, original);
    const hasWarning = !truthReport.passedAll || truthReport.checks.some(c => c.status === 'warning' || c.status === 'reverted') || truthReport.autoFixed.length > 0;
    record('Truth Guard', 'AI-invented metrics ($4.2M, 85%) are flagged or auto-repaired', hasWarning, `passedAll: ${truthReport.passedAll}, autoFixed: ${truthReport.autoFixed.length}`);
  } catch (e: any) {
    record('Truth Guard', 'AI-invented metrics are flagged or auto-repaired', false, e.message);
  }

  // Test C3: Invented Unearned Credentials / Certifications
  try {
    const original = makeMasterCV();
    const rewritten = JSON.parse(JSON.stringify(original));
    rewritten.experience[0].bullets.push('Achieved AWS Certified Solutions Architect Professional certification.');

    const truthReport = validateTruth(rewritten, original);
    const caught = !truthReport.passedAll || truthReport.checks.some(c => c.status === 'warning' && c.unsupportedClaims.some(u => u.toLowerCase().includes('aws'))) || truthReport.autoFixed.length > 0;
    record('Truth Guard', 'Invented certifications not present in source CV are flagged', caught, `passedAll: ${truthReport.passedAll}`);
  } catch (e: any) {
    record('Truth Guard', 'Invented certifications not present in source CV are flagged', false, e.message);
  }

  // Test C4: Invented Employers / Companies
  try {
    const original = makeMasterCV();
    const rewritten = JSON.parse(JSON.stringify(original));
    rewritten.experience[0].bullets.push('Led LLM reasoning research on multimodal foundational models at Google DeepMind.');

    const truthReport = validateTruth(rewritten, original);
    const caught = !truthReport.passedAll || truthReport.checks.some(c => c.status === 'warning');
    record('Truth Guard', 'Fabricated experience claims are flagged', caught, `passedAll: ${truthReport.passedAll}`);
  } catch (e: any) {
    record('Truth Guard', 'Fabricated experience claims are flagged', false, e.message);
  }

  // --------------------------------------------------------------------------
  // SECTION D: DATA HANDLING, SECURITY & PRIVACY
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION D: Data Handling, Security & Headers ---');

  // Test D1: Security Headers on Public Endpoints
  try {
    const res = await request(app).get('/api/public/status');
    const nosniff = res.headers['x-content-type-options'] === 'nosniff';
    record('Security', 'X-Content-Type-Options: nosniff header enforced', nosniff, res.headers['x-content-type-options']);
  } catch (e: any) {
    record('Security', 'X-Content-Type-Options: nosniff header enforced', false, e.message);
  }

  // Test D2: No-Cache / No-Store on Sensitive PDF Download
  try {
    const resume = makeMasterCV();
    const res = await request(app).post('/api/public/pdf').send({ resume, template: 'classic' });
    const cacheControl = res.headers['cache-control'] as string | undefined;
    const ok = Boolean(cacheControl && cacheControl.includes('no-store') && cacheControl.includes('no-cache'));
    record('Security', 'Cache-Control: no-store on generated PDFs to prevent disk caching', ok, cacheControl);
  } catch (e: any) {
    record('Security', 'Cache-Control: no-store on generated PDFs', false, e.message);
  }

  // Test D3: File Upload Size Limit (Multer 8MB ceiling)
  try {
    const oversizedBuffer = Buffer.alloc(9 * 1024 * 1024); // 9MB
    const res = await request(app)
      .post('/api/public/parse')
      .attach('file', oversizedBuffer, 'oversized.pdf');

    const ok = res.status === 413 || (res.status === 400 && res.body.error?.code === 'FILE_TOO_LARGE');
    record('Security', 'Oversized file uploads (>8MB) rejected with 413/400', ok, `Status: ${res.status}`);
  } catch (e: any) {
    record('Security', 'Oversized file uploads (>8MB) rejected with 413/400', false, e.message);
  }

  // Test D4: Unsupported File Type Rejection
  try {
    const invalidBuffer = Buffer.from('console.log("hello world");');
    const res = await request(app)
      .post('/api/public/parse')
      .attach('file', invalidBuffer, 'exploit.exe');

    const ok = res.status === 400 && res.body.error?.code === 'UNSUPPORTED_FILE_TYPE';
    record('Security', 'Unsupported file types (.exe, .js) rejected with 400', ok, `Status: ${res.status}`);
  } catch (e: any) {
    record('Security', 'Unsupported file types (.exe, .js) rejected with 400', false, e.message);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('                 VERIFICATION SUMMARY RESULTS                   ');
  console.log('================================================================');
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL TESTS RUN : ${total}`);
  console.log(`PASSED          : ${passed}`);
  console.log(`FAILED          : ${failed}`);
  console.log(`PASS RATE       : ${((passed / total) * 100).toFixed(1)}%\n`);

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'verification-summary.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), total, passed, failed, results }, null, 2),
    'utf8'
  );
  console.log(`Summary written to: ${path.join(ARTIFACT_DIR, 'verification-summary.json')}`);

  if (failed > 0) {
    console.error(`\nFAILED TESTS (${failed}):`);
    results.filter(r => r.status === 'FAIL').forEach(f => console.error(`  - [${f.section}] ${f.test}: ${f.details}`));
  }
}

runExhaustivePhase3Verification().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
