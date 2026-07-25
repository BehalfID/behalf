/**
 * BehalfID visual audit — screenshots at desktop/tablet/mobile
 * Uses system Chrome via Playwright CDP
 */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:3000";
const OUT  = new URL("screenshots/baseline", import.meta.url).pathname;

mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet",  width: 768,  height: 1024 },
  { name: "mobile",  width: 390,  height: 844 },
];

const ROUTES = [
  { path: "/",         name: "homepage" },
  { path: "/status",   name: "status" },
  { path: "/security", name: "security" },
  { path: "/docs",     name: "docs-overview" },
  { path: "/docs/quickstart", name: "docs-quickstart" },
  { path: "/docs/api", name: "docs-api" },
  { path: "/sandbox",  name: "sandbox" },
];

const notes = [];

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-sandbox"],
});

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    colorScheme: "dark",
  });
  const page = await ctx.newPage();

  // Collect console errors
  const errors = [];
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });

  for (const route of ROUTES) {
    try {
      await page.goto(BASE + route.path, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(800); // let animations settle

      const filename = `${route.name}--${vp.name}.png`;
      await page.screenshot({
        path: join(OUT, filename),
        fullPage: vp.name === "desktop",
      });

      // Check for horizontal overflow
      const hasHOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth;
      });

      const note = {
        route: route.path,
        viewport: vp.name,
        file: filename,
        errors: [...errors],
        horizontalOverflow: hasHOverflow,
      };
      notes.push(note);
      errors.length = 0;

      console.log(`✓ ${route.name} @ ${vp.name}${hasHOverflow ? " ⚠ H-OVERFLOW" : ""}`);
    } catch (e) {
      console.error(`✗ ${route.name} @ ${vp.name}: ${e.message}`);
      notes.push({ route: route.path, viewport: vp.name, error: e.message });
    }
  }

  await ctx.close();
}

await browser.close();

// Write summary
const md = [
  "# Playwright Visual Audit — Pass 2\n",
  `**Date:** ${new Date().toISOString().split("T")[0]}  `,
  "**Branch:** ui-system-correction  ",
  "**Dev server:** http://localhost:3000\n",
  "## Screenshots taken\n",
  "| Route | Viewport | File | H-Overflow | Console errors |",
  "|-------|----------|------|-----------|----------------|",
  ...notes.map(n =>
    n.error
      ? `| ${n.route} | ${n.viewport} | ERROR: ${n.error} | — | — |`
      : `| ${n.route} | ${n.viewport} | ${n.file} | ${n.horizontalOverflow ? "⚠ YES" : "✓ none"} | ${n.errors.length > 0 ? n.errors.join("; ").substring(0, 80) : "none"} |`
  ),
  "\n## Key observations",
  "\nManual review needed — check screenshots for:",
  "- FlowDiagram section: stable height, no layout shift",
  "- Final CTA: left-aligned (not centered)",
  "- Dashboard list rows: hairline dividers, dense, no card chrome",
  "- security-card: neutral border (no indigo top edge)",
  "- home-flow-section: hairline borders (no decorative gradient)",
  "- hero-terminal LIVE badge: static (no infinite pulse)",
  "- Mobile: no horizontal overflow, no font overlap",
].join("\n");

writeFileSync(join(OUT, "..", "visual-baseline.md"), md);
console.log("\nDone. Report at .ui-audit/visual-baseline.md");
