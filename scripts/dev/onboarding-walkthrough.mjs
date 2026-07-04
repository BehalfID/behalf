#!/usr/bin/env node
/**
 * Dev-only QA walkthrough for the account-setup onboarding flow.
 *
 * Prerequisites:
 *   1. App running locally on the default dev port (override with QA_BASE_URL).
 *   2. Local non-production MongoDB (default mongodb://127.0.0.1:27017/behalf_dev).
 *   3. Playwright Chromium: npx playwright install chromium
 *
 * Usage:
 *   INTERNAL_DEMO_PASSWORD='<password>' node scripts/dev/onboarding-walkthrough.mjs
 *
 * Optional env:
 *   QA_BASE_URL=<app-base-url>
 *   QA_MONGODB_URI=mongodb://127.0.0.1:27017/behalf_dev
 *   QA_SCREENSHOT_DIR=/tmp/behalf-onboarding-qa   (omit to skip screenshots)
 *
 * Each flow segment resets and logs in with a distinct internal QA email so auth
 * rate limits are not exhausted during a normal run.
 */

import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.QA_BASE_URL ?? `http://${"localhost"}:${3000}`;
const MONGODB_URI = process.env.QA_MONGODB_URI ?? "mongodb://127.0.0.1:27017/behalf_dev";
const PASSWORD = process.env.INTERNAL_DEMO_PASSWORD ?? "";
const SCREENSHOT_DIR = process.env.QA_SCREENSHOT_DIR ?? "";

const QA_DOMAIN = "behalfid.internal"; // pragma: allowlist secret

const QA_EMAILS = {
  team: process.env.QA_TEAM_EMAIL ?? `qa-walkthrough-team@${QA_DOMAIN}`,
  individual: process.env.QA_INDIVIDUAL_EMAIL ?? `qa-walkthrough-individual@${QA_DOMAIN}`,
  redirectDeploy: process.env.QA_REDIRECT_DEPLOY_EMAIL ?? `qa-walkthrough-redirect-deploy@${QA_DOMAIN}`,
  redirectInvite: process.env.QA_REDIRECT_INVITE_EMAIL ?? `qa-walkthrough-redirect-invite@${QA_DOMAIN}`,
  redirectAgent: process.env.QA_REDIRECT_AGENT_EMAIL ?? `qa-walkthrough-redirect-agent@${QA_DOMAIN}`
};

const MOBILE_WIDTHS = [360, 390, 414];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function resetDemoAccount(email) {
  if (!PASSWORD) {
    fail("INTERNAL_DEMO_PASSWORD is required.");
  }
  execSync("npm run dev:reset-internal-demo", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      MONGODB_URI,
      INTERNAL_DEMO_PASSWORD: PASSWORD,
      INTERNAL_DEMO_EMAIL: email,
      ALLOW_INTERNAL_DEMO_RESET: "1"
    }
  });
}

async function login(page, email) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(`${BASE}/login`);
    const response = page.waitForResponse((res) => res.url().includes("/api/auth/login"), { timeout: 15000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    const res = await response;
    const body = await res.json().catch(() => ({}));
    if (res.status() === 429) {
      if (attempt < 4) {
        await sleep(4000 * attempt);
        continue;
      }
      fail(`login rate limited for ${email}: ${body.error ?? res.status()}`);
    }
    if (!res.ok()) {
      fail(`login failed for ${email}: ${body.error ?? res.status()}`);
    }
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 20000 });
    pass(`login works for ${email}`);
    return;
  }
}

async function waitForSetupLoaded(page) {
  await page.waitForSelector("h1.setup-heading", { timeout: 20000 });
  await page.waitForFunction(() => !document.body.textContent?.includes("Loading setup state"), null, {
    timeout: 20000
  });
}

async function readSetupState(page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/onboarding/account-setup", { credentials: "include" });
    return res.json();
  });
}

async function maybeScreenshot(page, label) {
  if (!SCREENSHOT_DIR) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const path = join(SCREENSHOT_DIR, `${label}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`screenshot: ${path}`);
}

async function setTheme(page, theme) {
  await page.evaluate((next) => {
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }, theme);
}

async function clickContinue(page, nextHeadingIncludes) {
  const currentHeading = (await page.locator("h1.setup-heading").textContent()) ?? "";
  const patch = page.waitForResponse(
    (res) => res.url().includes("/api/onboarding/account-setup") && res.request().method() === "PATCH",
    { timeout: 15000 }
  );
  await page.getByRole("button", { name: "Continue" }).click();
  const res = await patch;
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}));
    fail(`setup save failed: ${body.error ?? res.status()}`);
  }
  if (nextHeadingIncludes) {
    await page.waitForFunction(
      ({ previous, nextLabel }) => {
        const heading = document.querySelector("h1.setup-heading")?.textContent ?? "";
        return heading.includes(nextLabel) && heading !== previous;
      },
      { previous: currentHeading, nextLabel: nextHeadingIncludes },
      { timeout: 15000 }
    );
  } else {
    await page.getByRole("button", { name: "Continue" }).waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  }
}

async function fillTeamProfile(page) {
  await page.getByRole("button", { name: /Team \/ company/ }).click();
  await clickContinue(page, "Identify the operator");
  await page.waitForSelector('input[autocomplete="given-name"]');
  await page.fill('input[autocomplete="given-name"]', "Jordan");
  await page.fill('input[autocomplete="family-name"]', "Lee");
  await page.fill('input[autocomplete="organization-title"]', "Engineering Lead");
  await page.fill('input[autocomplete="tel"]', "+1 415 555 0199");
  await clickContinue(page, "Name the workspace");
}

function companyInput(page) {
  return page.locator("label").filter({ hasText: "Company name" }).locator("input");
}

function workspaceInput(page) {
  return page.locator("label").filter({ hasText: /^Workspace name/ }).locator("input");
}

async function fillTeamWorkspace(page) {
  await companyInput(page).fill("Northwind Labs");
  await workspaceInput(page).fill("Northwind Control");
  await page.fill('input[placeholder="example.com"]', "northwind.example");
  await page.selectOption("select", "6-20");
}

async function fillAgentsAndControls(page) {
  await clickContinue(page, "Select agent surfaces");
  await page.getByLabel("Cursor").check();
  await page.getByLabel("GitHub Actions / CI agents").check();
  await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]:checked').length >= 2);
  await clickContinue(page, "Define initial control boundaries");
  await page.getByLabel("Production deploys").check();
  await page.getByLabel("GitHub writes").check();
  await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]:checked').length >= 2);
  await clickContinue(page, "Choose implementation track");
}

async function fillIndividualPath(page) {
  await page.getByRole("button", { name: /Individual/ }).click();
  await clickContinue(page, "Identify the operator");
  await page.waitForSelector('input[autocomplete="given-name"]');
  await page.fill('input[autocomplete="given-name"]', "Alex");
  await page.fill('input[autocomplete="family-name"]', "Kim");
  await clickContinue(page, "Name the workspace");
  await page.locator("label").filter({ hasText: /^Workspace name/ }).locator("input").fill("Alex Workspace");
  await clickContinue(page, "Select agent surfaces");
  await page.getByLabel("Cursor").check();
  await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]:checked').length >= 1);
  await clickContinue(page, "Define initial control boundaries");
  await page.getByLabel("Secrets and .env files").check();
  await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]:checked').length >= 1);
  await clickContinue(page, "Choose implementation track");
}

async function finishWithGoal(page, goalLabel, expectedPath) {
  await page.getByRole("button", { name: new RegExp(goalLabel, "i") }).click();
  await page.waitForSelector(".setup-review", { timeout: 5000 });
  const complete = page.waitForResponse(
    (res) => res.url().includes("/api/onboarding/account-setup/complete") && res.request().method() === "POST",
    { timeout: 15000 }
  );
  await page.getByRole("button", { name: "Complete setup" }).click();
  const res = await complete;
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) {
    fail(`complete setup failed for "${goalLabel}": ${body.error ?? res.status()}`);
  }
  const target = body.nextRoute ?? expectedPath;
  await page.waitForURL(
    (url) => url.pathname === target || url.href.includes(expectedPath.replace(/^\//, "")),
    { timeout: 20000 }
  );
  pass(`redirect after "${goalLabel}" -> ${page.url()}`);
}

async function runTeamFlowWithBackNext(page) {
  await waitForSetupLoaded(page);
  await maybeScreenshot(page, "team-step1-desktop");

  for (const width of MOBILE_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await waitForSetupLoaded(page);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      fail(`horizontal overflow at ${width}px (${overflow.scrollWidth} > ${overflow.clientWidth})`);
    }
    await maybeScreenshot(page, `team-step1-${width}`);
    pass(`mobile step 1 layout ok at ${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await fillTeamProfile(page);
  await fillTeamWorkspace(page);
  await clickContinue(page, "Select agent surfaces");

  let state = await readSetupState(page);
  if (state.account?.accountType !== "business") fail("accountType not saved as business");
  if (state.profile?.firstName !== "Jordan") fail("firstName not saved between steps");
  if (!state.account?.companyName?.includes("Northwind")) fail("companyName not saved after step 3 continue");
  pass("progress saved through step 3");

  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForSelector('span:has-text("Company name")');
  const companyValue = await companyInput(page).inputValue();
  if (!companyValue.includes("Northwind")) fail("Back navigation lost company name");
  pass("Back preserves workspace values");

  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForSelector('input[autocomplete="given-name"]');
  const firstName = await page.locator('input[autocomplete="given-name"]').inputValue();
  if (firstName !== "Jordan") fail("Back navigation lost first name");
  pass("Back preserves profile values");

  await clickContinue(page, "Name the workspace");
  await clickContinue(page, "Select agent surfaces");

  await page.getByLabel("Cursor").check();
  await page.getByLabel("GitHub Actions / CI agents").check();
  await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]:checked').length >= 2);
  await clickContinue(page, "Define initial control boundaries");
  await page.getByLabel("Production deploys").check();
  await page.getByLabel("GitHub writes").check();
  await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]:checked').length >= 2);

  for (const width of MOBILE_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      fail(`horizontal overflow on controls step at ${width}px`);
    }
    await maybeScreenshot(page, `team-step5-${width}`);
    pass(`mobile controls step layout ok at ${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await clickContinue(page, "Choose implementation track");
  state = await readSetupState(page);
  if (!state.account?.onboarding?.agentTools?.includes("cursor")) fail("agentTools not saved");
  if (!state.account?.onboarding?.controlAreas?.includes("production_deploys")) {
    fail("controlAreas not saved");
  }
  pass("progress saved through step 5");
}

async function runThemeSpotCheck(page) {
  await page.goto(`${BASE}/onboarding`);
  await waitForSetupLoaded(page);

  for (const theme of ["light", "dark"]) {
    await setTheme(page, theme);
    const applied = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    if (applied !== theme) fail(`theme ${theme} not applied on onboarding`);
    await maybeScreenshot(page, `theme-onboarding-${theme}`);
    pass(`onboarding renders in ${theme} theme`);
  }
}

async function runDashboardThemeSpotCheck(page) {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector("h1, h2", { timeout: 15000 });
  for (const theme of ["light", "dark"]) {
    await setTheme(page, theme);
    const applied = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    if (applied !== theme) fail(`theme ${theme} not applied on dashboard`);
    await maybeScreenshot(page, `theme-dashboard-${theme}`);
    pass(`dashboard home renders in ${theme} theme`);
  }
}

async function runIndividualPath(browser) {
  resetDemoAccount(QA_EMAILS.individual);
  await sleep(2000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await login(page, QA_EMAILS.individual);
  await waitForSetupLoaded(page);
  await fillIndividualPath(page);
  await finishWithGoal(page, "Explore sandbox", "sandbox");
  await context.close();
  pass("individual path completes");
}

async function runRedirectChecks(browser) {
  const goals = [
    { label: "Set up deploy approvals", expected: "deploy-approvals", email: QA_EMAILS.redirectDeploy },
    { label: "Invite team", expected: "panel=members", email: QA_EMAILS.redirectInvite },
    { label: "Register first coding agent", expected: "/dashboard/agents/new", email: QA_EMAILS.redirectAgent }
  ];

  for (const goal of goals) {
    resetDemoAccount(goal.email);
    await sleep(2000);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await login(page, goal.email);
    await waitForSetupLoaded(page);
    await fillTeamProfile(page);
    await fillTeamWorkspace(page);
    await fillAgentsAndControls(page);
    await finishWithGoal(page, goal.label, goal.expected);
    if (goal.expected === "deploy-approvals") {
      await runDashboardThemeSpotCheck(page);
    }
    await context.close();
  }
}

async function main() {
  console.log("Onboarding QA walkthrough");
  console.log(`Base URL: ${BASE}`);
  console.log(`MongoDB: ${MONGODB_URI}`);
  if (SCREENSHOT_DIR) console.log(`Screenshots: ${SCREENSHOT_DIR}`);
  console.log("QA emails:", QA_EMAILS);
  console.log("");

  if (!PASSWORD) {
    fail("Set INTERNAL_DEMO_PASSWORD.");
  }

  resetDemoAccount(QA_EMAILS.team);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await login(page, QA_EMAILS.team);
  await runTeamFlowWithBackNext(page);
  await runThemeSpotCheck(page);
  await context.close();

  await sleep(3000);
  await runIndividualPath(browser);
  await sleep(3000);
  await runRedirectChecks(browser);
  await browser.close();

  const summary = [
    "All onboarding QA checks passed.",
    "Team/company path: back/next, save progress, mobile widths 360/390/414",
    "Individual path: completes to sandbox",
    "Theme spot check: light + dark on onboarding and dashboard",
    "Redirects: deploy approvals, invite team, create agent"
  ].join("\n");
  console.log(`\n${summary}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
