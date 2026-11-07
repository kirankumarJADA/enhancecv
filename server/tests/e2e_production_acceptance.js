// Curevo AI — Full Production Browser Acceptance Runner (Phase 9R / 9S)
//
// Tests the live production frontend against all public workflows without authentication.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://enhancecv-orpin.vercel.app';
const EVIDENCE_DIR = path.resolve(__dirname, 'acceptance-evidence');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function runBrowserAcceptance() {
  console.log(`Starting production browser acceptance tests on ${BASE_URL}...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const results = [];

  async function testRoute(name, route, checkFn) {
    console.log(`Testing [${name}] at ${BASE_URL}${route}...`);
    try {
      const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
      const status = response ? response.status() : 0;
      if (status !== 200) {
        throw new Error(`HTTP status ${status}`);
      }

      await checkFn(page);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`) });
      console.log(`✓ ${name}: PASSED`);
      results.push({ name, status: 'PASSED', error: null });
    } catch (err) {
      console.error(`✗ ${name}: FAILED — ${err.message}`);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}_FAILED.png`) }).catch(() => {});
      results.push({ name, status: 'FAILED', error: err.message });
    }
  }

  // 1. Landing Page
  await testRoute('01_Landing_Page', '/', async (p) => {
    await p.waitForSelector('text=Curevo AI');
    const headerTitle = await p.textContent('h1');
    if (!headerTitle) throw new Error('H1 header missing on landing');
  });

  // 2. Public Builder
  await testRoute('02_Public_Builder', '/builder', async (p) => {
    await p.waitForSelector('text=Resume Builder');
  });

  // 3. Job Discovery
  await testRoute('03_Jobs_Discovery', '/jobs', async (p) => {
    await p.waitForSelector('text=Job Discovery');
  });

  // 4. Applications Kanban
  await testRoute('04_Applications_Kanban', '/applications', async (p) => {
    await p.waitForSelector('text=Application Tracker');
  });

  // 5. Interview Coach
  await testRoute('05_Interview_Coach', '/interview', async (p) => {
    await p.waitForSelector('text=Interview Preparation');
  });

  // 6. LinkedIn Optimizer
  await testRoute('06_LinkedIn_Optimizer', '/linkedin', async (p) => {
    await p.waitForSelector('text=LinkedIn Profile Optimizer');
  });

  // 7. Prepare Application Orchestrator
  await testRoute('07_Prepare_Application', '/prepare-application', async (p) => {
    await p.waitForSelector('text=Prepare My Application');
  });

  await browser.close();

  console.log('\n--- BROWSER ACCEPTANCE SUMMARY ---');
  let allPassed = true;
  for (const r of results) {
    console.log(`${r.status === 'PASSED' ? '✓' : '✗'} ${r.name}: ${r.status}${r.error ? ` (${r.error})` : ''}`);
    if (r.status !== 'PASSED') allPassed = false;
  }

  if (!allPassed) {
    process.exit(1);
  }
}

runBrowserAcceptance().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
