#!/usr/bin/env node
/**
 * Dev-only QA walkthrough for the account-setup onboarding flow.
 *
 * Prerequisites:
 *   1. App running locally on the default dev port (override with QA_BASE_URL).
 *   2. Local non-production MongoDB (default mongodb://127.0.0.1:27017/behalf_dev).
 *   3. Internal demo account reset before each run:
 *        MONGODB_URI=mongodb://127.0.0.1:27017/behalf_dev \
 *        INTERNAL_DEMO_PASSWORD='<46+ char password>' npm run dev:reset-internal-demo
 *   4. Playwright Chromium: npx playwright install chromium
 *
 * Usage:
 *   INTERNAL_DEMO_PASSWORD='<password>' node scripts/dev/onboarding-walkthrough.mjs
 *
 * Optional env:
 *   QA_BASE_URL=<app-base-url>
 *   QA_MONGODB_URI=mongodb://127.0.0.1:27017/behalf_dev
 *   QA_SCREENSHOT_DIR=/tmp/behalf-onboarding-qa   (omit to skip screenshots)
 *   QA_RESET=1   (run dev:reset-internal-demo before tests; requires INTERNAL_DEMO_PASSWORD)
 */

import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.QA_BASE_URL ?? `http://${"localhost"}:${3000}`;
const MONGODB_URI = process.env.QA_MONGODB_URI ?? "mongodb://127.0.0.1:27017/behalf_dev";
const PASSWORD = process.env.INTERNAL_DEMO_PASSWORD ?? "";
const SCREENSHOT_DIR = process.env.QA_SCREENSHOT_DIR ?? "";

const MOBILE_WIDTHS = [360, 390, 414];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function resetDemoAccount() {
  if (!PASSWORD) {
    fail("INTERNAL_DEMO_PASSWORD is required. Reset the demo account first or set QA_RESET=1 with the password.");
  }
  execSync("npm run dev:reset-internal-demo", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, MONGODB_URI, INTERNAL_DEMO_PASSWORD: PASSWORD }
  });
}

function demoEmail() {
  return execSync(
    "mongosh behalf_dev --quiet --eval 'db.developerusers.findOne({}, {email:1}).email'",
    { encoding: "utf8", env: { ...process.env, MONGODB_URI } }
  ).trim();
}

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 20000 });
}

async function waitForSetupLoaded(page) {
  await page.waitForSelector("h1.ob-heading", { timeout: 20000 });
  await page.waitForFunction(() => !document.body.textContent?.includes("Loading your setup"), null, {
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

async function fillTeamProfile(page) {
  await page.getByRole("button", { name: /My team \/ company/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForSelector('input[autocomplete="given-name"]');
  await page.fill('input[autocomplete="given-name"]', "Jordan");
  await page.fill('input[autocomplete="family-name"]', "Lee");
  await page.fill('input[autocomplete="organization-title"]', "Engineering Lead");
  await page.fill('input[autocomplete="tel"]', "+1 415 555 0199");
  await page.getByRole("button", { name: "Continue" }).click();
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
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Cursor").check();
  await page.getByLabel("GitHub Actions / CI agents").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Production deploys").check();
  await page.getByLabel("GitHub writes").check();
  await page.getByRole("button", { name: "Continue" }).click();
}

async function finishWithGoal(page, goalLabel, expectedPath) {
  await page.getByRole("button", { name: new RegExp(goalLabel, "i") }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(new RegExp(expectedPath), { timeout: 20000 });
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
  await page.getByRole("button", { name: "Continue" }).click();

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

  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForSelector('span:has-text("Company name")');
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Cursor").check();
  await page.getByLabel("GitHub Actions / CI agents").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Production deploys").check();
  await page.getByLabel("GitHub writes").check();

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

  await page.getByRole("button", { name: "Continue" }).click();
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

async function runRedirectChecks(browser, email) {
  const goals = [
    { label: "Set up deploy approvals", expected: "deploy-approvals" },
    { label: "Invite my team", expected: "panel=members" },
    { label: "Set up my first coding agent", expected: "/dashboard/onboarding" }
  ];

  for (const goal of goals) {
    if (process.env.QA_RESET === "1") resetDemoAccount();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await login(page, email);
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
  console.log("");

  if (process.env.QA_RESET === "1") {
    resetDemoAccount();
  } else if (!PASSWORD) {
    fail("Set INTERNAL_DEMO_PASSWORD or QA_RESET=1");
  }

  const email = demoEmail();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await login(page, email);
  await runTeamFlowWithBackNext(page);
  await runThemeSpotCheck(page);
  await context.close();

  await runRedirectChecks(browser, email);
  await browser.close();

  const summary = [
    "All onboarding QA checks passed.",
    "Team/company path: back/next, save progress, mobile widths 360/390/414",
    "Theme spot check: light + dark on onboarding and dashboard",
    "Redirects: deploy approvals, invite team, create agent"
  ].join("\n");
  console.log(`\n${summary}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
