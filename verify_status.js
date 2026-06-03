const { chromium } = require('playwright');
const path = require('path');
const OUT = '/home/user/workspace/verification_screenshots';
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3456/status', { waitUntil: 'commit', timeout: 45000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(()=>{});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'verify_status_viewport.png') });
  console.log('OK status');
  await browser.close();
})();
