/**
 * Puppeteer layout tests for main page, hamburger menu, and footer.
 *
 * Run after starting the dev server:
 *   npm run dev &  npm run test:e2e
 *
 * Or point at a deployed URL:
 *   E2E_BASE_URL=https://staging.example.com npm run test:e2e
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const puppeteer = require("puppeteer");

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const DESKTOP = { width: 1280, height: 800 };
const MOBILE  = { width: 375, height: 812 };
const RESPONSIVE_WIDTHS = [390, 768, 1024, 1440];
const PUBLIC_SHELL_ROUTE = "/de/security";

let browser;
let page;

async function setup() {
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  page = await browser.newPage();
}

async function teardown() {
  await browser.close();
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  PASS: ${message}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBox(selector) {
  return page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, width: r.width };
  });
}

function exists(selector) {
  return page.$(selector).then((el) => el !== null);
}

function isVisible(selector) {
  return page.$(selector).then((el) => {
    if (!el) return false;
    return page.$eval(selector, (node) => {
      const s = window.getComputedStyle(node);
      return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
    });
  });
}

function textHasNoDecorativeEmoji(selector) {
  return page.$eval(selector, (el) => {
    const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const withoutDecisionSymbols = (el.textContent || "").replace(/[✓✗⚠]/g, "");
    return !EMOJI_RE.test(withoutDecisionSymbols);
  });
}

function hasNoHorizontalOverflow() {
  return page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1 &&
    document.body.scrollWidth <= window.innerWidth + 1
  );
}

async function createThemePage({ storedTheme = null, systemTheme = "light" } = {}) {
  const context = await browser.createBrowserContext();
  const themePage = await context.newPage();
  await themePage.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: systemTheme },
  ]);
  await themePage.evaluateOnNewDocument((stored) => {
    if (stored === null) localStorage.removeItem("theme");
    else localStorage.setItem("theme", stored);

    window.__behalfThemeMutations = [];
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function setAttributeWithThemeProbe(name, value) {
      if (this.tagName === "HTML" && name === "data-theme") {
        window.__behalfThemeMutations.push(value);
      }
      return setAttribute.call(this, name, value);
    };
  }, storedTheme);
  return { context, themePage };
}

// ── Test suites ───────────────────────────────────────────────────────────────

async function testDesktopNav() {
  console.log("\n[Desktop nav]");
  await page.setViewport(DESKTOP);
  await page.goto(`${BASE_URL}${PUBLIC_SHELL_ROUTE}`, { waitUntil: "networkidle0" });

  assert(await exists(".public-nav"),                     "nav renders");
  assert(await exists(".public-nav .site-logo"),          "logo present in nav");
  assert(await exists(".public-nav__links"),              "desktop links container present");
  assert(!(await isVisible(".public-nav__hamburger")),    "hamburger hidden on desktop");
  assert(!(await isVisible(".public-nav__mobile-cta")),   "mobile CTA hidden on desktop");
  assert(await isVisible(".public-nav__links"),           "desktop links visible");
  assert(
    await page.$eval(".public-nav__actions", (el) => /Sign in/.test(el.textContent || "")),
    "unauthenticated desktop nav keeps Sign in"
  );
  assert(
    !(await page.$eval(".public-nav__actions", (el) => /To Dashboard/.test(el.textContent || ""))),
    "desktop nav does not render both auth actions"
  );
}

async function testMobileNavLayout() {
  console.log("\n[Mobile nav — logo centering]");
  await page.setViewport(MOBILE);
  await page.goto(`${BASE_URL}${PUBLIC_SHELL_ROUTE}`, { waitUntil: "networkidle0" });

  assert(await isVisible(".public-nav__hamburger"),      "hamburger visible on mobile");
  assert(!(await isVisible(".public-nav__links")),       "desktop links hidden on mobile");
  assert(await isVisible(".public-nav__mobile-cta"),     "mobile CTA visible on mobile");

  // Logo must be horizontally centered within ±12 px
  const navBox  = await getBox(".public-nav");
  const logoBox = await getBox(".public-nav .site-logo");
  const navCenter  = navBox.left + navBox.width / 2;
  const logoCenter = logoBox.left + logoBox.width / 2;
  const offset = Math.abs(navCenter - logoCenter);
  assert(offset < 12, `logo centered (off by ${offset.toFixed(1)}px)`);

  // Hamburger must sit at the left edge
  const hamBox = await getBox(".public-nav__hamburger");
  assert(hamBox.left - navBox.left < 40, "hamburger at left edge");
}

async function testMobileDrawer() {
  console.log("\n[Mobile nav — drawer open/close]");
  await page.setViewport(MOBILE);
  await page.goto(`${BASE_URL}${PUBLIC_SHELL_ROUTE}`, { waitUntil: "networkidle0" });

  assert(!(await exists(".public-nav__drawer")), "drawer initially closed");

  await page.click(".public-nav__hamburger");
  await page.waitForSelector(".public-nav__drawer");
  assert(await isVisible(".public-nav__drawer"),           "drawer opens on hamburger click");
  assert(await exists(".public-nav__drawer a[href]"),      "drawer contains links");
  assert(await exists('.public-nav__drawer a[href$="/login"]'), "unauthenticated mobile drawer keeps its localized login action");
  assert(
    !(await page.$eval(".public-nav__drawer", (el) => /To Dashboard/.test(el.textContent || ""))),
    "mobile drawer does not render both auth actions"
  );

  await page.$eval(".public-nav__drawer a[href]", (el) => el.focus());
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  assert(
    await page.$eval(".public-nav__drawer", (el) => el.contains(document.activeElement)),
    "keyboard focus remains inside the public drawer"
  );

  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
  assert(!(await exists(".public-nav__drawer")),           "drawer closes on Escape");
}

async function testNoEmojis() {
  console.log("\n[No emojis in page content]");
  await page.setViewport(DESKTOP);
  await page.goto(`${BASE_URL}${PUBLIC_SHELL_ROUTE}`, { waitUntil: "networkidle0" });

  assert(await textHasNoDecorativeEmoji(".public-nav"),    "no decorative emojis in nav");
  assert(await textHasNoDecorativeEmoji(".marketing"),     "no decorative emojis on main page");
  assert(await textHasNoDecorativeEmoji(".site-footer"),   "no decorative emojis in footer");
}

async function testFooterLayout() {
  console.log("\n[Footer layout]");
  await page.setViewport(DESKTOP);
  await page.goto(`${BASE_URL}${PUBLIC_SHELL_ROUTE}`, { waitUntil: "networkidle0" });

  assert(await exists(".site-footer"),          "footer renders");
  assert(await exists(".site-footer__brand"),   "footer brand section exists");
  assert(await exists(".site-footer__cols"),    "footer nav columns exist");

  const colCount = await page.$$eval(".site-footer__cols > div", (els) => els.length);
  assert(colCount === 4, `footer has 4 nav columns (got ${colCount})`);

  // Text should be left-aligned
  const align = await page.$eval(".site-footer__cols", (el) =>
    window.getComputedStyle(el).textAlign
  );
  assert(
    align === "left" || align === "start",
    `footer columns left-aligned (got "${align}")`
  );

  // At 480px it must collapse to a single column
  await page.setViewport({ width: 480, height: 812 });
  const grid = await page.$eval(".site-footer__cols", (el) =>
    window.getComputedStyle(el).gridTemplateColumns
  );
  assert(!grid.includes(" "), `footer is 1-column at 480px (got "${grid}")`);
}

async function testCanonicalHomepage() {
  console.log("\n[Canonical homepage cutover]");

  for (const route of ["/", "/de"]) {
    for (const width of RESPONSIVE_WIDTHS) {
      await page.setViewport({ width, height: width === 390 ? 844 : 960 });
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle0" });

      assert(await exists('header .site-logo[href="/"]'), `${route} uses the canonical brand link at ${width}px`);
      assert(await page.$eval("header", (el) => /Sign in/.test(el.textContent || "")), `${route} keeps Sign in when logged out at ${width}px`);
      assert(!(await page.$eval("header", (el) => /To Dashboard/.test(el.textContent || ""))), `${route} does not duplicate auth actions at ${width}px`);
      assert(await exists("main h1"), `${route} renders the approved primary heading at ${width}px`);
      assert(await exists('[role="tablist"][aria-label="Decision outcome"]'), `${route} keeps the authorization demo`);
      assert(await exists('[role="tablist"][aria-label="Product capabilities"]'), `${route} keeps the product showcase`);
      assert(!(await page.$eval("body", (body) => /production is unchanged|preview:\s*\/home-v2/i.test(body.textContent || ""))), `${route} has no preview notice`);
      assert((await page.$$eval("main > section", (sections) => sections.length)) === 6, `${route} keeps the compact six-section structure`);
      assert(await hasNoHorizontalOverflow(), `${route} has no horizontal overflow at ${width}px`);
    }
  }
}

async function testHomepageInteractions() {
  console.log("\n[Homepage authorization and product interactions]");
  await page.setViewport(DESKTOP);
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle0" });

  const decisionTabs = '[role="tablist"][aria-label="Decision outcome"] [role="tab"]';
  await page.focus(`${decisionTabs}[aria-selected="true"]`);
  await page.keyboard.press("ArrowRight");
  assert(
    await page.$eval(`${decisionTabs}[aria-selected="true"]`, (tab) => tab.textContent.trim() === "Allowed"),
    "arrow keys select the Allowed authorization state"
  );
  await page.keyboard.press("End");
  assert(
    await page.$eval(`${decisionTabs}[aria-selected="true"]`, (tab) => tab.textContent.trim() === "Denied"),
    "End selects the Denied authorization state"
  );

  for (const state of [
    { tab: "Approval", verdict: "approval required" },
    { tab: "Allowed", verdict: "allowed" },
    { tab: "Denied", verdict: "denied" },
  ]) {
    await page.$$eval(decisionTabs, (tabs, label) => {
      tabs.find((tab) => tab.textContent.trim() === label)?.click();
    }, state.tab);
    const decisionState = await page.$eval(
      '[role="tablist"][aria-label="Decision outcome"]',
      (tablist, expected) => {
        const panel = tablist.parentElement?.parentElement;
        const selected = tablist.querySelector('[role="tab"][aria-selected="true"]');
        return {
          selected: selected?.textContent.trim(),
          hasVerdict: (panel?.textContent || "").toLowerCase().includes(expected),
          hasIcon: Boolean(panel?.querySelector("svg")),
        };
      },
      state.verdict
    );
    assert(decisionState.selected === state.tab, `${state.tab} remains visibly and semantically selected`);
    assert(decisionState.hasVerdict, `${state.tab} exposes a textual decision meaning`);
    assert(decisionState.hasIcon, `${state.tab} retains a non-color decision icon`);
  }

  const managedProfileTab = '[role="tablist"][aria-label="Product capabilities"] [role="tab"]:last-child';
  await page.click(managedProfileTab);
  assert(
    await page.$eval('[role="tabpanel"]', (panel) => /Managed coding-agent profile/.test(panel.textContent || "")),
    "Managed profiles renders inside the consolidated showcase"
  );
}

async function testHomepageMobileNavigation() {
  console.log("\n[Homepage mobile navigation]");
  await page.setViewport(MOBILE);
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle0" });

  assert(await isVisible('button[aria-controls="marketing-drawer"]'), "homepage menu button is visible");
  assert(!(await exists("#marketing-drawer")), "homepage drawer starts closed");
  await page.click('button[aria-controls="marketing-drawer"]');
  await page.waitForSelector("#marketing-drawer");
  assert(await isVisible("#marketing-drawer"), "homepage drawer opens");
  assert(await page.$eval("#marketing-drawer", (el) => /Sign in/.test(el.textContent || "")), "homepage drawer keeps Sign in when logged out");
  assert(!(await page.$eval("#marketing-drawer", (el) => /To Dashboard/.test(el.textContent || ""))), "homepage drawer does not duplicate auth actions");
  assert(await exists('#marketing-drawer a[href="/signup"]'), "homepage drawer keeps the signup CTA");
  assert(await isVisible('#marketing-drawer select[aria-label="Theme preference"]'), "homepage drawer keeps the theme control");
  assert(await hasNoHorizontalOverflow(), "homepage drawer has no page-level overflow");
}

async function testHomepageThemeInitialization() {
  console.log("\n[Homepage theme initialization]");

  const scenarios = [
    { route: "/", storedTheme: null, systemTheme: "dark", expected: "dark", label: "system dark" },
    { route: "/", storedTheme: null, systemTheme: "light", expected: "light", label: "system light" },
    { route: "/", storedTheme: "light", systemTheme: "dark", expected: "light", label: "explicit light" },
    { route: "/", storedTheme: "dark", systemTheme: "light", expected: "dark", label: "explicit dark" },
    { route: "/de", storedTheme: null, systemTheme: "dark", expected: "dark", label: "locale system dark" },
    { route: "/de", storedTheme: "system", systemTheme: "light", expected: "light", label: "legacy system value" },
  ];

  for (const scenario of scenarios) {
    const { context, themePage } = await createThemePage(scenario);
    try {
      await themePage.setViewport({ width: 1024, height: 900 });
      await themePage.goto(`${BASE_URL}${scenario.route}`, { waitUntil: "networkidle0" });
      const result = await themePage.evaluate(() => ({
        theme: document.documentElement.getAttribute("data-theme"),
        mutations: window.__behalfThemeMutations,
      }));
      assert(result.theme === scenario.expected, `${scenario.label} resolves to ${scenario.expected}`);
      assert(result.mutations[0] === scenario.expected, `${scenario.label} applies the correct first observed theme`);
    } finally {
      await context.close();
    }
  }
}

async function testHomepageThemeControlAndLiveSystemChanges() {
  console.log("\n[Homepage theme control and live system changes]");
  const { context, themePage } = await createThemePage({ storedTheme: null, systemTheme: "light" });

  try {
    await themePage.setViewport({ width: 1440, height: 960 });
    await themePage.goto(`${BASE_URL}/`, { waitUntil: "networkidle0" });
    const control = 'header select[aria-label="Theme preference"]';

    await themePage.focus(control);
    await themePage.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
    await themePage.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
    assert(await themePage.$eval(control, (el) => document.activeElement === el), "system change does not steal focus");
    assert(await themePage.evaluate(() => localStorage.getItem("theme") === null), "automatic mode keeps the theme key absent");

    await themePage.select(control, "light");
    assert(await themePage.evaluate(() => localStorage.getItem("theme") === "light"), "Light stores the existing explicit value");
    await themePage.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
    assert(await themePage.evaluate(() => document.documentElement.getAttribute("data-theme") === "light"), "explicit light overrides system dark");

    await themePage.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    await themePage.select(control, "dark");
    assert(await themePage.evaluate(() => localStorage.getItem("theme") === "dark"), "Dark stores the existing explicit value");
    assert(await themePage.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark"), "explicit dark overrides system light");

    await themePage.select(control, "system");
    assert(await themePage.evaluate(() => localStorage.getItem("theme") === null), "System removes the existing theme key");
    assert(await themePage.evaluate(() => document.documentElement.getAttribute("data-theme") === "light"), "System immediately follows current light preference");
    await themePage.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
    await themePage.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
    assert(true, "System reacts to an operating-system change without reload");
  } finally {
    await context.close();
  }
}

async function testDocsShellDesktop() {
  console.log("\n[Documentation shell — desktop]");
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/de/docs/cli`, { waitUntil: "networkidle0" });

  assert(await isVisible(".docs-sidebar"), "persistent docs navigation visible");
  assert(await isVisible(".docs-utility-header"), "compact docs utility header visible");
  assert(await page.$eval(".docs-utility-header", (el) => /Sign in/.test(el.textContent || "")), "docs utility header keeps Sign in when logged out");
  assert(!(await page.$eval(".docs-utility-header", (el) => /To Dashboard/.test(el.textContent || ""))), "docs utility header does not duplicate auth actions");
  assert(await exists('.docs-nav a[aria-current="page"]'), "current docs page exposed semantically");
  assert(await page.$eval('.docs-nav a[aria-current="page"]', (el) => el.textContent.trim() === "CLI"), "CLI nav item is current");

  const groupCount = await page.$$eval(".docs-sidebar .docs-nav__group", (groups) => groups.length);
  assert(groupCount === 3, `docs navigation retains three visual groups (got ${groupCount})`);

  const codeOverflow = await page.$eval(".docs-article .ui-code", (el) =>
    ["auto", "scroll"].includes(window.getComputedStyle(el).overflowX)
  );
  assert(codeOverflow, "code blocks scroll internally when needed");
  assert(await hasNoHorizontalOverflow(), "docs page has no page-level horizontal overflow");
}

async function testDocsShellMobile() {
  console.log("\n[Documentation shell — mobile drawer]");
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/de/docs/cli`, { waitUntil: "networkidle0" });

  assert(await isVisible(".docs-mobile-header"), "mobile docs header visible");
  assert(!(await isVisible(".docs-sidebar")), "desktop docs sidebar hidden");
  assert(!(await exists(".docs-mobile-drawer")), "docs drawer initially closed");

  await page.click(".docs-mobile-header__toggle");
  await page.waitForSelector(".docs-mobile-drawer");
  assert(await isVisible(".docs-mobile-drawer"), "docs drawer opens");
  assert(await exists('.docs-mobile-drawer a[aria-current="page"]'), "drawer retains current-page state");

  await page.$eval(".docs-mobile-drawer button", (el) => el.focus());
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  assert(
    await page.$eval(".docs-mobile-drawer", (el) => el.contains(document.activeElement)),
    "keyboard focus remains inside the docs drawer"
  );

  await page.keyboard.press("Escape");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert(!(await exists(".docs-mobile-drawer")), "docs drawer closes on Escape");
  assert(await hasNoHorizontalOverflow(), "mobile docs page has no page-level overflow");
}

async function testPublicResponsiveWidths() {
  console.log("\n[Public routes — responsive overflow]");
  const routes = ["/de/docs/cli", "/es/privacy", "/fr/security"];

  for (const width of RESPONSIVE_WIDTHS) {
    await page.setViewport({ width, height: width < 800 ? 900 : 960 });
    for (const route of routes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle0" });
      assert(await hasNoHorizontalOverflow(), `${route} has no horizontal overflow at ${width}px`);
    }
  }
}

async function testPublicNotFound() {
  console.log("\n[Public 404]");
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/de/route-that-does-not-exist`, { waitUntil: "networkidle0" });

  assert(await exists(".public-error-page"), "branded not-found page renders");
  assert(await exists(".public-error-state h1"), "not-found page has a primary heading");
  assert(await exists('.public-error-state a[href="/"]'), "not-found page provides a route home");
  assert(await exists('.public-error-state a[href="/docs"]'), "not-found page provides documentation route");
  assert(await hasNoHorizontalOverflow(), "not-found page has no horizontal overflow");
}

async function testHomeV2Redirect() {
  console.log("\n[/home-v2 redirect]");
  await page.setViewport(DESKTOP);
  const response = await page.goto(`${BASE_URL}/home-v2`, { waitUntil: "networkidle0" });
  const redirectChain = response.request().redirectChain();
  const homeV2Request = redirectChain.find((request) => new URL(request.url()).pathname === "/home-v2");
  const redirectLocation = homeV2Request?.response()?.headers().location;
  const finalPath = new URL(page.url()).pathname;

  assert(homeV2Request?.response()?.status() === 308, "/home-v2 returns a permanent redirect");
  assert(new URL(redirectLocation, BASE_URL).pathname === "/", "/home-v2 redirects to the canonical root");
  assert(["/", "/de", "/es", "/fr"].includes(finalPath), "locale routing keeps the final homepage canonical");
  assert(await exists('header .site-logo[href="/"]'), "redirect target renders the canonical homepage");
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  let passed = 0;
  let failed = 0;

  await setup();

  const suites = [
    testDesktopNav,
    testMobileNavLayout,
    testMobileDrawer,
    testNoEmojis,
    testFooterLayout,
    testCanonicalHomepage,
    testHomepageInteractions,
    testHomepageMobileNavigation,
    testHomepageThemeInitialization,
    testHomepageThemeControlAndLiveSystemChanges,
    testDocsShellDesktop,
    testDocsShellMobile,
    testPublicResponsiveWidths,
    testPublicNotFound,
    testHomeV2Redirect,
  ];

  for (const suite of suites) {
    try {
      await suite();
      passed++;
    } catch (err) {
      console.error(`  ${err.message}`);
      failed++;
    }
  }

  await teardown();

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
