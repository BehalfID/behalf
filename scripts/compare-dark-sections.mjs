#!/usr/bin/env node
/*
 * Compares fixed-dark marketing sections between the real Lovable source app
 * and the Next.js target, in GLOBAL LIGHT mode (where leakage shows).
 *   SRC=http://localhost:8080 TGT=http://localhost:4311 node scripts/compare-dark-sections.mjs [light|dark]
 */
import { chromium } from "playwright";

const SRC = process.env.SRC ?? "http://localhost:8080/";
const TGT = process.env.TGT ?? "http://localhost:4311/";
const scheme = process.argv[2] === "dark" ? "dark" : "light";

// Each probe: [label, locator fn run in page, props]
const probes = [
  ["dashboard section bg", () => document.querySelector(".env-charcoal:not(#authority)") ?? document.querySelectorAll(".env-charcoal")[1], ["backgroundColor"]],
  ["dashboard heading", () => {
    const secs = [...document.querySelectorAll(".env-charcoal")];
    const s = secs.find((x) => /See every action/i.test(x.textContent || ""));
    return s?.querySelector("h2");
  }, ["color", "fontSize"]],
  ["developers section bg", () => document.querySelector(".env-ink"), ["backgroundColor"]],
  ["developers heading", () => document.querySelector(".env-ink h2"), ["color"]],
  ["code panel (CodeTabs)", () => document.querySelector(".env-ink [class*='rounded-lg'][class*='border']"), ["backgroundColor", "borderTopColor", "color"]],
  ["code tab bar", () => document.querySelector(".env-ink [role='tablist']"), ["backgroundColor", "color"]],
  ["decision panel", () => {
    const els = [...document.querySelectorAll(".env-ink [class*='bg-surface']")];
    return els[els.length - 1];
  }, ["backgroundColor", "color"]],
  ["ending CTA primary", () => document.querySelector(".env-copper-field a[href*='signup']"), ["backgroundColor", "color", "borderRadius"]],
  ["ending CTA panel", () => document.querySelector(".env-copper-field"), ["backgroundColor", "color"]],
];

async function grab(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const out = {};
  for (const [label, fn, props] of probes) {
    out[label] = await page.evaluate(({ fnStr, props }) => {
      // eslint-disable-next-line no-new-func
      const el = new Function("return (" + fnStr + ")()")();
      if (!el) return null;
      const cs = getComputedStyle(el);
      const o = {};
      for (const p of props) o[p] = cs[p];
      return o;
    }, { fnStr: fn.toString(), props });
  }
  await ctx.close();
  return out;
}

const browser = await chromium.launch();
const src = await grab(browser, SRC);
const tgt = await grab(browser, TGT);
await browser.close();

console.log(`\n===== global ${scheme.toUpperCase()} mode =====`);
for (const [label] of probes) {
  const s = src[label], t = tgt[label];
  console.log(`\n### ${label}`);
  if (!s || !t) { console.log(`  src=${s ? "found" : "MISSING"} tgt=${t ? "found" : "MISSING"}`); continue; }
  for (const k of new Set([...Object.keys(s), ...Object.keys(t)])) {
    console.log(`  ${s[k] === t[k] ? "  " : "≠ "}${k}: src=${s[k]} tgt=${t[k]}`);
  }
}
