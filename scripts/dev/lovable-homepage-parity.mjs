/**
 * Content + screenshot parity check for the Lovable homepage port.
 * Usage: PHASE2_VISUAL_BASE=http://127.0.0.1:3000 node scripts/dev/lovable-homepage-parity.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PHASE2_VISUAL_BASE || "http://127.0.0.1:3000";
const OUT = join(process.cwd(), "artifacts/lovable-parity");
const OPT = "/opt/cursor/artifacts/lovable-parity";
mkdirSync(OUT, { recursive: true });
mkdirSync(OPT, { recursive: true });

const viewports = [
  { name: "1536x960", width: 1536, height: 960 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "430x932", width: 430, height: 932 },
  { name: "390x844", width: 390, height: 844 }
];

const required = [
  "Give AI agents freedom.",
  "Keep their authority controlled.",
  "Start building",
  "See how it works",
  "Authority for AI agents"
];

const banned = [
  "Control what your AI agents are allowed to do.",
  "Control what your AI Agents are allowed to do.",
  "Start securing agents",
  "Continue with Google",
  "Read the technical overview",
  "Verify-before-execute",
  "Human approval gates",
  "Google SSO for teams",
  "Auditable decision records"
];

const findings = [];
function note(ok, message, meta = {}) {
  findings.push({ ok, message, ...meta });
  console.log(`${ok ? "OK" : "FAIL"}  ${message}`);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

try {
  const context = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.setItem("theme", "light");
    try {
      document.documentElement.setAttribute("data-theme", "light");
    } catch {
      // ignore
    }
  });
  const page = await context.newPage();

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const response = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("h1", { timeout: 15000 });
    await page.waitForTimeout(400);
    note((response?.status() || 0) < 400, `${vp.name} status=${response?.status()}`);

    // Dismiss cookie banner so it does not obscure hero comparisons.
    const accept = page.getByRole("button", { name: /Accept all|Essential only/i });
    if (await accept.count()) {
      await accept.first().click().catch(() => undefined);
      await page.waitForTimeout(200);
    }

    const bodyText = await page.locator("body").innerText();
    const bodyFolded = bodyText.toLocaleLowerCase();
    for (const needle of required) {
      note(bodyFolded.includes(needle.toLocaleLowerCase()), `${vp.name} contains “${needle}”`);
    }
    for (const needle of banned) {
      note(!bodyFolded.includes(needle.toLocaleLowerCase()), `${vp.name} excludes “${needle}”`);
    }

    const canvas = await page.locator("section.env-ivory").locator(".canvas-frame, .relative").first().count();
    note(canvas > 0, `${vp.name} authority-flow canvas present`);

    const h1 = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ").trim();
    note(
      h1.includes("Give AI agents freedom") && h1.includes("Keep their authority controlled"),
      `${vp.name} h1=${JSON.stringify(h1.slice(0, 120))}`
    );

    const navLabels = await page.locator("header").innerText();
    note(!/Enterprise/i.test(navLabels), `${vp.name} header has no Enterprise`);
    note(/Start building/i.test(navLabels), `${vp.name} header has Start building`);

    const shot = join(OUT, `home-${vp.name}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    copyFileSync(shot, join(OPT, `home-${vp.name}.png`));

    // Full-page once for desktop and mobile reference
    if (vp.name === "1440x900" || vp.name === "390x844") {
      const full = join(OUT, `home-${vp.name}-full.png`);
      await page.screenshot({ path: full, fullPage: true });
      copyFileSync(full, join(OPT, `home-${vp.name}-full.png`));
    }
  }
} finally {
  await browser.close();
}

const failed = findings.filter((f) => !f.ok);
const report = { base: BASE, passed: findings.length - failed.length, failed: failed.length, findings };
writeFileSync(join(OUT, "parity-report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(OPT, "parity-report.json"), JSON.stringify(report, null, 2));
console.log(`\n${report.passed}/${findings.length} checks passed`);
if (failed.length) {
  console.error(failed);
  process.exit(1);
}
