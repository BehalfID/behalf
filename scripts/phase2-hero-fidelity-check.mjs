/**
 * Hero/source-parity visual metrics for Lovable marketing cutover.
 * Usage: PHASE2_VISUAL_BASE=http://127.0.0.1:3011 node scripts/phase2-hero-fidelity-check.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PHASE2_VISUAL_BASE || "http://127.0.0.1:3011";
const OUT = "/opt/cursor/artifacts/phase2-fidelity";
mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: "1536", width: 1536, height: 960 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "430", width: 430, height: 932 },
  { name: "390", width: 390, height: 844 }
];

const findings = [];
function note(ok, message, meta) {
  findings.push({ ok, message, ...meta });
  console.log(`${ok ? "OK" : "FAIL"}  ${message}`);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

try {
  const context = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("theme", "light"));
  const page = await context.newPage();

  for (const route of ["/", "/pricing", "/adaptive-engine", "/contact", "/en/pricing"]) {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    note((response?.status() || 0) < 400, `${route} status=${response?.status()}`);
  }

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(500);

    const metrics = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const hero = document.querySelector("section.env-ivory");
      const copy = document.querySelector("section.env-ivory .max-w-3xl");
      const shell = document.querySelector("section.env-ivory .max-w-7xl");
      const cta = document.querySelector('section.env-ivory a[href="/signup"]');
      const secondary = document.querySelector('section.env-ivory a[href="#authority"]');
      const canvas = document.querySelector("section.env-ivory .canvas-frame, section.env-ivory [class*='Authority'], section.env-ivory .relative.overflow-hidden");
      const signIn = [...document.querySelectorAll("header a")].find((a) => /sign in|dashboard/i.test(a.textContent || ""));
      const start = document.querySelector("header .ds-header__cta, header a[href='/signup']");
      const range = h1 ? document.createRange() : null;
      if (range && h1) range.selectNodeContents(h1);
      const rects = range ? [...range.getClientRects()] : [];
      const lineTops = [...new Set(rects.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
      const h1Box = h1?.getBoundingClientRect();
      const heroBox = hero?.getBoundingClientRect();
      const shellBox = shell?.getBoundingClientRect();
      const copyBox = copy?.getBoundingClientRect();
      const ctaBox = cta?.getBoundingClientRect();
      const canvasEl =
        document.querySelector("section.env-ivory .canvas-frame") ||
        document.querySelector("section.env-ivory .relative.grid");
      const canvasBox = canvasEl?.getBoundingClientRect();
      const signBox = signIn?.getBoundingClientRect();
      const startBox = start?.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      return {
        vw,
        vh,
        h1Text: h1?.textContent?.replace(/\s+/g, " ").trim() || "",
        h1Width: h1Box ? Math.round(h1Box.width) : 0,
        h1Left: h1Box ? Math.round(h1Box.left) : 0,
        h1Height: h1Box ? Math.round(h1Box.height) : 0,
        lineCount: Math.max(lineTops.length, 1),
        shellWidth: shellBox ? Math.round(shellBox.width) : 0,
        copyWidth: copyBox ? Math.round(copyBox.width) : 0,
        copyLeft: copyBox ? Math.round(copyBox.left) : 0,
        ctaInFirstViewport: Boolean(ctaBox && ctaBox.top < vh && ctaBox.bottom > 0),
        secondaryInFirstViewport: Boolean(
          secondary && secondary.getBoundingClientRect().top < vh
        ),
        canvasTop: canvasBox ? Math.round(canvasBox.top) : null,
        canvasWidth: canvasBox ? Math.round(canvasBox.width) : null,
        heroHeight: heroBox ? Math.round(heroBox.height) : 0,
        signInHeight: signBox ? Math.round(signBox.height) : null,
        startHeight: startBox ? Math.round(startBox.height) : null,
        maxW7xlComputed: shell ? getComputedStyle(shell).maxWidth : null,
        maxW3xlComputed: copy ? getComputedStyle(copy).maxWidth : null
      };
    });

    await page.screenshot({
      path: join(OUT, `home-light-${vp.name}.png`),
      fullPage: false
    });

    const desktop = vp.width >= 1280;
    const tablet = vp.width === 1024;
    note(metrics.maxW7xlComputed === "1280px" || parseFloat(metrics.maxW7xlComputed) >= 1280 || metrics.shellWidth > vp.width * 0.7, `${vp.name} max-w-7xl not collapsed (${metrics.maxW7xlComputed}, shell=${metrics.shellWidth})`, metrics);
    note(metrics.copyLeft < vp.width * 0.25, `${vp.name} hero copy left-aligned (left=${metrics.copyLeft})`, metrics);
    if (desktop) {
      note(metrics.h1Width >= 520, `${vp.name} heading width >= 520 (got ${metrics.h1Width})`, metrics);
      note(metrics.lineCount >= 2 && metrics.lineCount <= 5, `${vp.name} heading lines 2-5 (got ${metrics.lineCount})`, metrics);
      note(metrics.ctaInFirstViewport && metrics.secondaryInFirstViewport, `${vp.name} both CTAs in first viewport`, metrics);
      note(metrics.canvasWidth != null && metrics.canvasWidth >= 700, `${vp.name} authority canvas wide (got ${metrics.canvasWidth})`, metrics);
    }
    if (tablet || desktop) {
      note(metrics.signInHeight != null && metrics.signInHeight <= 40, `${vp.name} Sign in single-line (h=${metrics.signInHeight})`, metrics);
      note(metrics.startHeight != null && metrics.startHeight <= 48, `${vp.name} Start building single-line (h=${metrics.startHeight})`, metrics);
    }
    if (vp.width <= 430) {
      note(metrics.lineCount >= 2 && metrics.lineCount <= 8, `${vp.name} mobile heading readable lines (got ${metrics.lineCount})`, metrics);
      note(metrics.ctaInFirstViewport, `${vp.name} mobile CTA visible`, metrics);
    }
  }

  await context.close();
} finally {
  await browser.close();
}

const failed = findings.filter((f) => !f.ok);
writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, findings, failed: failed.length }, null, 2));
console.log(`\n${findings.length - failed.length}/${findings.length} checks passed. Artifacts: ${OUT}`);
if (failed.length) process.exit(1);
