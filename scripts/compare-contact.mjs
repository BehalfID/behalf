#!/usr/bin/env node
/*
 * Dual real-app computed-style comparison for /contact.
 *   SRC=http://localhost:8080 TGT=http://localhost:4311 node scripts/compare-contact.mjs [light|dark] [chromium|webkit] [width]
 * Source select is a Radix trigger (<button role=combobox>); target is a native
 * <select> — both are probed via their #contact-topic id.
 */
import { chromium, webkit } from "playwright";

const SRC = (process.env.SRC ?? "http://localhost:8080") + "/contact";
const TGT = (process.env.TGT ?? "http://localhost:4311") + "/contact";
const scheme = process.argv[2] === "dark" ? "dark" : "light";
const engine = process.argv[3] === "webkit" ? webkit : chromium;
const width = Number(process.argv[4] ?? 1440);

const FIELDS = [
  ["name input", "#contact-name"],
  ["email input", "#contact-email"],
  ["company input", "#contact-company"],
  ["topic control", "#contact-topic"],
  ["message textarea", "#contact-message"],
  ["submit button", "form button[type=submit]"],
  ["form card", "form"],
  ["label (name)", "label[for=contact-name],#contact-name-label"],
];

async function grab(url) {
  const ctx = await engine.launch === undefined ? null : null;
  return null;
}

const browser = await engine.launch();
async function measure(url) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const out = await page.evaluate((FIELDS) => {
    const rgb = (c) => { const d = document.createElement("div"); d.style.backgroundColor = `color-mix(in srgb, ${c} 100%, white 0%)`; document.body.appendChild(d); const v = getComputedStyle(d).backgroundColor; d.remove(); return v; };
    const res = {};
    for (const [label, sel] of FIELDS) {
      const el = document.querySelector(sel);
      if (!el) { res[label] = null; continue; }
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      res[label] = {
        tag: el.tagName.toLowerCase(),
        h: +r.height.toFixed(1), w: +r.width.toFixed(1),
        pad: cs.padding, radius: cs.borderRadius,
        bw: cs.borderTopWidth, bc: cs.borderTopWidth !== "0px" ? rgb(cs.borderTopColor) : "-",
        bg: cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "transparent" : rgb(cs.backgroundColor),
        shadow: cs.boxShadow === "none" ? "none" : "yes",
        fs: cs.fontSize, lh: cs.lineHeight, color: rgb(cs.color),
        appearance: cs.appearance,
      };
    }
    // layout metrics
    const form = document.querySelector("form");
    const grid = form?.parentElement;
    res.__layout = {
      gridCols: grid ? getComputedStyle(grid).gridTemplateColumns : null,
      gridGap: grid ? getComputedStyle(grid).gap : null,
      formPad: form ? getComputedStyle(form).padding : null,
      fieldGap: (() => { const s = form?.querySelector(".space-y-4, [class*='space-y-4']"); return s ? getComputedStyle(s).rowGap || "space-y" : null; })(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
    return res;
  }, FIELDS);
  await ctx.close();
  return out;
}

const s = await measure(SRC), t = await measure(TGT);
await browser.close();

console.log(`\n===== /contact · ${process.argv[3] || "chromium"} · ${scheme} · ${width}px =====`);
let diffs = 0;
for (const [label] of FIELDS) {
  const A = s[label], B = t[label];
  if (!A || !B) { console.log(`\n### ${label}: src=${A ? "ok" : "MISSING"} tgt=${B ? "ok" : "MISSING"}`); continue; }
  const keys = Object.keys(A).filter((k) => String(A[k]) !== String(B[k]));
  if (!keys.length) { console.log(`\n### ${label}  ✓ identical`); continue; }
  console.log(`\n### ${label}`);
  for (const k of keys) { diffs++; console.log(`  ≠ ${k}: src=${A[k]}  tgt=${B[k]}`); }
}
console.log("\n### layout");
for (const k of Object.keys(s.__layout)) {
  const same = String(s.__layout[k]) === String(t.__layout[k]);
  if (!same) diffs++;
  console.log(`  ${same ? "  " : "≠ "}${k}: src=${s.__layout[k]}  tgt=${t.__layout[k]}`);
}
console.log(`\nTOTAL DIFFS: ${diffs}`);
