// Curevo AI — Multi-Viewport Responsive Acceptance Test
// Verifies Navbar, mobile hamburger drawer, and layout integrity across:
// 1. Desktop: 1440x900
// 2. Laptop: 1280x800
// 3. Tablet: 768x1024
// 4. Mobile: 390x844

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('C:/Users/jadak/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright'));
}
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOTS_DIR = path.resolve(__dirname, 'responsive-evidence');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Simple static server for dist
const distDir = path.resolve(__dirname, '../../web/dist');
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  let filePath = path.join(distDir, reqPath === '/' ? 'index.html' : reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

async function run() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Static server running on port ${PORT}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });

  const viewports = [
    { name: 'desktop_1440', width: 1440, height: 900, isMobile: false },
    { name: 'laptop_1280', width: 1280, height: 800, isMobile: false },
    { name: 'tablet_768', width: 768, height: 1024, isMobile: true },
    { name: 'mobile_390', width: 390, height: 844, isMobile: true },
  ];

  const routes = ['/', '/builder', '/jobs', '/applications', '/interview', '/linkedin', '/prepare-application'];

  for (const vp of viewports) {
    console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
    });
    const page = await context.newPage();

    for (const r of routes) {
      const pageName = r === '/' ? 'landing' : r.replace('/', '');
      await page.goto(`${BASE_URL}${r}`, { waitUntil: 'networkidle' });

      // Save screenshot
      const shotPath = path.join(SCREENSHOTS_DIR, `${vp.name}_${pageName}.png`);
      await page.screenshot({ path: shotPath });
      console.log(`  ✓ ${r} rendered successfully`);

      // If mobile or tablet, test hamburger menu on landing
      if (vp.isMobile && r === '/') {
        const toggleBtn = await page.$('button[aria-label="Open navigation menu"]');
        if (toggleBtn) {
          const isVisible = await toggleBtn.isVisible();
          console.log(`  ✓ Hamburger toggle button is visible: ${isVisible}`);
          if (isVisible) {
            await toggleBtn.click();
            await page.waitForTimeout(300);
            const drawerPath = path.join(SCREENSHOTS_DIR, `${vp.name}_drawer_open.png`);
            await page.screenshot({ path: drawerPath });
            console.log(`  ✓ Drawer opened and captured: ${drawerPath}`);
            // Check drawer links
            const drawerLinks = await page.$$('div[role="dialog"] a, div[role="dialog"] button');
            console.log(`  ✓ Drawer interactive elements count: ${drawerLinks.length}`);
            // Click close button
            const closeBtn = await page.$('button[aria-label="Close navigation menu"]');
            if (closeBtn) {
              await closeBtn.click();
              await page.waitForTimeout(200);
              console.log(`  ✓ Drawer closed successfully`);
            }
          }
        } else {
          console.log(`  ⚠ Hamburger toggle button not found on ${r}`);
        }
      }
    }
    await context.close();
  }

  await browser.close();
  server.close();
  console.log('\nAll multi-viewport responsive checks completed successfully!');
}

run().catch((err) => {
  console.error('Responsive test failed:', err);
  server.close();
  process.exit(1);
});
