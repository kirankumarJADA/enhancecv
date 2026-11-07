const pw = require('C:/Users/jadak/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

async function inspectReady() {
  const browser = await pw.chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto('https://enhancecv-orpin.vercel.app/builder?mode=improve', { waitUntil: 'networkidle' });
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('C:/Users/jadak/OneDrive/Desktop/enhancecv-acceptance-evidence/deployed_input_cv.pdf');
  await page.waitForSelector('button:has-text("Download ATS-Friendly PDF")', { timeout: 75000 });

  const buttons = await page.evaluate(() => Array.from((globalThis as any).document.querySelectorAll('button')).map((b: any) => b.textContent.trim()));
  console.log('BUTTONS IN READY STATE:', buttons);

  const tabs = await page.evaluate(() => Array.from((globalThis as any).document.querySelectorAll('[role="tab"], .tab, button')).map((t: any) => t.textContent.trim()));
  console.log('TABS/BUTTONS:', tabs);

  await browser.close();
}

inspectReady().catch(console.error);
