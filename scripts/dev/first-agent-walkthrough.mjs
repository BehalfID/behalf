#!/usr/bin/env node
/**
 * Dev-only QA walkthrough for the first-agent setup flow.
 *
 * Prerequisites:
 *   1. App running locally (override with QA_BASE_URL).
 *   2. Local MongoDB (QA_MONGODB_URI).
 *   3. Playwright Chromium: npx playwright install chromium
 *
 * Usage:
 *   INTERNAL_DEMO_PASSWORD='<password>' node scripts/dev/first-agent-walkthrough.mjs
 *
 * Optional env:
 *   QA_BASE_URL, QA_MONGODB_URI, QA_SCREENSHOT_DIR, QA_FIRST_AGENT_EMAIL
 */

import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.QA_BASE_URL ?? `http://${"localhost"}:${3000}`;
const MONGODB_URI = process.env.QA_MONGODB_URI ?? "mongodb://127.0.0.1:27017/behalf_dev";
const PASSWORD = process.env.INTERNAL_DEMO_PASSWORD ?? "";
const SCREENSHOT_DIR = process.env.QA_SCREENSHOT_DIR ?? "";
const QA_EMAIL = process.env.QA_FIRST_AGENT_EMAIL ?? `qa-first-agent@[REDACTED].internal`; // pragma: allowlist secret

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

function resetDemoAccount() {
  if (!PASSWORD) fail("INTERNAL_DEMO_PASSWORD is required.");
  execSync("npm run dev:reset-internal-demo", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      MONGODB_URI,
      INTERNAL_DEMO_PASSWORD: PASSWORD,
      INTERNAL_DEMO_EMAIL: QA_EMAIL,
      ALLOW_INTERNAL_DEMO_RESET: "1"
    }
  });
}

async function login(page) {
  await page.goto(`${BASE}/login`);
  const response = page.waitForResponse((res) => res.url().includes("/api/auth/login"), { timeout: 15000 });
  await page.fill('input[type="email"]', QA_EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  const res = await response;
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}));
    fail(`login failed: ${body.error ?? res.status()}`);
  }
  await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 20000 });
  pass("login works");
}

async function completeAccountSetup(page) {
  if (!page.url().includes("/onboarding")) return;
  await page.waitForSelector("h1.setup-heading", { timeout: 20000 });
  await page.getByRole("button", { name: /Individual/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.fill('input[autocomplete="given-name"]', "QA");
  await page.fill('input[autocomplete="family-name"]', "Agent");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("label").filter({ hasText: /^Workspace name/ }).locator("input").fill("QA Agent Workspace");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Cursor").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Production deploys").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Register first coding agent/i }).click();
  const complete = page.waitForResponse(
    (res) => res.url().includes("/api/onboarding/account-setup/complete") && res.request().method() === "POST",
    { timeout: 15000 }
  );
  await page.getByRole("button", { name: "Complete setup" }).click();
  const res = await complete;
  if (!res.ok()) fail("account setup completion failed");
  await page.waitForURL(/\/dashboard\/agents\/new/, { timeout: 20000 });
  pass("account setup redirects to first-agent setup");
}

async function maybeScreenshot(page, label) {
  if (!SCREENSHOT_DIR) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const path = join(SCREENSHOT_DIR, `${label}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`screenshot: ${path}`);
}

async function runFirstAgentFlow(page) {
  await page.goto(`${BASE}/dashboard/agents/new`);
  await page.waitForSelector("h1.setup-heading", { timeout: 15000 });
  await maybeScreenshot(page, "first-agent-step1-desktop");

  await page.getByRole("button", { name: "Cursor" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.fill('input[placeholder="Production deploy agent"]', "QA Cursor Agent");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  const create = page.waitForResponse(
    (res) => res.url().includes("/api/dashboard/agents/first-setup") && res.request().method() === "POST",
    { timeout: 15000 }
  );
  await page.getByRole("button", { name: /Create agent \+ token/i }).click();
  const createRes = await create;
  const createBody = await createRes.json().catch(() => ({}));
  if (!createRes.ok()) fail(`first-agent create failed: ${createBody.error ?? createRes.status()}`);
  if (!createBody.apiKey?.startsWith("bhf_sk_")) fail("api key not returned from first-agent setup");
  pass("agent + token created");

  await page.getByRole("button", { name: /Continue to integration/i }).click();
  await page.getByRole("button", { name: /Run test decision/i }).click();

  const verify = page.waitForResponse(
    (res) => res.url().includes("/api/verify") && res.request().method() === "POST",
    { timeout: 15000 }
  );
  await page.getByRole("button", { name: /Run test decision/i }).click();
  const verifyRes = await verify;
  const verifyBody = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok()) fail(`verify test failed: ${verifyBody.error ?? verifyRes.status()}`);
  pass(`test decision recorded (${verifyBody.approvalRequired ? "approval required" : verifyBody.allowed ? "allowed" : "denied"})`);

  await page.getByRole("button", { name: /Continue to logs/i }).click();
  await page.getByRole("link", { name: /Open audit logs/i }).click();
  await page.waitForURL(/\/dashboard\/logs/, { timeout: 15000 });
  pass("logs handoff opens audit console");

  if (verifyBody.approvalRequired && verifyBody.approvalId) {
    await page.goto(`${BASE}/dashboard/approvals?highlight=${encodeURIComponent(verifyBody.approvalId)}`);
    await page.waitForSelector(".ops-queue-console, .ops-console", { timeout: 15000 });
    await page.getByRole("button", { name: /^Approve$/i }).first().click();
    pass("pending approval resolved from queue");
  }
}

async function main() {
  console.log("First-agent setup QA walkthrough");
  console.log(`Base URL: ${BASE}`);
  console.log(`MongoDB: ${MONGODB_URI}`);
  if (SCREENSHOT_DIR) console.log(`Screenshots: ${SCREENSHOT_DIR}`);

  resetDemoAccount();
  await sleep(2000);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await login(page);
  await completeAccountSetup(page);
  await runFirstAgentFlow(page);

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${BASE}/dashboard/agents/new`);
    await page.waitForSelector("h1.setup-heading", { timeout: 15000 });
    await maybeScreenshot(page, `first-agent-mobile-${width}`);
    pass(`mobile layout renders at ${width}px`);
  }

  await browser.close();
  console.log("\nAll first-agent setup QA checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
