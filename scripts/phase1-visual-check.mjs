/**
 * Phase 1 visual stability check (opt-in Lovable surfaces must not restyle live pages).
 * Usage: node scripts/phase1-visual-check.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PHASE1_VISUAL_BASE || "http://127.0.0.1:3010";
const OUT = "/opt/cursor/artifacts/phase1-visual";
mkdirSync(OUT, { recursive: true });

const pages = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "signup", path: "/signup" },
  { name: "status", path: "/status" },
  { name: "security", path: "/security" },
  { name: "complete-profile", path: "/complete-profile" },
  { name: "not-found", path: "/this-route-should-404" }
];

const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "430", width: 430, height: 932 },
  { name: "390", width: 390, height: 844 }
];

const findings = [];

function note(ok, message) {
  findings.push({ ok, message });
  console.log(`${ok ? "OK" : "FAIL"}  ${message}`);
}

async function measurePage(page, label) {
  return page.evaluate((pageLabel) => {
    const root = document.documentElement;
    const body = document.body;
    const cs = getComputedStyle(body);
    const sticky = [...document.querySelectorAll("header, .public-header, .public-nav, .site-header")]
      .slice(0, 3)
      .map((el) => ({
        tag: el.tagName,
        className: el.className?.toString?.().slice(0, 80) || "",
        position: getComputedStyle(el).position
      }));
    const dsCount = document.querySelectorAll(".ds").length;
    const animated = [...document.querySelectorAll(".reveal-hidden, .reveal-shown, .path-pulse, .node-in, .mark-in, .lift")]
      .length;
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return {
      pageLabel,
      dataTheme: root.getAttribute("data-theme"),
      hasDarkClass: root.classList.contains("dark"),
      fontFamily: cs.fontFamily,
      bodyBg: cs.backgroundColor,
      dsCount,
      animatedOutsideDs: animated,
      overflowX,
      sticky
    };
  }, label);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

try {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({
      colorScheme: theme === "dark" ? "dark" : "light",
      reducedMotion: "reduce"
    });
    await context.addInitScript((t) => {
      localStorage.setItem("theme", t);
    }, theme);

    const page = await context.newPage();

    for (const route of pages) {
      for (const vp of viewports.filter((v) => ["1440", "1024", "390"].includes(v.name))) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const response = await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(500);
        const status = response?.status() ?? 0;
        const metrics = await measurePage(page, `${route.name}:${theme}:${vp.name}`);

        note(status < 500, `${route.name} ${theme}@${vp.name} status=${status}`);
        note(
          metrics.dataTheme === theme && metrics.hasDarkClass === (theme === "dark"),
          `${route.name} ${theme}@${vp.name} theme sync data-theme=${metrics.dataTheme} dark=${metrics.hasDarkClass}`
        );
        note(
          /Instrument Sans/i.test(metrics.fontFamily) || /Inter/i.test(metrics.fontFamily),
          `${route.name} ${theme}@${vp.name} body font stack present (${metrics.fontFamily.slice(0, 80)})`
        );
        // Stronger assertion when Instrument Sans variable is wired through --font-sans.
        const fontSans = await page.evaluate(
          () => getComputedStyle(document.documentElement).getPropertyValue("--font-sans")
        );
        note(
          /Instrument Sans/i.test(fontSans),
          `${route.name} ${theme}@${vp.name} --font-sans leads with Instrument Sans`
        );
        note(metrics.dsCount === 0, `${route.name} ${theme}@${vp.name} no live .ds opt-in (count=${metrics.dsCount})`);
        note(
          metrics.animatedOutsideDs === 0,
          `${route.name} ${theme}@${vp.name} no Lovable motion classes outside opt-in (count=${metrics.animatedOutsideDs})`
        );
        note(!metrics.overflowX, `${route.name} ${theme}@${vp.name} no horizontal overflow`);

        if (vp.name === "1440" && ["home", "login", "status"].includes(route.name)) {
          const file = join(OUT, `${route.name}-${theme}-${vp.name}.png`);
          await page.screenshot({ path: file, fullPage: false });
        }
      }
    }

    // System mode: clear preference and confirm class tracks color scheme
    await page.addInitScript(() => localStorage.removeItem("theme"));
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const sys = await measurePage(page, `login:system`);
    note(
      sys.dataTheme === theme && sys.hasDarkClass === (theme === "dark"),
      `system preference via colorScheme=${theme} → data-theme=${sys.dataTheme} dark=${sys.hasDarkClass}`
    );

    await context.close();
  }

  // Reduced-motion + light desktop screenshot of home sticky nav
  const context = await browser.newContext({
    colorScheme: "light",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 }
  });
  await context.addInitScript(() => localStorage.setItem("theme", "light"));
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const sticky = await page.evaluate(() => {
    const nav = document.querySelector(".public-header, .public-nav, header");
    return nav ? getComputedStyle(nav).position : null;
  });
  note(sticky === "sticky" || sticky === "fixed" || sticky === "relative" || sticky === "static", `home nav position=${sticky}`);
  await page.screenshot({ path: join(OUT, "home-light-1440-reduced-motion.png"), fullPage: false });
  await context.close();
} finally {
  await browser.close();
}

const failed = findings.filter((f) => !f.ok);
console.log(`\nSummary: ${findings.length - failed.length}/${findings.length} checks passed`);
if (failed.length) {
  console.error("Failures:");
  for (const f of failed) console.error(` - ${f.message}`);
  process.exit(1);
}
