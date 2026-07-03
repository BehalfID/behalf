import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = `http://${"localhost"}:3000`;
const PASSWORD = "cX=GVZbxL93oBn3Ce&mkW$_4MRqy-ukr!Ky2WQxr@ZX_3kCL";

async function main() {
  const email = execSync(
    "mongosh behalf_dev --quiet --eval 'db.developerusers.findOne({}, {email:1}).email'",
    { encoding: "utf8" }
  ).trim();

  const browser = await chromium.launch();
  const log = [];

  async function capture(page, label) {
    const path = `/opt/cursor/artifacts/${label}.png`;
    await page.screenshot({ path, fullPage: true });
    log.push(`${label}: ${path}`);
  }

  // Desktop onboarding flow
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await desktop.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/onboarding/, { timeout: 20000 });
  await capture(page, "onboarding-step1-desktop");

  for (const width of [360, 390, 414]) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, `onboarding-step1-${width}`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole("button", { name: /Just me/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForSelector('input[autocomplete="given-name"]');
  await capture(page, "onboarding-step2-desktop");

  await page.fill('input[autocomplete="given-name"]', "Alex");
  await page.fill('input[autocomplete="family-name"]', "Rivera");
  await page.getByRole("button", { name: "Continue" }).click();
  await capture(page, "onboarding-step3-individual-desktop");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Claude Code").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await capture(page, "onboarding-step4-agents-desktop");

  await page.getByLabel("Production deploys").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await capture(page, "onboarding-step5-controls-desktop");

  await page.getByRole("button", { name: /Set up my first coding agent/ }).click();
  await capture(page, "onboarding-step6-first-move-desktop");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  await capture(page, "dashboard-home-desktop");

  for (const width of [360, 390, 414]) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, `dashboard-home-${width}`);
  }

  await desktop.close();

  writeFileSync("/opt/cursor/artifacts/browser-walkthrough.txt", log.join("\n"));
  console.log(log.join("\n"));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
