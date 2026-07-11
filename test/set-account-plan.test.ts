import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PLAN_OVERRIDE_REFUSAL_REASON,
  accountIsStripeLinked,
  buildPlanUpdate,
  canRunAccountPlanOverride,
  createAuditEntry,
  formatAuditEntry,
  isManualAssignablePlan,
  isValidAccountId,
  parseSetAccountPlanArgs,
  STRIPE_LINKED_CONFIRM_REFUSAL,
  STRIPE_WEBHOOK_OVERWRITE_WARNING,
  validatePlanChange
} from "@/scripts/set-account-plan-helpers";

const baseAccount = {
  accountId: "acct_test123",
  name: "Trajectus Pilot",
  plan: "free",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripeSubscriptionStatus: null
};

const stripeLinkedAccount = {
  ...baseAccount,
  stripeCustomerId: "cus_123",
  stripeSubscriptionId: "sub_123",
  stripeSubscriptionStatus: "active"
};

describe("set-account-plan argument parsing", () => {
  it("parses dry-run mode", () => {
    expect(
      parseSetAccountPlanArgs(["--account-id", "acct_test123", "--plan", "enterprise", "--dry-run"])
    ).toEqual({
      accountId: "acct_test123",
      plan: "enterprise",
      dryRun: true,
      confirm: false,
      force: false
    });
  });

  it("parses confirm mode with force", () => {
    expect(
      parseSetAccountPlanArgs([
        "--account-id",
        "acct_test123",
        "--plan",
        "team",
        "--confirm",
        "--force"
      ])
    ).toEqual({
      accountId: "acct_test123",
      plan: "team",
      dryRun: false,
      confirm: true,
      force: true
    });
  });

  it("rejects invalid plans, account ids, and force with dry-run", () => {
    expect(() =>
      parseSetAccountPlanArgs(["--account-id", "acct_test123", "--plan", "pro", "--dry-run"])
    ).toThrow(/must be one of/);

    expect(() =>
      parseSetAccountPlanArgs(["--account-id", "bad_id", "--plan", "enterprise", "--dry-run"])
    ).toThrow(/must match acct_/);

    expect(() =>
      parseSetAccountPlanArgs(["--account-id", "acct_test123", "--plan", "enterprise"])
    ).toThrow(/Specify one mode/);

    expect(() =>
      parseSetAccountPlanArgs([
        "--account-id",
        "acct_test123",
        "--plan",
        "enterprise",
        "--dry-run",
        "--force"
      ])
    ).toThrow(/--force can only be used with --confirm/);
  });
});

describe("set-account-plan safety guards", () => {
  it("recognizes manual assignable plans and stripe linkage", () => {
    expect(isManualAssignablePlan("enterprise")).toBe(true);
    expect(isManualAssignablePlan("pro")).toBe(false);
    expect(isValidAccountId("acct_abc123")).toBe(true);
    expect(accountIsStripeLinked(stripeLinkedAccount)).toBe(true);
    expect(accountIsStripeLinked(baseAccount)).toBe(false);
  });

  it("refuses production-looking databases without override", () => {
    const result = canRunAccountPlanOverride({
      MONGODB_URI: "mongodb+srv://cluster.example.net/behalf-production"
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(ACCOUNT_PLAN_OVERRIDE_REFUSAL_REASON);
  });

  it("allows non-production databases", () => {
    expect(
      canRunAccountPlanOverride({
        MONGODB_URI: "mongodb://127.0.0.1:27017/behalf-staging"
      }).allowed
    ).toBe(true);
  });
});

describe("set-account-plan stripe-linked behavior", () => {
  it("rejects confirm on stripe-linked accounts without force", () => {
    const args = parseSetAccountPlanArgs([
      "--account-id",
      "acct_test123",
      "--plan",
      "enterprise",
      "--confirm"
    ]);

    expect(validatePlanChange(stripeLinkedAccount, args)).toEqual({
      ok: false,
      reason: STRIPE_LINKED_CONFIRM_REFUSAL
    });
  });

  it("allows confirm with force while only updating the plan field", () => {
    const args = parseSetAccountPlanArgs([
      "--account-id",
      "acct_test123",
      "--plan",
      "enterprise",
      "--confirm",
      "--force"
    ]);

    expect(validatePlanChange(stripeLinkedAccount, args)).toEqual({ ok: true });
    expect(buildPlanUpdate(args.plan)).toEqual({ plan: "enterprise" });
    expect(Object.keys(buildPlanUpdate(args.plan))).toEqual(["plan"]);
  });

  it("does not expose any stripe-clearing update path", () => {
    const update = buildPlanUpdate("enterprise");
    expect(update).not.toHaveProperty("stripeCustomerId");
    expect(update).not.toHaveProperty("stripeSubscriptionId");
    expect(update).not.toHaveProperty("stripeSubscriptionStatus");
    expect(update).not.toHaveProperty("stripeTrialEnd");
    expect(update).not.toHaveProperty("stripeCurrentPeriodEnd");
  });

  it("reports stripe conflict on dry-run without requiring force", () => {
    const args = parseSetAccountPlanArgs([
      "--account-id",
      "acct_test123",
      "--plan",
      "enterprise",
      "--dry-run"
    ]);

    expect(validatePlanChange(stripeLinkedAccount, args)).toEqual({ ok: true });
    const audit = createAuditEntry({
      args,
      account: stripeLinkedAccount,
      applied: false
    });
    const formatted = formatAuditEntry(audit, "ops@behalfid.internal");
    expect(formatted).toContain("stripeLinked: yes");
    expect(formatted).toContain(STRIPE_WEBHOOK_OVERWRITE_WARNING);
    expect(formatted).toContain("Confirm without --force will be refused");
    expect(formatted).toContain("applied: no");
  });

  it("formats forced confirm audit output with webhook overwrite warning", () => {
    const args = parseSetAccountPlanArgs([
      "--account-id",
      "acct_test123",
      "--plan",
      "enterprise",
      "--confirm",
      "--force"
    ]);
    const audit = createAuditEntry({
      args,
      account: stripeLinkedAccount,
      applied: true
    });
    const formatted = formatAuditEntry(audit, "ops@behalfid.internal");
    expect(formatted).toContain("forced: yes");
    expect(formatted).toContain(STRIPE_WEBHOOK_OVERWRITE_WARNING);
    expect(formatted).toContain("applied: yes");
  });
});

describe("set-account-plan audit output", () => {
  it("formats a dry-run audit entry for non-stripe accounts", () => {
    const args = parseSetAccountPlanArgs([
      "--account-id",
      "acct_test123",
      "--plan",
      "enterprise",
      "--dry-run"
    ]);
    const audit = createAuditEntry({
      args,
      account: baseAccount,
      applied: false
    });

    const formatted = formatAuditEntry(audit, "ops@behalfid.internal");
    expect(formatted).toContain("mode: dry-run");
    expect(formatted).toContain("accountId: acct_test123");
    expect(formatted).toContain("nextPlan: enterprise");
    expect(formatted).toContain("stripeLinked: no");
    expect(formatted).toContain("applied: no");
    expect(formatted).not.toContain(STRIPE_WEBHOOK_OVERWRITE_WARNING);
  });
});
