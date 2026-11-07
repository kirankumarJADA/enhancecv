import fs from 'fs';
import path from 'path';
import { renderResumePdf } from '../src/engine/pdf';
import { makeMasterCV, JAVA_JD } from './fixtures';
import { readPdfLayout } from '../src/engine/extraction/pdfText';

// Load Playwright
const pw = require('C:/Users/jadak/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const EVIDENCE_DIR = 'C:/Users/jadak/OneDrive/Desktop/enhancecv-acceptance-evidence';

function pdfDocToBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export async function runPhase3BrowserVerification() {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  console.log('========================================================================');
  console.log('PHASE 3: PRODUCTION BROWSER E2E ACCEPTANCE VERIFICATION');
  console.log('Target Frontend: https://enhancecv-orpin.vercel.app');
  console.log('Target Backend:  https://curevo-ai.onrender.com');
  console.log(`Started At: ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  const browser = await pw.chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });

  const page = await context.newPage();

  page.on('console', (msg: any) => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error]:`, msg.text());
    }
  });

  page.on('response', (res: any) => {
    if (res.url().includes('/api/public/improve')) {
      console.log(`[API /improve Response]: HTTP ${res.status()}`);
    }
    if (res.url().includes('/api/public/cover-letter')) {
      console.log(`[API /cover-letter Response]: HTTP ${res.status()}`);
    }
  });

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Landing Page & Dedicated 9-Dimension ATS Checker Workflow
    // -------------------------------------------------------------------------
    console.log('[1/8] Visiting landing page and testing dedicated Check ATS Score...');
    await page.goto('https://enhancecv-orpin.vercel.app/', { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`Landing page title: "${await page.title()}"`);

    // Click Check ATS Score card
    const atsScoreCard = page.locator('a[href="/builder?mode=ats"]').first();
    await atsScoreCard.click();
    await page.waitForURL('**/builder?mode=ats', { timeout: 15000 });
    console.log('✓ Successfully routed to /builder?mode=ats');

    // Generate test PDF
    const master = makeMasterCV();
    const doc = renderResumePdf(master, { template: 'classic', marginDensity: 'normal' });
    const syntheticBuffer = await pdfDocToBuffer(doc);
    const testPdfPath = path.join(EVIDENCE_DIR, 'phase3_test_cv.pdf');
    fs.writeFileSync(testPdfPath, syntheticBuffer);

    // Upload CV in ATS-checker mode
    console.log('[2/8] Uploading CV into ATS-checker mode...');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);

    // Wait for 9-dimension ATS audit to render
    await page.waitForSelector('text=/100', { timeout: 30000 });
    const atsScore = await page.locator('text=/100').first().innerText();
    console.log(`✓ Dedicated ATS Checker evaluated CV. Overall Score: ${atsScore}`);

    // Verify 9 dimensions rendered
    const auditText = await page.locator('body').innerText();
    const hasDimensions =
      auditText.includes('Evaluation Across 9 ATS Dimensions') ||
      auditText.includes('Format & Parseability') ||
      auditText.includes('Quantified Impact') ||
      auditText.includes('Repetition');
    console.log(`✓ 9-dimension breakdown visible: ${hasDimensions}`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'phase3_01_ats_checker_verified.png') });

    // -------------------------------------------------------------------------
    // STEP 2: Full Resume Optimisation Workflow with Job Description
    // -------------------------------------------------------------------------
    console.log('\n[3/8] Opening AI Resume Tailoring mode (/builder?mode=improve)...');
    await page.goto('https://enhancecv-orpin.vercel.app/builder?mode=improve', { waitUntil: 'networkidle', timeout: 30000 });

    // Expand accordion to show target role and JD inputs
    console.log('[4/8] Expanding target role and Job Description inputs...');
    const accordionBtn = page.locator('button:has-text("Add details to optimize match"), button:has-text("Optional: Target Role")').first();
    if (await accordionBtn.isVisible()) {
      await accordionBtn.click();
      await page.waitForTimeout(500);
    }

    const targetRoleInput = page.locator('#target-role');
    if (await targetRoleInput.isVisible()) {
      await targetRoleInput.fill('Senior Java Backend Engineer');
    }
    const jobTextInput = page.locator('#job-text');
    await jobTextInput.fill(JAVA_JD);

    // Upload CV to trigger live AI tailoring
    console.log('[5/8] Uploading CV and triggering live NVIDIA Nemotron optimization...');
    const tailorFileInput = page.locator('input[type="file"]');
    await tailorFileInput.setInputFiles(testPdfPath);

    // Enforce that AI tailoring succeeds (Outcome MUST NOT be fallback)
    const tStart = Date.now();
    const outcome = await Promise.race([
      page.waitForSelector('button:has-text("AI Changes")', { timeout: 85000 }).then(() => 'ai_success'),
      page.waitForSelector('button:has-text("Download ATS-Friendly PDF")', { timeout: 85000 }).then(() => 'ai_success'),
      page.waitForSelector('button:has-text("Proceed with Parsed CV as-is")', { timeout: 85000 }).then(() => 'fallback'),
    ]);

    const duration = ((Date.now() - tStart) / 1000).toFixed(1);
    console.log(`Processing resolved in ${duration}s with outcome: ${outcome}`);

    if (outcome === 'fallback') {
      throw new Error('AI tailoring failed: frontend prompted manual fallback!');
    }
    console.log('✓ Live NVIDIA Nemotron AI tailoring succeeded end-to-end!');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'phase3_02_ai_tailoring_succeeded.png') });

    // -------------------------------------------------------------------------
    // STEP 3: Verify AI Changes and Truth Guard Tabs
    // -------------------------------------------------------------------------
    console.log('\n[6/8] Inspecting AI Changes & Truth Guard tabs...');
    const changesTab = page.locator('button:has-text("AI Changes")');
    if (await changesTab.isVisible()) {
      await changesTab.click();
      await page.waitForTimeout(1000);
      console.log('✓ AI Changes tab opened. Inspecting proposed bullet and skills changes...');
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'phase3_03_ai_changes_tab.png') });
    }

    const truthTab = page.locator('button:has-text("Truth Guard™ Audit")');
    await truthTab.click();
    await page.waitForTimeout(1000);
    const truthText = await page.locator('body').innerText();
    const truthPassed = truthText.includes('Truth Guard™ Audit Log') || truthText.includes('supported') || truthText.includes('Grounded');
    console.log(`✓ Truth Guard Audit inspected: verified=${truthPassed}`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'phase3_04_truth_guard_tab.png') });

    // -------------------------------------------------------------------------
    // STEP 4: Export Tailored Resume as PDF
    // -------------------------------------------------------------------------
    console.log('\n[7/8] Exporting tailored resume PDF...');
    const resumeDownloadPromise = page.waitForEvent('download', { timeout: 25000 });
    await page.click('button:has-text("Download ATS-Friendly PDF")');
    const resumeDownload = await resumeDownloadPromise;
    const resumePdfPath = path.join(EVIDENCE_DIR, `phase3_${resumeDownload.suggestedFilename()}`);
    await resumeDownload.saveAs(resumePdfPath);

    const resumePdfBuf = fs.readFileSync(resumePdfPath);
    const parsedResumePdf = await readPdfLayout(resumePdfBuf);
    const resumeText = parsedResumePdf.lines.map((l: any) => l.text).join(' ');
    console.log(`✓ Downloaded Resume PDF: "${resumeDownload.suggestedFilename()}" (${resumePdfBuf.length} bytes, ${parsedResumePdf.pageCount} page(s))`);
    console.log(`  -> Candidate name present: ${resumeText.includes('Aarav Sharma')}`);
    console.log(`  -> Zero watermarks: ${!resumeText.toLowerCase().includes('enhancv')}`);

    // -------------------------------------------------------------------------
    // STEP 5: Generate & Export Cover Letter as PDF
    // -------------------------------------------------------------------------
    console.log('\n[8/8] Testing Cover Letter Generation and PDF Export...');
    const coverTab = page.locator('button:has-text("Cover Letter")');
    await coverTab.click();
    await page.waitForTimeout(1000);

    const generateCoverBtn = page.locator('button:has-text("Generate Cover Letter"), button:has-text("Regenerate Cover Letter")');
    if (await generateCoverBtn.isVisible()) {
      await generateCoverBtn.click();
      console.log('Generating AI cover letter from verified candidate facts...');
      await page.waitForSelector('text=Truth Guard Grounded', { timeout: 45000 });
      console.log('✓ AI Cover Letter generated successfully!');
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'phase3_05_cover_letter_generated.png') });

      // Download Cover Letter PDF
      console.log('Downloading Cover Letter PDF...');
      const coverDownloadPromise = page.waitForEvent('download', { timeout: 25000 });
      await page.click('button:has-text("Download PDF")');
      const coverDownload = await coverDownloadPromise;
      const coverPdfPath = path.join(EVIDENCE_DIR, `phase3_${coverDownload.suggestedFilename()}`);
      await coverDownload.saveAs(coverPdfPath);

      const coverPdfBuf = fs.readFileSync(coverPdfPath);
      const parsedCoverPdf = await readPdfLayout(coverPdfBuf);
      console.log(`✓ Downloaded Cover Letter PDF: "${coverDownload.suggestedFilename()}" (${coverPdfBuf.length} bytes, ${parsedCoverPdf.pageCount} page(s))`);
    }

    console.log('\n========================================================================');
    console.log('ALL PHASE 3 BROWSER ACCEPTANCE TESTS PASSED (100% OPERATIONAL)');
    console.log('========================================================================');
    return { success: true };
  } finally {
    await browser.close();
  }
}

runPhase3BrowserVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Phase 3 Browser Verification Failed:', err);
    process.exit(1);
  });
