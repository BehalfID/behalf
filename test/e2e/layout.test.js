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

function textHasNoEmoji(selector) {
  return page.$eval(selector, (el) => {
    const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    return !EMOJI_RE.test(el.textContent || "");
  });
}

// ── Test suites ───────────────────────────────────────────────────────────────

async function testDesktopNav() {
  console.log("\n[Desktop nav]");
  await page.setViewport(DESKTOP);
  await page.goto(`${BASE_URL}/en`, { waitUntil: "networkidle0" });

  assert(await exists(".public-nav"),                     "nav renders");
  assert(await exists(".public-nav .site-logo"),          "logo present in nav");
  assert(await exists(".public-nav__links"),              "desktop links container present");
  assert(!(await isVisible(".public-nav__hamburger")),    "hamburger hidden on desktop");
  assert(!(await isVisible(".public-nav__mobile-cta")),   "mobile CTA hidden on desktop");
  assert(await isVisible(".public-nav__links"),           "desktop links visible");
}

async function testMobileNavLayout() {
  console.log("\n[Mobile nav — logo centering]");
  await page.setViewport(MOBILE);
  await page.goto(`${BASE_URL}/en`, { waitUntil: "networkidle0" });

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
  await page.goto(`${BASE_URL}/en`, { waitUntil: "networkidle0" });

  assert(!(await exists(".public-nav__drawer")), "drawer initially closed");

  await page.click(".public-nav__hamburger");
  await page.waitForSelector(".public-nav__drawer");
  assert(await isVisible(".public-nav__drawer"),           "drawer opens on hamburger click");
  assert(await exists(".public-nav__drawer a[href]"),      "drawer contains links");

  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
  assert(!(await exists(".public-nav__drawer")),           "drawer closes on Escape");
}

async function testNoEmojis() {
  console.log("\n[No emojis in page content]");
  await page.setViewport(DESKTOP);
  await page.goto(`${BASE_URL}/en`, { waitUntil: "networkidle0" });

  assert(await textHasNoEmoji(".public-nav"),              "no emojis in nav");
  assert(await textHasNoEmoji(".marketing"),               "no emojis on main page");
  assert(await textHasNoEmoji(".site-footer"),             "no emojis in footer");
}

async function testFooterLayout() {
  console.log("\n[Footer layout]");
  await page.setViewport(DESKTOP);
  await page.goto(`${BASE_URL}/en`, { waitUntil: "networkidle0" });

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

async function testDeploySection() {
  console.log("\n[Home deploy section layout]");
  await page.setViewport(DESKTOP);
  await page.goto(`${BASE_URL}/en`, { waitUntil: "networkidle0" });

  assert(await exists(".home-deploy"),          "deploy section renders");
  assert(await exists(".home-deploy__intro"),   "deploy intro present");
  assert(await exists(".home-deploy__h2"),      "deploy heading present");
  assert(await exists(".home-deploy__steps"),   "deploy steps list present");
  assert(await exists(".home-deploy__num"),     "deploy step numbers present");
  assert(await exists(".home-deploy__cta"),     "deploy CTA present");

  const padding = await page.$eval(".home-deploy", (el) => {
    const s = window.getComputedStyle(el);
    return { top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom) };
  });
  assert(padding.top > 40,    "deploy section has top padding");
  assert(padding.bottom > 40, "deploy section has bottom padding");
}

async function testMainPageAlignment() {
  console.log("\n[Main page section alignment]");
  await page.setViewport(DESKTOP);
  await page.goto(`${BASE_URL}/en`, { waitUntil: "networkidle0" });

  const leftAligned = [".home-hero", ".home-steps", ".home-code", ".home-deploy"];
  for (const sel of leftAligned) {
    const align = await page.$eval(sel, (el) =>
      window.getComputedStyle(el).textAlign
    );
    assert(
      align === "left" || align === "start",
      `${sel} is left-aligned (got "${align}")`
    );
  }
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
    testDeploySection,
    testMainPageAlignment,
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
