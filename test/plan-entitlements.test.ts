import { describe, expect, it } from "vitest";
import {
  formatLimit,
  getLogRetentionDays,
  getPlanEntitlements,
  getQuotas,
  getVerificationLimit,
  isPaidPlan,
  isUnlimitedLimit,
  normalizePlan,
  PLAN_ENTITLEMENTS,
  PLAN_QUOTAS,
  PLANS
} from "@/lib/plans";
import {
  AUTHORITY_LEVELS,
  BILLABLE_WORKSPACE_ROLES,
  isBillableWorkspaceRole,
  WORKSPACE_ROLES
} from "@/lib/authority";

describe("plan entitlements source of truth", () => {
  it("defines all plans", () => {
    expect(PLANS).toEqual(["free", "pro", "team", "business", "enterprise"]);
    for (const plan of PLANS) {
      expect(PLAN_ENTITLEMENTS[plan]).toBeDefined();
    }
  });

  it("defines free plan entitlements", () => {
    expect(PLAN_ENTITLEMENTS.free).toEqual({
      maxBillableUsers: 1,
      maxAgents: 3,
      maxProtectedRepos: 1,
      monthlyVerifications: 10_000,
      logRetentionDays: 7,
      webhooksEnabled: false,
      // Managed Profiles (including required mode and pause approvals) were
      // already available on free before the entitlement layer, so the flags
      // stay true to avoid changing Managed Profiles semantics.
      managedProfilesEnabled: true,
      requiredManagedProfileModeEnabled: true,
      pauseApprovalsEnabled: true,
      advancedAuditExportsEnabled: false
    });
  });

  it("keeps legacy pro plan limits unchanged", () => {
    expect(PLAN_ENTITLEMENTS.pro).toMatchObject({
      maxBillableUsers: 25,
      maxAgents: 50,
      maxProtectedRepos: 10,
      monthlyVerifications: 250_000,
      logRetentionDays: 90,
      webhooksEnabled: true,
      managedProfilesEnabled: true,
      requiredManagedProfileModeEnabled: true,
      pauseApprovalsEnabled: true,
      advancedAuditExportsEnabled: false
    });
  });

  it("defines team plan entitlements", () => {
    expect(PLAN_ENTITLEMENTS.team).toEqual({
      maxBillableUsers: 25,
      maxAgents: 25,
      maxProtectedRepos: 10,
      monthlyVerifications: 250_000,
      logRetentionDays: 30,
      webhooksEnabled: true,
      managedProfilesEnabled: true,
      requiredManagedProfileModeEnabled: true,
      pauseApprovalsEnabled: true,
      advancedAuditExportsEnabled: false
    });
  });

  it("defines business plan entitlements", () => {
    expect(PLAN_ENTITLEMENTS.business).toEqual({
      maxBillableUsers: 100,
      maxAgents: 250,
      maxProtectedRepos: 100,
      monthlyVerifications: 2_000_000,
      logRetentionDays: 180,
      webhooksEnabled: true,
      managedProfilesEnabled: true,
      requiredManagedProfileModeEnabled: true,
      pauseApprovalsEnabled: true,
      advancedAuditExportsEnabled: true
    });
  });

  it("treats enterprise numeric limits as unlimited with custom finite retention", () => {
    const enterprise = PLAN_ENTITLEMENTS.enterprise;
    expect(isUnlimitedLimit(enterprise.maxBillableUsers)).toBe(true);
    expect(isUnlimitedLimit(enterprise.maxAgents)).toBe(true);
    expect(isUnlimitedLimit(enterprise.maxProtectedRepos)).toBe(true);
    expect(isUnlimitedLimit(enterprise.monthlyVerifications)).toBe(true);
    // Retention stays finite so retention-window date math remains valid.
    expect(enterprise.logRetentionDays).toBe(365);
    expect(enterprise.webhooksEnabled).toBe(true);
    expect(enterprise.managedProfilesEnabled).toBe(true);
    expect(enterprise.requiredManagedProfileModeEnabled).toBe(true);
    expect(enterprise.pauseApprovalsEnabled).toBe(true);
    expect(enterprise.advancedAuditExportsEnabled).toBe(true);
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
    expect(getVerificationLimit("free")).toBe(10_000);
    expect(getVerificationLimit("team")).toBe(250_000);
    expect(getVerificationLimit("business")).toBe(2_000_000);
    expect(getVerificationLimit("enterprise")).toBe(Infinity);
    expect(getLogRetentionDays("free")).toBe(7);
    expect(getLogRetentionDays("team")).toBe(30);
    expect(getLogRetentionDays("business")).toBe(180);
    expect(getLogRetentionDays(undefined)).toBe(7);
  });

  it("classifies unlimited values and formats limits for display", () => {
    expect(isUnlimitedLimit(Infinity)).toBe(true);
    expect(isUnlimitedLimit(3)).toBe(false);
    // Infinity serializes to null in JSON payloads.
    expect(isUnlimitedLimit(null)).toBe(true);
    expect(isUnlimitedLimit(undefined)).toBe(true);
    expect(formatLimit(Infinity)).toBe("Unlimited");
    expect(formatLimit(null)).toBe("Unlimited");
    expect(formatLimit(10_000)).toBe((10_000).toLocaleString());
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

describe("billable workspace roles", () => {
  it("counts every mutation-capable role as billable and read-only roles as free", () => {
    expect(BILLABLE_WORKSPACE_ROLES).toEqual([
      "OWNER",
      "ENGINEERING_LEAD",
      "SENIOR_ENGINEER",
      "ENGINEER"
    ]);
    expect(isBillableWorkspaceRole("OWNER")).toBe(true);
    expect(isBillableWorkspaceRole("ENGINEER")).toBe(true);
    expect(isBillableWorkspaceRole("VIEWER")).toBe(false);
    expect(isBillableWorkspaceRole("bogus")).toBe(false);
  });

  it("derives billability from authority levels so new roles classify automatically", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(isBillableWorkspaceRole(role)).toBe(
        AUTHORITY_LEVELS[role] > AUTHORITY_LEVELS.VIEWER
      );
    }
  });
});
