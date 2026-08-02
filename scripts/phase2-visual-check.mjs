/**
 * Phase 2 marketing visual check — expects .ds on marketing routes.
 * Usage: PHASE2_VISUAL_BASE=http://127.0.0.1:3010 node scripts/phase2-visual-check.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PHASE2_VISUAL_BASE || process.env.PHASE1_VISUAL_BASE || "http://127.0.0.1:3010";
const OUT = "/opt/cursor/artifacts/phase2-visual";
mkdirSync(OUT, { recursive: true });

const pages = [
  { name: "home", path: "/", expectDs: true, expectHero: true },
  { name: "pricing", path: "/pricing", expectDs: true },
  { name: "adaptive", path: "/adaptive-engine", expectDs: true },
  { name: "contact", path: "/contact", expectDs: true },
  { name: "security", path: "/security", expectDs: true },
  { name: "status", path: "/status", expectDs: true },
  { name: "login", path: "/login", expectDs: false }
];

const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
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
    const ds = document.querySelector(".ds");
    const header = document.querySelector("header.ds-header, header.ds");
    const overflowX = root.scrollWidth > root.clientWidth + 1;
    const hero = document.querySelector("h1");
    const emptyFixed = [...document.querySelectorAll("[style*='height']")].filter((el) => {
      const h = Number.parseFloat(getComputedStyle(el).height);
      return h >= 240 && !el.textContent?.trim() && el.children.length === 0;
    }).length;
    return {
      pageLabel,
      dataTheme: root.getAttribute("data-theme"),
      hasDarkClass: root.classList.contains("dark"),
      fontFamily: cs.fontFamily,
      dsCount: document.querySelectorAll(".ds").length,
      headerIsDs: Boolean(header),
      overflowX,
      emptyFixed,
      heroText: hero?.textContent?.trim().slice(0, 120) || "",
      title: document.title,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") || "",
      dsBg: ds ? getComputedStyle(ds).backgroundColor : null
    };
  }, label);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

try {
  for (const theme of ["light", "dark"]) {
    for (const motion of ["reduce", "no-preference"]) {
      const context = await browser.newContext({
        colorScheme: theme === "dark" ? "dark" : "light",
        reducedMotion: motion === "reduce" ? "reduce" : "no-preference"
      });
      await context.addInitScript((t) => {
        localStorage.setItem("theme", t);
      }, theme);

      const page = await context.newPage();
      page.on("pageerror", (err) => note(false, `pageerror ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") note(false, `console.error ${msg.text().slice(0, 160)}`);
      });

      for (const route of pages) {
        for (const vp of viewports) {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          const response = await page.goto(`${BASE}${route.path}`, {
            waitUntil: "domcontentloaded",
            timeout: 45000
          });
          await page.waitForTimeout(400);
          const status = response?.status() ?? 0;
          const metrics = await measurePage(page, `${route.name}:${theme}:${motion}:${vp.name}`);
          const shot = join(OUT, `${route.name}-${theme}-${motion}-${vp.name}.png`);
          await page.screenshot({ path: shot, fullPage: false });

          note(status >= 200 && status < 400, `${route.name} ${theme}/${motion}@${vp.name} status=${status}`);
          note(
            metrics.dataTheme === theme && metrics.hasDarkClass === (theme === "dark"),
            `${route.name} ${theme}/${motion}@${vp.name} theme sync`
          );
          note(!metrics.overflowX, `${route.name} ${theme}/${motion}@${vp.name} no overflow-x`);
          note(metrics.emptyFixed === 0, `${route.name} ${theme}/${motion}@${vp.name} no empty fixed panels`);
          if (route.expectDs) {
            note(metrics.dsCount > 0 && metrics.headerIsDs, `${route.name} ${theme}/${motion}@${vp.name} .ds chrome active (${metrics.dsCount})`);
          } else {
            note(metrics.dsCount === 0, `${route.name} ${theme}/${motion}@${vp.name} auth remains non-.ds (${metrics.dsCount})`);
          }
          if (route.expectHero && vp.name === "1440" && theme === "light") {
            const hasLovableSurface = await page.evaluate(() => {
              return Boolean(
                document.querySelector(".env-ivory") &&
                  document.querySelector(".display-2xl, .ds .display-2xl, h1.display-2xl")
              );
            });
            note(
              hasLovableSurface && metrics.dsCount > 0,
              `${route.name} Lovable hero surface active (env-ivory + display + .ds)`
            );
          }
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failed = findings.filter((f) => !f.ok);
writeFileSync(join(OUT, "findings.json"), JSON.stringify({ base: BASE, findings, failed: failed.length }, null, 2));
console.log(`\n${findings.length - failed.length}/${findings.length} checks passed. Artifacts: ${OUT}`);
if (failed.length) process.exit(1);
