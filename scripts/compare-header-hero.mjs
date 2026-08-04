#!/usr/bin/env node
/*
 * Compares the header "Start building" CTA and the hero top spacing between the
 * real Lovable source app and the Next.js target.
 *   SRC=... TGT=... node scripts/compare-header-hero.mjs [width]
 */
import { chromium } from "playwright";

const SRC = process.env.SRC ?? "http://localhost:8080/";
const TGT = process.env.TGT ?? "http://localhost:4311/";
const width = Number(process.argv[2] ?? 1440);

async function grab(browser, url) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const res = {};
    // header CTA = header link/button whose text starts with "Start building"
    const header = document.querySelector("header");
    const cta = header
      ? [...header.querySelectorAll("a,button")].find((e) => /start building/i.test(e.textContent || ""))
      : null;
    if (cta) {
      const cs = getComputedStyle(cta);
      const r = cta.getBoundingClientRect();
      res.cta = {
        w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        padL: cs.paddingLeft, padR: cs.paddingRight, padT: cs.paddingTop, padB: cs.paddingBottom,
        radius: cs.borderRadius, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight, gap: cs.columnGap, boxShadow: cs.boxShadow.slice(0, 60),
        bg: cs.backgroundColor, color: cs.color, minHeight: cs.minHeight,
        cls: cta.className,
      };
      const svg = cta.querySelector("svg");
      if (svg) { const sr = svg.getBoundingClientRect(); res.ctaIcon = { w: +sr.width.toFixed(1), h: +sr.height.toFixed(1) }; }
    }
    // hero spacing: header bottom -> eyebrow top
    const eyebrow = [...document.querySelectorAll("div,span,p")].find((e) =>
      /authority for ai agents/i.test((e.textContent || "").trim()) && e.children.length <= 2 && (e.textContent || "").trim().length < 60);
    if (header && eyebrow) {
      const hb = header.getBoundingClientRect();
      const eb = eyebrow.getBoundingClientRect();
      res.heroGap = +(eb.top - hb.bottom).toFixed(1);
      res.headerH = +hb.height.toFixed(1);
      res.eyebrowTop = +eb.top.toFixed(1);
    }
    return res;
  });
}

const browser = await chromium.launch();
const src = await grab(browser, SRC);
const tgt = await grab(browser, TGT);
await browser.close();

console.log(`\n===== viewport ${width}px =====`);
console.log("\n### header CTA");
if (src.cta && tgt.cta) {
  for (const k of Object.keys(src.cta)) {
    const s = src.cta[k], t = tgt.cta[k];
    if (k === "cls") { console.log(`  src cls: ${s}\n  tgt cls: ${t}`); continue; }
    console.log(`  ${String(s) === String(t) ? "  " : "≠ "}${k}: src=${s} tgt=${t}`);
  }
} else console.log(`  src=${src.cta ? "ok" : "MISSING"} tgt=${tgt.cta ? "ok" : "MISSING"}`);
console.log("\n### CTA icon", JSON.stringify(src.ctaIcon), JSON.stringify(tgt.ctaIcon));
console.log("\n### hero spacing (header bottom -> eyebrow top)");
console.log(`  src=${src.heroGap}px (headerH=${src.headerH}) tgt=${tgt.heroGap}px (headerH=${tgt.headerH})`);
