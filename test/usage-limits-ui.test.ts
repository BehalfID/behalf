import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatUsageCount,
  getCountedUsageHelper,
  getOverLimitNote,
  getUsageLimitState,
  getUsageStatusLabel,
  getWebhookHelper,
  getWebhookValue
} from "@/lib/usageDisplay";

const dashboardClientSource = readFileSync(join(process.cwd(), "app/dashboard/client.tsx"), "utf-8");
const billingClientSource = readFileSync(join(process.cwd(), "app/dashboard/billing/client.tsx"), "utf-8");
const usageTileSource = readFileSync(join(process.cwd(), "components/usage/UsageLimitTile.tsx"), "utf-8");
const cssSource = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");

describe("usage limit display helpers", () => {
  it("classifies normal, near, over, and unlimited states", () => {
    expect(getUsageLimitState(1, 3)).toBe("normal");
    expect(getUsageLimitState(3, 3)).toBe("near");
    expect(getUsageLimitState(4, 3)).toBe("over");
    expect(getUsageLimitState(99, null)).toBe("unlimited");
    expect(getUsageLimitState(99, Infinity)).toBe("unlimited");
  });

  it("renders unlimited limits as Unlimited", () => {
    expect(formatUsageCount(12, null)).toBe("12 / Unlimited");
    expect(formatUsageCount(0, Infinity)).toBe("0 / Unlimited");
  });

  it("exposes accessible status labels for non-normal states", () => {
    expect(getUsageStatusLabel("over")).toBe("Over limit");
    expect(getUsageStatusLabel("near")).toBe("Nearing limit");
    expect(getUsageStatusLabel("unlimited")).toBe("Unlimited");
    expect(getUsageStatusLabel("normal")).toBeNull();
  });

  it("includes creation-only enforcement copy when over limit", () => {
    expect(getOverLimitNote("agents", 4, 3)).toBe(
      "4 / 3 agents — over limit. Existing agents remain active; creating new agents is blocked."
    );
    expect(getOverLimitNote("protectedRepos", 2, 1)).toContain("new enrollments are blocked");
    expect(getOverLimitNote("seats", 2, 1)).toContain("adding new billable members is blocked");
  });

  it("describes creation-only enforcement for in-limit resources", () => {
    expect(getCountedUsageHelper("agents", 1, 3)).toBe("New agents are blocked at this limit.");
    expect(getCountedUsageHelper("seats", 1, 1)).toContain("New billable members are blocked at this limit.");
    expect(getCountedUsageHelper("protectedRepos", 0, 1)).toContain("New protected repo enrollments are blocked");
  });
});

describe("dashboard plan usage panel", () => {
  it("renders seat and protected repo usage labels via shared tiles", () => {
    expect(dashboardClientSource).toContain('<CountedUsageLimitTile kind="seats" label="Seats"');
    expect(dashboardClientSource).toContain('label="Protected repos"');
    expect(dashboardClientSource).toContain("used={usage.protectedRepoCount}");
  });

  it("uses shared usage limit tiles with visual state classes", () => {
    expect(dashboardClientSource).toContain("CountedUsageLimitTile");
    expect(usageTileSource).toContain("usageLimitTileClassName");
    expect(cssSource).toContain(".usage-limit-tile--over");
    expect(cssSource).toContain(".usage-limit-status");
  });
});

describe("billing limits grid", () => {
  it("includes helper text for creation-only enforcement", () => {
    expect(billingClientSource).toContain("CountedUsageLimitTile");
    expect(billingClientSource).toContain('label="Billable seats"');
    expect(billingClientSource).toContain("getCountedUsageHelper");
    expect(billingClientSource).toContain("getOverLimitNote");
  });

  it("defines usage bar over-limit styling with text status", () => {
    expect(billingClientSource).toContain("billing-usage-fill--over");
    expect(billingClientSource).toContain('className="usage-limit-status"');
    expect(cssSource).toContain(".billing-usage-fill--over");
  });
});

describe("webhook entitlement UI copy", () => {
  it("does not render disabled webhooks as Available", () => {
    expect(getWebhookValue(false)).toBe("Upgrade required");
    expect(getWebhookHelper(false)).toBe("Upgrade to Pro to enable webhook delivery.");
    expect(usageTileSource).not.toMatch(/webhooksEnabled \? "Enabled" : "Available"/);
    expect(usageTileSource).not.toContain('"Available"');
  });

  it("keeps disabled webhook helper copy on billing and dashboard surfaces", () => {
    expect(usageTileSource).toContain('getWebhookValue(enabled)');
    expect(usageTileSource).toContain("Not included");
    expect(billingClientSource).toContain("WebhookUsageLimitTile");
    expect(dashboardClientSource).toContain("WebhookUsageLimitTile");
  });
});
