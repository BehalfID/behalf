/**
 * Browser matrix for the auth theme / hydration / consent-CSP hotfix.
 *
 * Proves in Chromium *and* WebKit that the selected theme survives hydration,
 * that the auth pages hydrate without React errors, and that the consent ping
 * stays same-origin instead of being blocked by `connect-src 'self'`.
 *
 * Playwright is deliberately NOT a dependency of this repo: CI would have to
 * download two browser engines for it. Run it against a server you already
 * have up:
 *
 *   npm run build && npm start &
 *   BASE_URL=http://localhost:3000 npm run test:browser
 *
 * It skips (exit 0) when Playwright or the server is unavailable, so it never
 * turns into a phantom failure in an environment that cannot run it.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

let chromium;
let webkit;
try {
  ({ chromium, webkit } = require("playwright"));
} catch {
  console.log("SKIP: playwright is not installed (npm i -D playwright && npx playwright install)");
  process.exit(0);
}

try {
  const probe = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
  if (!probe.ok && probe.status !== 200) throw new Error(`status ${probe.status}`);
} catch (error) {
  console.log(`SKIP: no server reachable at ${BASE_URL} (${error.message})`);
  process.exit(0);
}

const results = [];
const record = (engine, name, pass, detail = "") => {
  results.push({ engine, name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** oklch/lab colours: pull the lightness so "is it dark?" is measurable. */
function lightness(color) {
  const lab = color.match(/lab\(([\d.]+)/);
  if (lab) return Number(lab[1]);
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((v) => v / 255);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) * 100;
  }
  return NaN;
}

const isDark = (color) => lightness(color) < 35;
const isLight = (color) => lightness(color) > 65;

const HYDRATION_ERROR = /hydrat|Minified React error #(418|419|421|422|423|425)|did not match/i;

function attach(page) {
  const errors = [];
  const blocked = [];
  page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() === "error") {
      if (/Content Security Policy/i.test(text)) blocked.push(text);
      errors.push(text.split("\n")[0]);
    }
  });
  return { errors, blocked };
}

/** data-theme + the actual painted colours, sampled after hydration settles. */
async function readTheme(page) {
  return page.evaluate(() => {
    const ds = document.querySelector(".ds");
    return {
      dataTheme: document.documentElement.getAttribute("data-theme"),
      darkClass: document.documentElement.classList.contains("dark"),
      dsBg: ds ? getComputedStyle(ds).backgroundColor : null,
      dsColor: ds ? getComputedStyle(ds).color : null,
      checked: [...document.querySelectorAll('[role="radio"]')]
        .filter((b) => b.getAttribute("aria-checked") === "true")
        .map((b) => b.getAttribute("aria-label")),
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    };
  });
}

async function settle(page) {
  // Hydration + the mount-time theme assertion both land well inside this.
  await page.waitForTimeout(1200);
}

async function runEngine(engineName, engine) {
  console.log(`\n=== ${engineName} ===`);
  const browser = await engine.launch();

  for (const path of ["/login", "/signup"]) {
    console.log(`\n-- ${path} --`);

    // ---- explicit Dark survives hydration -------------------------------
    {
      const ctx = await browser.newContext({ colorScheme: "light" });
      const page = await ctx.newPage();
      const { errors } = attach(page);
      await page.addInitScript(() => localStorage.setItem("theme", "dark"));
      await page.goto(BASE_URL + path, { waitUntil: "load" });
      await settle(page);
      const t = await readTheme(page);

      record(engineName, `${path} dark stays dark through hydration`,
        t.dataTheme === "dark" && t.darkClass && isDark(t.dsBg),
        `data-theme=${t.dataTheme} dsBg=${t.dsBg}`);
      record(engineName, `${path} no hydration error (dark)`,
        !errors.some((e) => HYDRATION_ERROR.test(e)),
        errors.filter((e) => HYDRATION_ERROR.test(e))[0] || "");
      record(engineName, `${path} toggle reflects resolved theme (dark)`,
        t.checked.length === 1 && t.checked[0] === "Dark", `checked=${t.checked}`);
      record(engineName, `${path} no horizontal overflow (dark)`,
        t.scrollW <= t.clientW, `scrollW=${t.scrollW} clientW=${t.clientW}`);

      // reload preserves the explicit preference
      await page.reload({ waitUntil: "load" });
      await settle(page);
      const afterReload = await readTheme(page);
      record(engineName, `${path} reload preserves explicit dark`,
        afterReload.dataTheme === "dark" && isDark(afterReload.dsBg),
        `data-theme=${afterReload.dataTheme}`);

      // an explicit preference must ignore the OS flipping
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForTimeout(250);
      const osFlip = await readTheme(page);
      record(engineName, `${path} OS change does not disturb explicit dark`,
        osFlip.dataTheme === "dark", `data-theme=${osFlip.dataTheme}`);
      await ctx.close();
    }

    // ---- explicit Light survives hydration -------------------------------
    {
      const ctx = await browser.newContext({ colorScheme: "dark" });
      const page = await ctx.newPage();
      const { errors } = attach(page);
      await page.addInitScript(() => localStorage.setItem("theme", "light"));
      await page.goto(BASE_URL + path, { waitUntil: "load" });
      await settle(page);
      const t = await readTheme(page);

      record(engineName, `${path} light stays light through hydration`,
        t.dataTheme === "light" && !t.darkClass && isLight(t.dsBg),
        `data-theme=${t.dataTheme} dsBg=${t.dsBg}`);
      record(engineName, `${path} no hydration error (light)`,
        !errors.some((e) => HYDRATION_ERROR.test(e)),
        errors.filter((e) => HYDRATION_ERROR.test(e))[0] || "");
      record(engineName, `${path} toggle reflects resolved theme (light)`,
        t.checked.length === 1 && t.checked[0] === "Light", `checked=${t.checked}`);
      await ctx.close();
    }

    // ---- System follows the mocked OS preference -------------------------
    for (const scheme of ["dark", "light"]) {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      attach(page);
      await page.addInitScript(() => localStorage.removeItem("theme"));
      await page.goto(BASE_URL + path, { waitUntil: "load" });
      await settle(page);
      const t = await readTheme(page);
      record(engineName, `${path} system follows OS=${scheme}`,
        t.dataTheme === scheme && (scheme === "dark" ? isDark(t.dsBg) : isLight(t.dsBg)),
        `data-theme=${t.dataTheme} dsBg=${t.dsBg}`);
      record(engineName, `${path} toggle shows System for OS=${scheme}`,
        t.checked[0] === "System", `checked=${t.checked}`);
      await ctx.close();
    }

    // ---- System tracks a live OS change ---------------------------------
    {
      const ctx = await browser.newContext({ colorScheme: "light" });
      const page = await ctx.newPage();
      attach(page);
      await page.addInitScript(() => localStorage.removeItem("theme"));
      await page.goto(BASE_URL + path, { waitUntil: "load" });
      await settle(page);
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForTimeout(400);
      const t = await readTheme(page);
      record(engineName, `${path} system mode tracks a live OS change`,
        t.dataTheme === "dark" && isDark(t.dsBg), `data-theme=${t.dataTheme}`);
      await ctx.close();
    }

    // ---- picking Dark from the toggle paints dark ------------------------
    {
      const ctx = await browser.newContext({ colorScheme: "light" });
      const page = await ctx.newPage();
      attach(page);
      await page.goto(BASE_URL + path, { waitUntil: "load" });
      await settle(page);
      await page.locator('[role="radio"][aria-label="Dark"]').first().click();
      await page.waitForTimeout(300);
      const t = await readTheme(page);
      record(engineName, `${path} choosing Dark actually paints dark`,
        t.dataTheme === "dark" && isDark(t.dsBg) && t.checked[0] === "Dark",
        `data-theme=${t.dataTheme} dsBg=${t.dsBg} checked=${t.checked}`);
      await ctx.close();
    }
  }

  // ---- shared-toggle regression: the marketing header uses it too -------
  for (const path of ["/", "/pricing"]) {
    const ctx = await browser.newContext({ colorScheme: "light" });
    const page = await ctx.newPage();
    const { errors } = attach(page);
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto(BASE_URL + path, { waitUntil: "load" });
    await settle(page);
    const t = await readTheme(page);
    record(engineName, `${path} (marketing) dark survives hydration`,
      t.dataTheme === "dark" && t.darkClass, `data-theme=${t.dataTheme}`);
    record(engineName, `${path} (marketing) no hydration error`,
      !errors.some((e) => HYDRATION_ERROR.test(e)),
      errors.filter((e) => HYDRATION_ERROR.test(e))[0] || "");
    record(engineName, `${path} (marketing) no horizontal overflow`,
      t.scrollW <= t.clientW, `scrollW=${t.scrollW} clientW=${t.clientW}`);
    await ctx.close();
  }

  // ---- consent-ping: same-origin, not CSP-blocked, no CORS --------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { blocked } = attach(page);
    const pings = [];
    page.on("response", async (res) => {
      if (res.url().includes("/api/consent-ping")) {
        pings.push({ url: res.url(), status: res.status(), headers: res.headers() });
      }
    });
    page.on("requestfailed", (req) => {
      if (req.url().includes("/api/consent-ping")) {
        pings.push({ url: req.url(), status: "FAILED", failure: req.failure()?.errorText });
      }
    });

    const response = await page.goto(BASE_URL + "/login", { waitUntil: "load" });
    await page.waitForTimeout(1500);

    const origin = new URL(BASE_URL).origin;
    const ping = pings[0];
    record("shared", "consent-ping was issued", Boolean(ping), JSON.stringify(pings));
    record("shared", "consent-ping stayed same-origin",
      Boolean(ping) && ping.url.startsWith(origin), ping ? ping.url : "none");
    record("shared", "consent-ping was not blocked by CSP",
      !blocked.some((b) => b.includes("consent-ping")),
      blocked.filter((b) => b.includes("consent-ping"))[0] || "");
    record("shared", "consent-ping returned a controlled response",
      Boolean(ping) && [200, 204, 400, 429].includes(ping.status),
      ping ? String(ping.status) : "none");
    record("shared", "consent-ping response carries no CORS allowance",
      Boolean(ping) && !ping.headers?.["access-control-allow-origin"],
      ping?.headers?.["access-control-allow-origin"] || "absent");

    // ---- CSP shape -------------------------------------------------------
    const csp = response.headers()["content-security-policy"] || "";
    const connect = csp.split("; ").find((d) => d.startsWith("connect-src")) || "";
    record("shared", "connect-src is exactly 'self'", connect === "connect-src 'self'", connect);
    record("shared", "CSP has no wildcard or cross-subdomain origin",
      !/\*\.behalfid\.com/.test(csp) && !/connect-src[^;]*\*/.test(csp), csp.slice(0, 120));

    // An arbitrary external connection must actually be refused.
    const external = await page.evaluate(async () => {
      try {
        await fetch("https://example.com/probe", { mode: "no-cors" });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    record("shared", "arbitrary external connections are refused", external === "blocked", external);
    await ctx.close();
  }

  await browser.close();
}

await runEngine("chromium", chromium);
await runEngine("webkit", webkit);

const failed = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(60)}`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("\nFAILURES:");
  for (const f of failed) console.log(`  [${f.engine}] ${f.name} — ${f.detail}`);
  process.exit(1);
}
console.log("All browser checks passed.");
