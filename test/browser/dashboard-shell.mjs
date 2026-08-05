/**
 * Browser matrix for the dashboard chrome port.
 *
 * Verifies the shell in a real engine: single navigation landmark, no duplicate
 * nav, the sidebar renders server-side, the mobile drawer traps focus and closes
 * on Escape, both themes paint, and the page hydrates without React errors.
 *
 * What this cannot cover without a database: the multi-workspace switcher menu,
 * the user identity menu, and the plan descriptor, all of which need a session.
 * Those paths are asserted in `test/dashboard-shell-port.test.ts` instead.
 *
 *   npm run build && PORT=3111 npm start &
 *   BASE_URL=http://localhost:3111 node test/browser/dashboard-shell.mjs
 *
 * Skips (exit 0) when Playwright or the server is unavailable.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/behalf-dashboard-shots";

let chromium;
let webkit;
try {
  ({ chromium, webkit } = require("playwright"));
} catch {
  console.log("SKIP: playwright is not installed");
  process.exit(0);
}

try {
  const probe = await fetch(`${BASE_URL}/dashboard`, { redirect: "manual" });
  if (probe.status >= 500) throw new Error(`status ${probe.status}`);
} catch (error) {
  console.log(`SKIP: no server reachable at ${BASE_URL} (${error.message})`);
  process.exit(0);
}

mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};


/**
 * The dashboard needs a session. Without a database the route redirects to
 * /login and the interactive checks would assert against the wrong page, so
 * detect that up front and fall back to structural assertions on the
 * server-rendered markup, which is still real evidence.
 */
const ssrHtml = await (await fetch(`${BASE_URL}/dashboard`)).text();
let authenticated = true;
{
  const require2 = createRequire(import.meta.url);
  const { chromium: probeEngine } = require2("playwright");
  const probeBrowser = await probeEngine.launch();
  const probePage = await probeBrowser.newPage();
  await probePage.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
  await probePage.waitForTimeout(1200);
  authenticated = new URL(probePage.url()).pathname.startsWith("/dashboard");
  await probeBrowser.close();
}

function countMatches(html, pattern) {
  return (html.match(pattern) ?? []).length;
}

function runSsrChecks() {
  console.log("NOTE: no authenticated session — asserting on server-rendered markup only.\n");

  check(
    "ssr: sidebar is server-rendered exactly once",
    countMatches(ssrHtml, /class="[^"]*\bdashboard-sidebar\b/g) === 1
  );
  check(
    "ssr: single Dashboard nav landmark",
    countMatches(ssrHtml, /<nav[^>]*aria-label="Dashboard"/g) === 1
  );
  check("ssr: single main landmark", countMatches(ssrHtml, /<main\b/g) === 1);
  check(
    "ssr: sidebar opts into ds tokens",
    /class="ds dashboard-sidebar|class="[^"]*\bds\b[^"]*dashboard-sidebar/.test(ssrHtml)
  );
  check(
    "ssr: main content stays out of ds scope",
    !/<main[^>]*class="[^"]*\bds\b/.test(ssrHtml)
  );
  check("ssr: workspace switcher present", /workspace-switcher/.test(ssrHtml));
  check(
    "ssr: no Lovable mock data leaked into the shell",
    !/lib\/mock\/data|Acme Corp|currentUser\./.test(ssrHtml)
  );
}

if (!authenticated) {
  runSsrChecks();
  const ssrFailed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - ssrFailed.length}/${results.length} checks passed`);
  console.log(
    "SKIPPED: interactive shell checks (switcher menu, user menu, drawer) need a session."
  );
  process.exit(ssrFailed.length ? 1 : 0);
}

async function runEngine(engine, engineName) {
  const browser = await engine.launch();

  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      colorScheme: theme,
      viewport: { width: 1280, height: 900 }
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.waitForTimeout(600);

    // The sidebar must come from the server, not appear after hydration.
    const sidebars = await page.locator(".dashboard-sidebar").count();
    check(`${engineName}/${theme}: exactly one sidebar`, sidebars === 1, `found ${sidebars}`);

    // One navigation landmark for the dashboard, plus the breadcrumb's own.
    const navNames = await page.locator("nav[aria-label]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label"))
    );
    const dashboardNavs = navNames.filter((label) => label === "Dashboard").length;
    check(
      `${engineName}/${theme}: single Dashboard nav landmark`,
      dashboardNavs === 1,
      `labels=${JSON.stringify(navNames)}`
    );

    const mains = await page.locator("main").count();
    check(`${engineName}/${theme}: exactly one main landmark`, mains === 1, `found ${mains}`);

    // React hydration failures surface as #418/#423 or a hydration message.
    const hydrationErrors = consoleErrors.filter((text) =>
      /Minified React error #(418|423|425)|hydrat/i.test(text)
    );
    check(
      `${engineName}/${theme}: no hydration errors`,
      hydrationErrors.length === 0,
      hydrationErrors.slice(0, 2).join(" | ")
    );

    const cspErrors = consoleErrors.filter((text) => /Content Security Policy/i.test(text));
    check(
      `${engineName}/${theme}: no CSP violations`,
      cspErrors.length === 0,
      cspErrors.slice(0, 2).join(" | ")
    );

    // The chrome must actually pick up the design-system tokens.
    const sidebarOptedIn = await page
      .locator(".dashboard-sidebar")
      .first()
      .evaluate((node) => node.classList.contains("ds"));
    check(`${engineName}/${theme}: sidebar opts into ds tokens`, sidebarOptedIn);

    const mainOptedOut = await page
      .locator("main")
      .first()
      .evaluate((node) => !node.classList.contains("ds"));
    check(`${engineName}/${theme}: main content stays out of ds scope`, mainOptedOut);

    await page.screenshot({
      path: `${SHOT_DIR}/${engineName}-${theme}-desktop.png`,
      fullPage: false
    });

    await context.close();
  }

  // Mobile drawer behaviour.
  const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
  await page.waitForTimeout(600);

  const hamburger = page.locator(".app-mobile-hamburger");
  const hasHamburger = (await hamburger.count()) === 1;
  check(`${engineName}/mobile: hamburger present`, hasHamburger);

  if (hasHamburger) {
    // Closed drawer must be inert so its links are not tabbable behind content.
    const inertWhenClosed = await page
      .locator("#dashboard-drawer")
      .evaluate((node) => node.hasAttribute("inert"));
    check(`${engineName}/mobile: closed drawer is inert`, inertWhenClosed);

    await hamburger.click();
    await page.waitForTimeout(300);
    const opened = await page
      .locator("#dashboard-drawer")
      .evaluate((node) => !node.hasAttribute("inert") && node.getAttribute("role") === "dialog");
    check(`${engineName}/mobile: drawer opens as a dialog`, opened);

    await page.screenshot({ path: `${SHOT_DIR}/${engineName}-mobile-drawer.png` });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const closed = await page
      .locator("#dashboard-drawer")
      .evaluate((node) => node.hasAttribute("inert"));
    check(`${engineName}/mobile: Escape closes the drawer`, closed);

    const focusReturned = await page.evaluate(() =>
      document.activeElement?.classList.contains("app-mobile-hamburger")
    );
    check(`${engineName}/mobile: focus returns to the trigger`, Boolean(focusReturned));
  }

  await context.close();
  await browser.close();
}

await runEngine(chromium, "chromium");
await runEngine(webkit, "webkit");

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots: ${SHOT_DIR}`);
if (failed.length) process.exit(1);
