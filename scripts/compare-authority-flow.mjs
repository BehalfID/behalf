#!/usr/bin/env node
/*
 * Dual real-app computed-style comparison for the request/authority-flow panel.
 * Boots nothing — expects source (Lovable Vite) and target (Next) already running.
 *   SRC=http://localhost:8080  TGT=http://localhost:4311  node scripts/compare-authority-flow.mjs
 * Uses prefers-reduced-motion so both apps settle on the same deterministic state.
 */
import { chromium } from "playwright";

const SRC = process.env.SRC ?? "http://localhost:8080/";
const TGT = process.env.TGT ?? "http://localhost:4311/";

const probes = [
  ["canvas panel", ".canvas-frame", ["backgroundColor", "borderTopWidth", "borderTopColor", "borderRadius", "boxShadow"]],
  ["timeline row (button)", ".canvas-frame ol button", ["backgroundColor", "borderTopWidth", "borderColor", "boxShadow", "borderRadius", "padding", "opacity"]],
  ["timeline node", ".canvas-frame ol button > span:first-child", ["width", "height", "borderRadius", "backgroundColor"]],
  ["state pill (request)", ".canvas-frame [aria-live] ", ["backgroundColor", "color", "borderRadius", "padding"]],
];

async function grab(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const out = {};
  for (const [label, sel, props] of probes) {
    const data = await page.evaluate(({ sel, props }) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const o = { classList: el.className };
      for (const p of props) o[p] = cs[p];
      return o;
    }, { sel, props });
    out[label] = data;
  }
  await ctx.close();
  return out;
}

const browser = await chromium.launch();
const src = await grab(browser, SRC);
const tgt = await grab(browser, TGT);
await browser.close();

for (const [label] of probes) {
  console.log(`\n### ${label}`);
  const s = src[label], t = tgt[label];
  if (!s) { console.log("  SOURCE: element not found"); }
  if (!t) { console.log("  TARGET: element not found"); }
  if (!s || !t) continue;
  const keys = new Set([...Object.keys(s), ...Object.keys(t)]);
  for (const k of keys) {
    const same = s[k] === t[k];
    console.log(`  ${same ? "  " : "≠ "}${k}: src=${JSON.stringify(s[k])} tgt=${JSON.stringify(t[k])}`);
  }
}
