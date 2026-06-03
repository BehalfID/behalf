const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3456';
const OUT = '/home/user/workspace/verification_screenshots';
fs.mkdirSync(OUT, { recursive: true });

const pages = [
  { path: '/', name: 'homepage', full: true },
  { path: '/login', name: 'login', full: true },
  { path: '/signup', name: 'signup' },
  { path: '/docs', name: 'docs_overview' },
  { path: '/docs/quickstart', name: 'docs_quickstart', full: true },
  { path: '/docs/concepts', name: 'docs_concepts' },
  { path: '/docs/api', name: 'docs_api' },
  { path: '/sandbox', name: 'sandbox', full: true },
  { path: '/status', name: 'status' },
  { path: '/blog', name: 'blog' },
  { path: '/security', name: 'security' },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const p of pages) {
    const page = await context.newPage();
    try {
      await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `verify_${p.name}_viewport.png`) });
      if (p.full) {
        await page.screenshot({ path: path.join(OUT, `verify_${p.name}_full.png`), fullPage: true });
      }
      console.log('OK', p.name);
    } catch (e) {
      console.error('FAIL', p.name, e.message);
      await page.screenshot({ path: path.join(OUT, `verify_${p.name}_error.png`) }).catch(() => {});
    }
    await page.close();
  }
  await browser.close();
})();
