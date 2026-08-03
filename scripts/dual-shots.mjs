#!/usr/bin/env node
/*
 * Side-by-side screenshots of the two real apps for visual fidelity review.
 *   SRC=http://localhost:8080 TGT=http://localhost:4311 node scripts/dual-shots.mjs <outdir> <engine>
 * Deterministic: prefers-reduced-motion so animated components settle on their
 * final state in both apps; waits for fonts.
 */
import { chromium, webkit } from "playwright";
import { mkdirSync } from "node:fs";

const SRC = process.env.SRC ?? "http://localhost:8080/";
const TGT = process.env.TGT ?? "http://localhost:4311/";
const outdir = process.argv[2] ?? "/tmp/dualshots";
const engineName = process.argv[3] ?? "chromium";
const engine = engineName === "webkit" ? webkit : chromium;
mkdirSync(outdir, { recursive: true });

const viewports = [
  ["1440x900", 1440, 900],
  ["390x844", 390, 844],
];

const browser = await engine.launch();
for (const [tag, url] of [["source", SRC], ["target", TGT]]) {
  for (const [vname, w, h] of viewports) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    // full page
    await page.screenshot({ path: `${outdir}/${tag}-${engineName}-${vname}-full.png`, fullPage: true });
    // hero/authority-flow region (top 1100px)
    await page.screenshot({ path: `${outdir}/${tag}-${engineName}-${vname}-hero.png`, clip: { x: 0, y: 0, width: w, height: Math.min(1200, h * 1.4) } });
    await ctx.close();
    console.log(`shot ${tag} ${engineName} ${vname}`);
  }
}
await browser.close();
console.log(`written to ${outdir}`);
