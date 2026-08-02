/**
 * Source-parity visual harness: Lovable fixture vs Next.js port.
 *
 * Usage:
 *   PHASE2_PORT_BASE=http://127.0.0.1:3012 node scripts/phase2-source-parity.mjs
 *   PHASE2_BROWSERS=chromium,webkit PHASE2_PORT_BASE=... node scripts/phase2-source-parity.mjs
 *
 * Source fixture is derived from agent-gatekeeper-suite hero/header styles
 * (scripts/fixtures/lovable-hero-source.html) when the Lovable Vite app cannot boot.
 */
import { chromium, webkit } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT_BASE = process.env.PHASE2_PORT_BASE || "http://127.0.0.1:3012";
const OUT = "/opt/cursor/artifacts/phase2-fidelity/parity";
const BROWSERS = (process.env.PHASE2_BROWSERS || "chromium").split(",").map((s) => s.trim());
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

const fixtureHtml = readFileSync(join(__dirname, "fixtures/lovable-hero-source.html"), "utf8");

function startFixtureServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fixtureHtml);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function collect(page, kind) {
  return page.evaluate((kind) => {
    const q = (sel) => document.querySelector(sel);
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: +r.top.toFixed(1),
        bottom: +r.bottom.toFixed(1),
        left: +r.left.toFixed(1),
        width: +r.width.toFixed(1),
        height: +r.height.toFixed(1)
      };
    };
    const linesOf = (el) => {
      if (!el) return 0;
      const range = document.createRange();
      range.selectNodeContents(el);
      return [...new Set([...range.getClientRects()].map((r) => Math.round(r.top)))].length;
    };
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const rgb = (el, prop = "color") => (el ? getComputedStyle(el)[prop] : null);

    const header = q("header");
    const hero = q("section.env-ivory");
    const eyebrow =
      kind === "source" ? q("[data-testid='source-eyebrow']") : q("section.env-ivory .max-w-3xl > div");
    const h1 = kind === "source" ? q("[data-testid='source-headline']") : q("section.env-ivory h1");
    const p = kind === "source" ? q("[data-testid='source-paragraph']") : q("section.env-ivory .max-w-3xl > p");
    const ctaGroup =
      kind === "source"
        ? q("[data-testid='source-cta-group']")
        : q('section.env-ivory a[href="/signup"]')?.parentElement;
    const primaryCta =
      kind === "source"
        ? q("[data-testid='source-cta-group'] a.btn-primary")
        : q('section.env-ivory a[href="/signup"]');
    const h1cs = cs(h1);
    const pcs = cs(p);
    const ctacs = cs(primaryCta);
    const headerLinks = [...(header?.querySelectorAll("nav a") || [])];
    const wrappedNav = headerLinks.some((a) => a.getBoundingClientRect().height > 28);

    return {
      vh: innerHeight,
      vw: innerWidth,
      header: box(header),
      hero: box(hero),
      eyebrow: box(eyebrow),
      headline: {
        ...box(h1),
        fontSize: h1cs?.fontSize,
        lineHeight: h1cs?.lineHeight,
        letterSpacing: h1cs?.letterSpacing,
        fontWeight: h1cs?.fontWeight,
        margin: h1cs?.margin,
        color: rgb(h1),
        lines: linesOf(h1)
      },
      paragraph: {
        ...box(p),
        fontSize: pcs?.fontSize,
        lineHeight: pcs?.lineHeight,
        maxWidth: pcs?.maxWidth,
        margin: pcs?.margin,
        color: rgb(p),
        lines: linesOf(p)
      },
      ctaGroup: box(ctaGroup),
      primaryCta: {
        ...box(primaryCta),
        fontSize: ctacs?.fontSize,
        height: ctacs?.height,
        padding: ctacs?.padding,
        fontWeight: ctacs?.fontWeight,
        borderRadius: ctacs?.borderRadius
      },
      spaceBelowCta: ctaGroup ? +(innerHeight - ctaGroup.getBoundingClientRect().bottom).toFixed(1) : null,
      ctaFullyVisible: Boolean(
        ctaGroup &&
          ctaGroup.getBoundingClientRect().top >= 0 &&
          ctaGroup.getBoundingClientRect().bottom <= innerHeight + 0.5
      ),
      wrappedNav,
      colors: {
        heroBg: rgb(hero, "backgroundColor"),
        headerBg: rgb(header, "backgroundColor"),
        primary: primaryCta ? rgb(primaryCta, "backgroundColor") : null
      }
    };
  }, kind);
}

function pctDiff(a, b) {
  if (a == null || b == null || a === 0) return null;
  return Math.abs(a - b) / a;
}

function within(a, b, tol) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tol;
}

const findings = [];
function note(ok, message, meta = {}) {
  findings.push({ ok, message, ...meta });
  console.log(`${ok ? "OK  " : "FAIL"} ${message}`);
}

const launchers = {
  chromium: () =>
    chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/usr/local/bin/google-chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    }),
  webkit: () => webkit.launch()
};

const { server, url: sourceUrl } = await startFixtureServer();
const report = { portBase: PORT_BASE, sourceUrl, browsers: {}, failed: 0 };

try {
  for (const browserName of BROWSERS) {
    const launch = launchers[browserName];
    if (!launch) {
      note(false, `unknown browser ${browserName}`);
      continue;
    }
    let browser;
    try {
      browser = await launch();
    } catch (err) {
      note(false, `${browserName} launch failed: ${err.message.split("\n")[0]}`);
      continue;
    }

    const browserReport = [];
    const context = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce" });
    await context.addInitScript(() => {
      localStorage.setItem("theme", "light");
      localStorage.setItem("behalf_cookie_consent", "essential");
    });
    const page = await context.newPage();

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(400);
      const source = await collect(page, "source");
      await page.screenshot({ path: join(OUT, `${browserName}-source-${vp.name}.png`) });

      await page.goto(`${PORT_BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(600);
      const port = await collect(page, "port");
      await page.screenshot({ path: join(OUT, `${browserName}-port-${vp.name}.png`) });

      const desktop = vp.width >= 1280;
      const row = { vp: vp.name, browser: browserName, source, port, checks: [] };

      if (desktop) {
        const ctaOk = port.ctaFullyVisible && port.spaceBelowCta != null && port.spaceBelowCta >= 48;
        note(ctaOk, `${browserName}@${vp.name} CTA fully visible with ≥48px below (space=${port.spaceBelowCta})`, {
          spaceBelowCta: port.spaceBelowCta
        });
        row.checks.push({ name: "cta-space", ok: ctaOk });

        const wTol = pctDiff(source.headline.width, port.headline.width);
        const hTol = pctDiff(source.headline.height, port.headline.height);
        const wOk = wTol != null && wTol <= 0.05;
        const hOk = hTol != null && hTol <= 0.05;
        note(wOk, `${browserName}@${vp.name} headline width within 5% (src=${source.headline.width} port=${port.headline.width})`);
        note(hOk, `${browserName}@${vp.name} headline height within 5% (src=${source.headline.height} port=${port.headline.height})`);
        row.checks.push({ name: "headline-w", ok: wOk }, { name: "headline-h", ok: hOk });

        const lineOk = Math.abs((source.paragraph.lines || 0) - (port.paragraph.lines || 0)) <= 1;
        note(
          lineOk,
          `${browserName}@${vp.name} paragraph lines within 1 (src=${source.paragraph.lines} port=${port.paragraph.lines})`
        );
        row.checks.push({ name: "p-lines", ok: lineOk });

        const headerHOk = within(source.header?.height, port.header?.height, 4);
        note(
          headerHOk,
          `${browserName}@${vp.name} header height within 4px (src=${source.header?.height} port=${port.header?.height})`
        );
        row.checks.push({ name: "header-h", ok: headerHOk });

        note(!port.wrappedNav, `${browserName}@${vp.name} header items single-line`);
        row.checks.push({ name: "nav-nowrap", ok: !port.wrappedNav });
      } else if (vp.width <= 430) {
        note(port.ctaFullyVisible, `${browserName}@${vp.name} mobile CTA visible`);
        row.checks.push({ name: "mobile-cta", ok: port.ctaFullyVisible });
      } else {
        note(!port.wrappedNav || vp.width < 768, `${browserName}@${vp.name} header check`);
      }

      browserReport.push(row);
    }

    // Route smoke on port
    for (const route of ["/", "/pricing", "/adaptive-engine", "/contact"]) {
      const res = await page.goto(`${PORT_BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      note((res?.status() || 0) < 400, `${browserName} ${route} status=${res?.status()}`);
    }

    report.browsers[browserName] = browserReport;
    await context.close();
    await browser.close();
  }
} finally {
  server.close();
}

report.failed = findings.filter((f) => !f.ok).length;
report.findings = findings;
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(`\n${findings.length - report.failed}/${findings.length} checks passed. Artifacts: ${OUT}`);
if (report.failed) process.exit(1);
