#!/usr/bin/env node
/*
 * Runtime fidelity check for the transplanted homepage.
 * Measures computed grid-template-columns for the seven confirmed structural
 * sections, at desktop + mobile, in Chromium and WebKit.
 *
 * Usage: node scripts/verify-marketing-grids.mjs [url]
 */
import { chromium, webkit } from "playwright";

const url = process.argv[2] ?? "http://localhost:4311/";

// [label, class-substring that uniquely marks the grid container, expected desktop tracks]
const targets = [
  ["request/authority-flow (0.72fr)", "0.72fr", 2],
  ["authority path — 5 stages", "grid-cols-5", 5],
  ["Observe/Recommend/Enforce (adaptive modes)", "grid-cols-3", 3],
  ["evidence 2×2 (pattern cards)", "grid-cols-2", 2],
  ["identity (0.62fr)", "0.62fr", 2],
  ["developers (0.7fr)", "0.7fr", 2],
  ["security dl (16rem)", "16rem", 2],
];

function trackCount(v) {
  if (!v || v === "none") return 0;
  return v.trim().split(/\s+/).filter(Boolean).length;
}

async function measure(engine, name, width, height) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(600);
  const results = [];
  for (const [label, sub, expectDesktop] of targets) {
    const data = await page.evaluate((sub) => {
      const els = [...document.querySelectorAll('[class*="grid-cols"]')].filter((e) =>
        e.className.includes(sub),
      );
      return els.map((e) => getComputedStyle(e).gridTemplateColumns);
    }, sub);
    const counts = data.map(trackCount);
    results.push({ label, expectDesktop, found: data.length, counts });
  }
  // overflow check
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollWidth - de.clientWidth;
  });
  await browser.close();
  return { name, results, overflow };
}

const engines = [
  ["chromium", chromium],
  ["webkit", webkit],
];
const viewports = [
  ["desktop 1440×900", 1440, 900],
  ["mobile 390×844", 390, 844],
];

let anyFail = false;
for (const [ename, engine] of engines) {
  for (const [vname, w, h] of viewports) {
    const isDesktop = w >= 1024;
    const { results, overflow } = await measure(engine, `${ename} · ${vname}`, w, h);
    console.log(`\n=== ${ename} · ${vname} ===`);
    console.log(`horizontal overflow: ${overflow}px ${overflow > 1 ? "❌" : "✓"}`);
    if (overflow > 1) anyFail = true;
    for (const r of results) {
      const expect = isDesktop ? r.expectDesktop : 1;
      // on desktop expect >=1 element matching expected tracks; on mobile expect collapse to 1
      const ok = isDesktop
        ? r.counts.some((c) => c === expect)
        : r.counts.every((c) => c === 1);
      if (!ok) anyFail = true;
      console.log(
        `  ${ok ? "✓" : "❌"} ${r.label}: found=${r.found} tracks=[${r.counts.join(",")}] expect ${isDesktop ? `desktop ${expect}` : "mobile 1"}`,
      );
    }
  }
}
console.log(anyFail ? "\nRESULT: DISCREPANCIES ❌" : "\nRESULT: ALL GRIDS OK ✓");
process.exit(anyFail ? 1 : 0);
