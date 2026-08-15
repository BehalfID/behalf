import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  BUSINESS_PLAN_PRICE_CENTS,
  formatLimit,
  getLogRetentionDays,
  getPlanEntitlements,
  getQuotas,
  getVerificationLimit,
  isPaidPlan,
  isSelfServePlan,
  isUnlimitedLimit,
  normalizePlan,
  PLAN_ENTITLEMENTS,
  PLAN_QUOTAS,
  PLANS,
  PRO_PLAN_PRICE_CENTS,
  SELF_SERVE_PLANS,
  TEAM_PLAN_PRICE_CENTS
} from "@/lib/plans";
import {
  AUTHORITY_LEVELS,
  BILLABLE_WORKSPACE_ROLES,
  isBillableWorkspaceRole,
  WORKSPACE_ROLES
} from "@/lib/authority";
import { repoPath } from "./helpers/repoPath";

describe("plan entitlements source of truth", () => {
  it("defines all plans", () => {
    expect(PLANS).toEqual(["free", "pro", "team", "business", "enterprise"]);
    for (const plan of PLANS) {
      expect(PLAN_ENTITLEMENTS[plan]).toBeDefined();
    }
  });

  it("publishes self-serve prices", () => {
    expect(PRO_PLAN_PRICE_CENTS).toBe(2000);
    expect(TEAM_PLAN_PRICE_CENTS).toBe(7900);
    expect(BUSINESS_PLAN_PRICE_CENTS).toBe(24_900);
    expect(SELF_SERVE_PLANS).toEqual(["pro", "team", "business"]);
    expect(isSelfServePlan("pro")).toBe(true);
    expect(isSelfServePlan("enterprise")).toBe(false);
  });

  it("defines free plan entitlements", () => {
    expect(PLAN_ENTITLEMENTS.free).toEqual({
      maxBillableUsers: 1,
      maxAgents: 3,
      maxProtectedRepos: 1,
      monthlyVerifications: 1_000,
      logRetentionDays: 7,
      webhooksEnabled: false,
      managedProfilesEnabled: true,
      requiredManagedProfileModeEnabled: true,
      pauseApprovalsEnabled: true,
      advancedAuditExportsEnabled: false,
      googleWorkspaceSsoEnabled: false
    });
  });

  it("defines a monotonic Free → Pro → Team → Business ladder", () => {
    expect(PLAN_ENTITLEMENTS.pro).toMatchObject({
      maxBillableUsers: 25,
      maxAgents: 50,
      maxProtectedRepos: 10,
      monthlyVerifications: 250_000,
      logRetentionDays: 90,
      webhooksEnabled: true,
      advancedAuditExportsEnabled: false,
      googleWorkspaceSsoEnabled: true
    });
    expect(PLAN_ENTITLEMENTS.team).toMatchObject({
      maxBillableUsers: 50,
      maxAgents: 100,
      maxProtectedRepos: 25,
      monthlyVerifications: 1_000_000,
      logRetentionDays: 90,
      webhooksEnabled: true,
      advancedAuditExportsEnabled: false,
      googleWorkspaceSsoEnabled: true
    });
    expect(PLAN_ENTITLEMENTS.business).toMatchObject({
      maxBillableUsers: 100,
      maxAgents: 250,
      maxProtectedRepos: 100,
      monthlyVerifications: 2_000_000,
      logRetentionDays: 180,
      webhooksEnabled: true,
      advancedAuditExportsEnabled: true,
      googleWorkspaceSsoEnabled: true
    });

    const ladder = ["free", "pro", "team", "business"] as const;
    for (let i = 1; i < ladder.length; i++) {
      const lower = PLAN_ENTITLEMENTS[ladder[i - 1]];
      const higher = PLAN_ENTITLEMENTS[ladder[i]];
      expect(higher.maxBillableUsers).toBeGreaterThanOrEqual(lower.maxBillableUsers);
      expect(higher.maxAgents).toBeGreaterThanOrEqual(lower.maxAgents);
      expect(higher.maxProtectedRepos).toBeGreaterThanOrEqual(lower.maxProtectedRepos);
      expect(higher.monthlyVerifications).toBeGreaterThanOrEqual(lower.monthlyVerifications);
      expect(higher.logRetentionDays).toBeGreaterThanOrEqual(lower.logRetentionDays);
    }
  });

  it("treats enterprise numeric limits as unlimited with custom finite retention", () => {
    const enterprise = PLAN_ENTITLEMENTS.enterprise;
    expect(isUnlimitedLimit(enterprise.maxBillableUsers)).toBe(true);
    expect(isUnlimitedLimit(enterprise.maxAgents)).toBe(true);
    expect(isUnlimitedLimit(enterprise.maxProtectedRepos)).toBe(true);
    expect(isUnlimitedLimit(enterprise.monthlyVerifications)).toBe(true);
    expect(enterprise.logRetentionDays).toBe(365);
    expect(enterprise.webhooksEnabled).toBe(true);
    expect(enterprise.advancedAuditExportsEnabled).toBe(true);
    expect(enterprise.googleWorkspaceSsoEnabled).toBe(true);
  });

  it("normalizes unknown, missing, or invalid plans to free (fail closed)", () => {
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan("team")).toBe("team");
    expect(normalizePlan("business")).toBe("business");
    expect(normalizePlan("stripe_missing")).toBe("free");
    expect(normalizePlan(null)).toBe("free");
    expect(normalizePlan(undefined)).toBe("free");
    expect(getPlanEntitlements("bogus")).toEqual(PLAN_ENTITLEMENTS.free);
  });

  it("exposes verification limit and log retention helpers", () => {
    expect(getVerificationLimit("free")).toBe(1_000);
    expect(getVerificationLimit("team")).toBe(1_000_000);
    expect(getVerificationLimit("business")).toBe(2_000_000);
    expect(getVerificationLimit("enterprise")).toBe(Infinity);
    expect(getLogRetentionDays("free")).toBe(7);
    expect(getLogRetentionDays("team")).toBe(90);
    expect(getLogRetentionDays("business")).toBe(180);
    expect(getLogRetentionDays(undefined)).toBe(7);
  });

  it("classifies unlimited values and formats limits for display", () => {
    expect(isUnlimitedLimit(Infinity)).toBe(true);
    expect(isUnlimitedLimit(3)).toBe(false);
    expect(isUnlimitedLimit(null)).toBe(true);
    expect(isUnlimitedLimit(undefined)).toBe(true);
    expect(formatLimit(Infinity)).toBe("Unlimited");
    expect(formatLimit(null)).toBe("Unlimited");
    expect(formatLimit(1_000)).toBe((1_000).toLocaleString());
  });

  it("classifies free as the only unpaid plan", () => {
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("team")).toBe(true);
    expect(isPaidPlan("business")).toBe(true);
    expect(isPaidPlan("enterprise")).toBe(true);
  });

  it("derives the legacy quota view from entitlements for every plan", () => {
    for (const plan of PLANS) {
      expect(getQuotas(plan)).toEqual(PLAN_QUOTAS[plan]);
      expect(PLAN_QUOTAS[plan]).toEqual({
        maxAgents: PLAN_ENTITLEMENTS[plan].maxAgents,
        verificationsPerMonth: PLAN_ENTITLEMENTS[plan].monthlyVerifications,
        webhooksEnabled: PLAN_ENTITLEMENTS[plan].webhooksEnabled,
        logRetentionDays: PLAN_ENTITLEMENTS[plan].logRetentionDays
      });
    }
  });
});

describe("webhook entitlement UI copy", () => {
  it("does not render disabled webhooks as Available on the dashboard usage panel", async () => {
    const dashboardSource = await readFile(repoPath("app", "dashboard", "client.tsx"), "utf8");
    const tileSource = await readFile(repoPath("components", "usage", "UsageLimitTile.tsx"), "utf8");
    expect(dashboardSource).toContain("WebhookUsageLimitTile");
    expect(tileSource).toContain('getWebhookValue(enabled)');
    expect(tileSource).not.toMatch(/webhooksEnabled \? "Enabled" : "Available"/);
    expect(tileSource).not.toContain('"Available"');
  });

  it("renders disabled webhooks as Upgrade required on the billing usage surface", async () => {
    const billingSource = await readFile(repoPath("app", "dashboard", "billing", "client.tsx"), "utf8");
    const usageDisplay = await readFile(repoPath("lib", "usageDisplay.ts"), "utf8");
    expect(billingSource).toContain("WebhookUsageLimitTile");
    expect(usageDisplay).toContain('enabled ? "Enabled" : "Upgrade required"');
  });
});

describe("authority roles stay aligned with billable seats", () => {
  it("keeps billable roles as a subset of workspace roles", () => {
    for (const role of BILLABLE_WORKSPACE_ROLES) {
      expect(WORKSPACE_ROLES).toContain(role);
      expect(isBillableWorkspaceRole(role)).toBe(true);
    }
    expect(isBillableWorkspaceRole("VIEWER")).toBe(false);
    expect(AUTHORITY_LEVELS.OWNER).toBeGreaterThan(AUTHORITY_LEVELS.VIEWER);
  });
});
