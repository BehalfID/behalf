/**
 * Record a polished BehalfID product demo with Playwright video capture.
 *
 * Hybrid approach: real UI navigation + typed interaction, with API fallbacks
 * for multi-step forms so the recording stays reliable.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium, type Page } from "playwright";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { hashPassword } from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
import DeveloperUser from "@/models/DeveloperUser";
import AccountMembership from "@/models/AccountMembership";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const ARTIFACTS = join(process.cwd(), "artifacts");
const SCREENSHOTS = join(ARTIFACTS, "screenshots");
const VIDEO_DIR = mkdtempSync(join(tmpdir(), "behalf-demo-video-"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function hold(page: Page, ms = 3500) {
  await page.mouse.move(720, 420);
  await sleep(ms);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SCREENSHOTS, `${name}.png`), fullPage: false });
}

async function dismissChrome(page: Page) {
  const accept = page.getByRole("button", { name: /Accept all|Essential only/i });
  if (await accept.count()) {
    await accept.first().click().catch(() => undefined);
    await sleep(300);
  }
  // Prefer dark product theme for the recording.
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.setAttribute("data-mode", "dark");
    try {
      localStorage.setItem("behalf-theme", "dark");
    } catch {
      // ignore
    }
  });
}

function latestVerificationCode(email?: string): string {
  const log = readFileSync(join(process.cwd(), ".behalf/dev-email.log"), "utf8");
  const chunks = log.split("---- ").filter(Boolean);
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i]!;
    if (email && !chunk.includes(`to: ${email}`)) continue;
    const match = chunk.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/);
    if (match) return match[1]!;
  }
  throw new Error(`No verification code in .behalf/dev-email.log${email ? ` for ${email}` : ""}`);
}

async function seedLead(ownerEmail: string) {
  await connectToDatabase();
  const owner = await DeveloperUser.findOne({ email: ownerEmail }).lean();
  if (!owner?.primaryAccountId) throw new Error("Owner account missing");
  const email = `lead+demo${Date.now()}@example.com`;
  const password = "LeadApproverPassword123!";
  const userId = createPublicId("user");
  await DeveloperUser.create({
    userId,
    email,
    passwordHash: await hashPassword(password),
    authProviders: ["password"],
    dateOfBirth: "1988-05-01",
    emailVerified: true,
    primaryAccountId: owner.primaryAccountId,
    firstName: "Jordan",
    lastName: "Lee",
    jobTitle: "Engineering Lead",
    // Skip forced account-setup redirect so the lead can approve immediately.
    onboardingCompletedAt: new Date()
  });
  await AccountMembership.create({
    membershipId: createPublicId("mbr"),
    accountId: owner.primaryAccountId,
    userId,
    role: "ENGINEERING_LEAD",
    status: "active"
  });
  return { email, password };
}

async function typeSlow(page: Page, selector: string, value: string) {
  const locator = page.locator(selector).first();
  await locator.click();
  await locator.fill("");
  await locator.pressSequentially(value, { delay: 28 });
}

async function completeOnboardingApi(page: Page) {
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/onboarding/account-setup/complete", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Avery",
        lastName: "Reed",
        jobTitle: "Platform Engineer",
        accountType: "business",
        companyName: "Northwind Labs",
        workspaceName: "Northwind Labs",
        teamSize: "2-5",
        agentTools: ["cursor", "claude_code"],
        controlAreas: ["production_deploys", "secrets"],
        primaryGoal: "approvals",
        firstSetupGoal: "create_agent"
      })
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  });
  if (result.status >= 400) {
    throw new Error(`Onboarding complete failed: ${JSON.stringify(result)}`);
  }
  return result.body as { nextRoute?: string };
}

async function createAgentApi(page: Page) {
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/dashboard/agents/first-setup", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface: "cursor",
        name: "Release Copilot",
        description: "Staging deploys with production approval gates",
        environment: "staging",
        controlProfile: "balanced",
        approvalGates: ["production_deploys"]
      })
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  });
  if (result.status >= 400) {
    throw new Error(`Agent create failed: ${JSON.stringify(result)}`);
  }
  return result.body as {
    agent: { agentId: string; name: string };
    apiKey: string;
  };
}

async function runCli(page: Page, command: string) {
  const input = page.locator("#browser-cli-input");
  await input.waitFor({ state: "visible", timeout: 20000 });
  await input.click();
  await input.fill("");
  await input.pressSequentially(command, { delay: 22 });
  await page.getByRole("button", { name: /^Run$/ }).click();
  await page
    .waitForSelector(".browser-cli__line--meta:has-text('Running')", {
      state: "detached",
      timeout: 25000
    })
    .catch(() => undefined);
  await sleep(1200);
}

async function main() {
  mkdirSync(SCREENSHOTS, { recursive: true });
  mkdirSync(ARTIFACTS, { recursive: true });

  const stamp = Date.now();
  const ownerEmail = `demo+record${stamp}@example.com`;
  const ownerPassword = "DemoReadyPassword123!";
  const meta: Record<string, unknown> = { ownerEmail, base: BASE };

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--font-render-hinting=none"]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);

  try {
    // Homepage
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await dismissChrome(page);
    await sleep(2200);
    await shot(page, "01-homepage");
    await hold(page);

    // Signup
    await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
    await dismissChrome(page);
    await sleep(1800);
    await shot(page, "02-signup");
    await typeSlow(page, "#auth-email", ownerEmail);
    await typeSlow(page, "#auth-password", ownerPassword);
    await page.locator("#auth-date-of-birth").fill("1990-04-12");
    await page.getByRole("button", { name: /Create account|Sign up/i }).click();
    await page.waitForURL(/verify-email|onboarding|dashboard/, { timeout: 45000 });
    await dismissChrome(page);
    await shot(page, "03-after-signup");

    // Verify
    if (page.url().includes("verify-email")) {
      await sleep(1500);
      // Wait for the signup email to land in the local capture log.
      let code = "";
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          code = latestVerificationCode(ownerEmail);
          break;
        } catch {
          await sleep(250);
        }
      }
      if (!code) throw new Error("Timed out waiting for verification email capture");
      meta.verificationCode = code;
      await page.locator("#verify-code").fill(code);
      await page.getByRole("button", { name: /Verify code/i }).click();
      const cta = page.getByRole("link", { name: /Go to dashboard/i });
      try {
        await cta.waitFor({ timeout: 15000 });
        await shot(page, "04-verified");
        await hold(page);
        await cta.click();
      } catch {
        await page.evaluate(async (verificationCode) => {
          await fetch("/api/auth/verify-email", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: verificationCode })
          });
        }, code);
        await shot(page, "04-verified");
        await hold(page);
        await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
      }
    }

    await page.waitForURL(/onboarding|dashboard/, { timeout: 45000 });
    await dismissChrome(page);

    // Onboarding UI walk + API complete for reliability
    if (!page.url().includes("/onboarding")) {
      await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
    }
    await dismissChrome(page);
    await sleep(1800);
    await shot(page, "05-onboarding");
    await hold(page);

    // Visually step through a couple choices, then finish via API
    await page.locator("button.setup-choice", { hasText: /Team \/ company/i }).click();
    await sleep(1800);
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await typeSlow(page, 'input[autocomplete="given-name"]', "Avery");
    await typeSlow(page, 'input[autocomplete="family-name"]', "Reed");
    await shot(page, "05b-onboarding-profile");
    const completed = await completeOnboardingApi(page);
    meta.nextRoute = completed.nextRoute;
    await page.goto(`${BASE}${completed.nextRoute ?? "/dashboard/agents/new"}`, {
      waitUntil: "domcontentloaded"
    });
    await dismissChrome(page);
    await sleep(1600);
    await shot(page, "06-agents-new");

    // Show first-agent wizard UI, then create via API and land on agent detail
    await page.locator("button", { hasText: /Cursor/i }).first().click().catch(() => undefined);
    await sleep(1800);
    await shot(page, "07-agent-surface");
    const created = await createAgentApi(page);
    meta.agentId = created.agent.agentId;
    meta.apiKeyPreview = `${created.apiKey.slice(0, 12)}…`;

    await page.goto(`${BASE}/dashboard/agents`, { waitUntil: "domcontentloaded" });
    await dismissChrome(page);
    await sleep(1600);
    await shot(page, "08-agents-list");
    await hold(page);

    await page.goto(`${BASE}/dashboard/agents/${created.agent.agentId}`, {
      waitUntil: "domcontentloaded"
    });
    await sleep(1800);
    await shot(page, "09-agent-detail");
    await hold(page);

    await page.goto(`${BASE}/dashboard/agents/${created.agent.agentId}/permissions`, {
      waitUntil: "domcontentloaded"
    });
    await sleep(1800);
    await shot(page, "10-permissions");
    await hold(page);

    // Browser CLI
    await page.goto(`${BASE}/dashboard/cli`, { waitUntil: "domcontentloaded" });
    await dismissChrome(page);
    await sleep(2600);
    await shot(page, "11-cli");
    await hold(page);
    const agentId = created.agent.agentId;
    await runCli(page, "behalf --help");
    await runCli(page, "behalf doctor");
    await runCli(page, "behalf agents list");
    await runCli(page, `behalf config set agent-id ${agentId}`);
    await runCli(page, `behalf permissions list ${agentId}`);
    await shot(page, "12-cli-permissions");
    await runCli(page, `behalf verify ${agentId} --action deploy --vendor staging`);
    await shot(page, "13-cli-allowed");
    await hold(page);
    await runCli(page, `behalf verify ${agentId} --action purchase --vendor evil.com --amount 9999`);
    await shot(page, "14-cli-denied");
    await hold(page);
    await runCli(page, `behalf verify ${agentId} --action deploy_production --vendor production`);
    await shot(page, "15-cli-approval");
    await hold(page);

    // Approvals as owner (blocked self-approve) then lead approves
    await page.goto(`${BASE}/dashboard/approvals`, { waitUntil: "domcontentloaded" });
    await sleep(1800);
    await shot(page, "16-approvals-pending");
    await hold(page);

    const lead = await seedLead(ownerEmail);
    meta.leadEmail = lead.email;
    const leadContext = await browser.newContext({ colorScheme: "dark" });
    const leadPage = await leadContext.newPage();
    await leadPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await leadPage.locator("#auth-email").fill(lead.email);
    await leadPage.locator("#auth-password").fill(lead.password);
    await leadPage.getByRole("button", { name: /Sign in|Log in/i }).click();
    await leadPage.waitForURL(/dashboard|onboarding/, { timeout: 45000 });
    await leadPage.goto(`${BASE}/dashboard/approvals`, { waitUntil: "domcontentloaded" });
    await sleep(2400);
    await leadPage.screenshot({ path: join(SCREENSHOTS, "17-lead-approvals.png") });

    // Approve via API using the lead session (UI may still be hydrating in headless).
    const approved = await leadPage.evaluate(async () => {
      const list = await fetch("/api/dashboard/approvals", { credentials: "include" });
      const body = (await list.json()) as {
        approvals?: Array<{ approvalId: string; canApprove?: boolean; status?: string }>;
      };
      const target = (body.approvals ?? []).find(
        (item) => item.status === "pending" && item.canApprove !== false
      );
      if (!target) {
        return { ok: false, body };
      }
      const res = await fetch(`/api/dashboard/approvals/${target.approvalId}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      });
      const result = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, approvalId: target.approvalId, result };
    });
    if (!approved.ok) {
      throw new Error(`Lead approve failed: ${JSON.stringify(approved)}`);
    }
    meta.approvedApprovalId = approved.approvalId;
    await leadPage.reload({ waitUntil: "domcontentloaded" });
    await sleep(1800);
    await leadPage.screenshot({ path: join(SCREENSHOTS, "18-lead-approved.png") });
    await leadContext.close();

    await page.goto(`${BASE}/dashboard/approvals`, { waitUntil: "domcontentloaded" });
    await sleep(1600);
    await shot(page, "19-approvals-resolved");
    await hold(page);

    await page.goto(`${BASE}/dashboard/cli`, { waitUntil: "domcontentloaded" });
    await runCli(page, `behalf verify ${agentId} --action deploy_production --vendor production`);
    await shot(page, "20-cli-post-approve");
    await hold(page);

    await page.goto(`${BASE}/dashboard/logs`, { waitUntil: "domcontentloaded" });
    await sleep(2200);
    await shot(page, "21-audit-logs");
    await hold(page);

    await page.goto(`${BASE}/dashboard/agents/${agentId}/activity`, {
      waitUntil: "domcontentloaded"
    });
    await sleep(2200);
    await shot(page, "22-activity");
    await hold(page);

        // Keep the final home frame under free-plan seat limits for a clean close.
    await connectToDatabase();
    {
      const owner = await DeveloperUser.findOne({ email: ownerEmail }).lean();
      if (owner?.primaryAccountId) {
        await AccountMembership.deleteMany({
          accountId: owner.primaryAccountId,
          role: "ENGINEERING_LEAD"
        }).catch(() => undefined);
      }
    }

    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Control plane/i }).first().waitFor({ timeout: 30000 }).catch(() => undefined);
    await page.locator(".ops-strip, .dashboard-header, text=/Operational|Awaiting|Attention/i").first().waitFor({ timeout: 30000 }).catch(() => undefined);
    await sleep(2600);
    await shot(page, "23-home-final");
    await hold(page);
  } finally {
    await context.close();
    await browser.close();
    await mongoose.disconnect().catch(() => undefined);
  }

  const videos = readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".webm"));
  if (!videos.length) throw new Error("No Playwright video recorded");
  const webm = join(VIDEO_DIR, videos[0]!);
  const mp4 = join(ARTIFACTS, "demo.mp4");
  const ffmpeg = spawnSync(
    "ffmpeg",
    ["-y", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4],
    { encoding: "utf8" }
  );
  if (ffmpeg.status !== 0) {
    copyFileSync(webm, join(ARTIFACTS, "demo.webm"));
    console.error(ffmpeg.stderr);
    throw new Error("ffmpeg encode failed");
  }
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  copyFileSync(mp4, "/opt/cursor/artifacts/demo.mp4");
  writeFileSync(join(ARTIFACTS, "demo-recording-meta.json"), JSON.stringify(meta, null, 2));
  writeFileSync("/tmp/demo-recording-meta.json", JSON.stringify(meta, null, 2));
  console.log("Recorded", mp4, meta);
  rmSync(VIDEO_DIR, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
