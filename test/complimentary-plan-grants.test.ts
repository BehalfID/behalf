/**
 * The grant/revoke service: validation, ledger ordering, and the audit record.
 *
 * The ordering assertions are the point of the file. There is no cross-backend
 * transaction here, so one write has to go first; the ledger does, because a
 * recorded-but-unapplied change is discoverable while an applied-but-unrecorded
 * entitlement change is not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const repoMocks = vi.hoisted(() => ({
  findAccountById: vi.fn(),
  setComplimentaryPlan: vi.fn(),
  clearComplimentaryPlan: vi.fn(),
  createAccountPlanGrant: vi.fn(),
  listAccountPlanGrants: vi.fn()
}));

vi.mock("@/lib/repositories/accounts", () => repoMocks);

const FREE_ACCOUNT = {
  accountId: "acct_jason",
  name: "Floofscape Solutions",
  plan: "free",
  complimentaryPlan: null,
  complimentaryPlanExpiresAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null
};

/** Call order across both mocks, so ledger-before-apply is actually observable. */
function callOrder() {
  const order: string[] = [];
  for (const [name, mock] of [
    ["ledger", repoMocks.createAccountPlanGrant],
    ["set", repoMocks.setComplimentaryPlan],
    ["clear", repoMocks.clearComplimentaryPlan]
  ] as const) {
    for (const result of mock.mock.results) void result;
    for (let i = 0; i < mock.mock.invocationCallOrder.length; i += 1) {
      order.push(`${mock.mock.invocationCallOrder[i]}:${name}`);
    }
  }
  return order.sort((a, b) => Number(a.split(":")[0]) - Number(b.split(":")[0])).map((entry) => entry.split(":")[1]);
}

describe("grantComplimentaryPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMocks.findAccountById.mockResolvedValue({ ...FREE_ACCOUNT });
    repoMocks.createAccountPlanGrant.mockResolvedValue({});
    repoMocks.setComplimentaryPlan.mockResolvedValue({ matchedCount: 1 });
    repoMocks.clearComplimentaryPlan.mockResolvedValue({ matchedCount: 1 });
    repoMocks.listAccountPlanGrants.mockResolvedValue([]);
  });

  it("records the ledger entry before changing account state", async () => {
    const { grantComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    await grantComplimentaryPlan({
      accountId: "acct_jason",
      plan: "pro",
      reason: "Lifetime early-tester grant",
      expiresAt: null,
      actor: "founder",
      actorType: "operator_script"
    });

    expect(callOrder()).toEqual(["ledger", "set"]);
  });

  it("writes an audit entry naming the plan, authority and billing state", async () => {
    const { grantComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    const change = await grantComplimentaryPlan({
      accountId: "acct_jason",
      plan: "pro",
      reason: "Lifetime early-tester grant",
      expiresAt: null,
      actor: "founder",
      actorType: "operator_script"
    });

    expect(repoMocks.createAccountPlanGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct_jason",
        action: "grant",
        plan: "pro",
        previousPlan: null,
        // Captured so a comp can be told apart from a paid upgrade later.
        billingPlanAtChange: "free",
        reason: "Lifetime early-tester grant",
        expiresAt: null,
        actor: "founder",
        actorType: "operator_script"
      })
    );
    expect(change.grantId).toMatch(/^cgrant_/);
    expect(change.effectivePlanBefore).toBe("free");
    expect(change.effectivePlanAfter).toBe("pro");
  });

  it("writes only the complimentary fields, never plan or Stripe columns", async () => {
    const { grantComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    await grantComplimentaryPlan({
      accountId: "acct_jason",
      plan: "pro",
      reason: "Lifetime early-tester grant",
      expiresAt: null,
      actor: "founder",
      actorType: "operator_script"
    });

    const [, assignment] = repoMocks.setComplimentaryPlan.mock.calls[0];
    expect(Object.keys(assignment).sort()).toEqual([
      "expiresAt",
      "grantedAt",
      "grantedBy",
      "plan",
      "reason"
    ]);
  });

  it("carries the previous grant into the ledger when re-granting", async () => {
    repoMocks.findAccountById.mockResolvedValue({
      ...FREE_ACCOUNT,
      complimentaryPlan: "pro"
    });
    const { grantComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    await grantComplimentaryPlan({
      accountId: "acct_jason",
      plan: "business",
      reason: "Upgraded early-tester grant",
      expiresAt: null,
      actor: "founder",
      actorType: "operator_script"
    });

    expect(repoMocks.createAccountPlanGrant).toHaveBeenCalledWith(
      expect.objectContaining({ previousPlan: "pro", plan: "business" })
    );
  });

  it("reports when a granted tier would rate lower than billing (informational)", async () => {
    repoMocks.findAccountById.mockResolvedValue({ ...FREE_ACCOUNT, plan: "pro" });
    const { grantComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    const change = await grantComplimentaryPlan({
      accountId: "acct_jason",
      plan: "team",
      reason: "Team pilot",
      expiresAt: null,
      actor: "founder",
      actorType: "operator_script"
    });

    // Current ladder is monotonic: team does not regress any pro field.
    expect(change.regressionsVersusBilling).toEqual([]);
    expect(change.effectivePlanAfter).toBe("team");
  });

  it("refuses a grant with no reason", async () => {
    const { grantComplimentaryPlan, ComplimentaryPlanError } = await import(
      "@/lib/complimentaryPlans"
    );

    await expect(
      grantComplimentaryPlan({
        accountId: "acct_jason",
        plan: "pro",
        reason: "   ",
        actor: "founder",
        actorType: "operator_script"
      })
    ).rejects.toBeInstanceOf(ComplimentaryPlanError);
    expect(repoMocks.createAccountPlanGrant).not.toHaveBeenCalled();
    expect(repoMocks.setComplimentaryPlan).not.toHaveBeenCalled();
  });

  it("refuses a grant with no actor", async () => {
    const { grantComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    await expect(
      grantComplimentaryPlan({
        accountId: "acct_jason",
        plan: "pro",
        reason: "Early tester",
        actor: "",
        actorType: "operator_script"
      })
    ).rejects.toThrow(/actor is required/i);
    expect(repoMocks.setComplimentaryPlan).not.toHaveBeenCalled();
  });

  it("refuses a plan that is not grantable", async () => {
    const { grantComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    await expect(
      grantComplimentaryPlan({
        accountId: "acct_jason",
        plan: "free" as never,
        reason: "Early tester",
        actor: "founder",
        actorType: "operator_script"
      })
    ).rejects.toThrow(/pro, team, business, enterprise/);
  });

  it("refuses an expiry that has already passed", async () => {
    const { grantComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    await expect(
      grantComplimentaryPlan({
        accountId: "acct_jason",
        plan: "pro",
        reason: "Early tester",
        expiresAt: new Date(Date.now() - 60_000),
        actor: "founder",
        actorType: "operator_script"
      })
    ).rejects.toThrow(/future/);
    expect(repoMocks.createAccountPlanGrant).not.toHaveBeenCalled();
  });

  it("refuses an unknown account without writing anything", async () => {
    repoMocks.findAccountById.mockResolvedValue(null);
    const { grantComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    await expect(
      grantComplimentaryPlan({
        accountId: "acct_missing",
        plan: "pro",
        reason: "Early tester",
        expiresAt: null,
        actor: "founder",
        actorType: "operator_script"
      })
    ).rejects.toThrow(/Account not found/);
    expect(repoMocks.createAccountPlanGrant).not.toHaveBeenCalled();
  });

  it("reports the ledger entry when the state change fails", async () => {
    repoMocks.setComplimentaryPlan.mockRejectedValue(new Error("connection reset"));
    const { grantComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    await expect(
      grantComplimentaryPlan({
        accountId: "acct_jason",
        plan: "pro",
        reason: "Early tester",
        expiresAt: null,
        actor: "founder",
        actorType: "operator_script"
      })
    ).rejects.toThrow(/was recorded but the account update failed/);
  });
});

describe("revokeComplimentaryPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMocks.findAccountById.mockResolvedValue({
      ...FREE_ACCOUNT,
      complimentaryPlan: "pro"
    });
    repoMocks.createAccountPlanGrant.mockResolvedValue({});
    repoMocks.clearComplimentaryPlan.mockResolvedValue({ matchedCount: 1 });
    repoMocks.listAccountPlanGrants.mockResolvedValue([]);
  });

  it("records the revocation before clearing state", async () => {
    const { revokeComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    const change = await revokeComplimentaryPlan({
      accountId: "acct_jason",
      reason: "Converted to a paid subscription",
      actor: "founder",
      actorType: "operator_script"
    });

    expect(callOrder()).toEqual(["ledger", "clear"]);
    expect(repoMocks.createAccountPlanGrant).toHaveBeenCalledWith(
      expect.objectContaining({ action: "revoke", plan: null, previousPlan: "pro" })
    );
    expect(change.effectivePlanBefore).toBe("pro");
    expect(change.effectivePlanAfter).toBe("free");
  });

  it("refuses when there is nothing to revoke", async () => {
    repoMocks.findAccountById.mockResolvedValue({ ...FREE_ACCOUNT });
    const { revokeComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    await expect(
      revokeComplimentaryPlan({
        accountId: "acct_jason",
        reason: "Cleanup",
        actor: "founder",
        actorType: "operator_script"
      })
    ).rejects.toThrow(/no complimentary plan to revoke/);
    expect(repoMocks.clearComplimentaryPlan).not.toHaveBeenCalled();
  });

  it("revokes an expired grant, which is still stored state", async () => {
    repoMocks.findAccountById.mockResolvedValue({
      ...FREE_ACCOUNT,
      complimentaryPlan: "pro",
      complimentaryPlanExpiresAt: new Date(Date.now() - 86_400_000)
    });
    const { revokeComplimentaryPlan } = await import("@/lib/complimentaryPlans");

    await expect(
      revokeComplimentaryPlan({
        accountId: "acct_jason",
        reason: "Tidy up an expired grant",
        actor: "founder",
        actorType: "operator_script"
      })
    ).resolves.toMatchObject({ action: "revoke", previousPlan: "pro" });
  });
});

describe("getComplimentaryPlanStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMocks.createAccountPlanGrant.mockResolvedValue({});
  });

  it("flags a ledger entry that was never applied", async () => {
    repoMocks.findAccountById.mockResolvedValue({ ...FREE_ACCOUNT });
    repoMocks.listAccountPlanGrants.mockResolvedValue([
      {
        grantId: "cgrant_1",
        action: "grant",
        plan: "pro",
        previousPlan: null,
        billingPlanAtChange: "free",
        reason: "Early tester",
        expiresAt: null,
        actor: "founder",
        actorType: "operator_script",
        createdAt: new Date("2026-08-01T00:00:00Z")
      }
    ]);
    const { getComplimentaryPlanStatus } = await import("@/lib/complimentaryPlans");

    const status = await getComplimentaryPlanStatus("acct_jason");

    expect(status.ledgerMismatch).toBe(true);
    expect(status.effectivePlan).toBe("free");
  });

  it("reports no mismatch when the ledger and state agree", async () => {
    repoMocks.findAccountById.mockResolvedValue({
      ...FREE_ACCOUNT,
      complimentaryPlan: "pro"
    });
    repoMocks.listAccountPlanGrants.mockResolvedValue([
      {
        grantId: "cgrant_1",
        action: "grant",
        plan: "pro",
        previousPlan: null,
        billingPlanAtChange: "free",
        reason: "Early tester",
        expiresAt: null,
        actor: "founder",
        actorType: "operator_script",
        createdAt: new Date("2026-08-01T00:00:00Z")
      }
    ]);
    const { getComplimentaryPlanStatus } = await import("@/lib/complimentaryPlans");

    const status = await getComplimentaryPlanStatus("acct_jason");

    expect(status.ledgerMismatch).toBe(false);
    expect(status.effectivePlan).toBe("pro");
    expect(status.billingPlan).toBe("free");
    expect(status.grant).toMatchObject({ plan: "pro", expired: false });
  });

  it("reports no mismatch for a revocation that cleared state", async () => {
    repoMocks.findAccountById.mockResolvedValue({ ...FREE_ACCOUNT });
    repoMocks.listAccountPlanGrants.mockResolvedValue([
      {
        grantId: "cgrant_2",
        action: "revoke",
        plan: null,
        previousPlan: "pro",
        billingPlanAtChange: "free",
        reason: "Converted",
        expiresAt: null,
        actor: "founder",
        actorType: "operator_script",
        createdAt: new Date("2026-08-02T00:00:00Z")
      }
    ]);
    const { getComplimentaryPlanStatus } = await import("@/lib/complimentaryPlans");

    expect((await getComplimentaryPlanStatus("acct_jason")).ledgerMismatch).toBe(false);
  });
});

describe("the operator tool argument parser", () => {
  it("requires an explicit expiry decision on grant", async () => {
    const { parseComplimentaryPlanArgs } = await import("../scripts/complimentary-plan-helpers");

    // Silence would mean "lifetime", which is too consequential to be a default.
    expect(() =>
      parseComplimentaryPlanArgs([
        "grant",
        "--account-id",
        "acct_x",
        "--plan",
        "pro",
        "--reason",
        "Early tester",
        "--confirm"
      ])
    ).toThrow(/--expires is required/);
  });

  it("requires a reason and a mode", async () => {
    const { parseComplimentaryPlanArgs } = await import("../scripts/complimentary-plan-helpers");
    const base = ["grant", "--account-id", "acct_x", "--plan", "pro", "--expires", "lifetime"];

    expect(() => parseComplimentaryPlanArgs([...base, "--confirm"])).toThrow(/--reason is required/);
    expect(() => parseComplimentaryPlanArgs([...base, "--reason", "r"])).toThrow(/one mode/);
    expect(() =>
      parseComplimentaryPlanArgs([...base, "--reason", "r", "--dry-run", "--confirm"])
    ).toThrow(/not both/);
  });

  it("parses lifetime and dated expiries", async () => {
    const { parseComplimentaryPlanArgs, parseExpiry } = await import(
      "../scripts/complimentary-plan-helpers"
    );

    expect(parseExpiry("lifetime")).toBeNull();
    expect(parseExpiry("never")).toBeNull();
    // A date-only value is read as UTC midnight, not the server's timezone.
    expect(parseExpiry("2027-01-01")?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(() => parseExpiry("soon")).toThrow(/ISO-8601/);

    const args = parseComplimentaryPlanArgs([
      "grant",
      "--account-id",
      "acct_kJAmZTy2SizQdbXZ",
      "--plan",
      "pro",
      "--reason",
      "Lifetime early-tester grant",
      "--expires",
      "lifetime",
      "--dry-run"
    ]);
    expect(args).toMatchObject({
      command: "grant",
      accountId: "acct_kJAmZTy2SizQdbXZ",
      plan: "pro",
      expiresAt: null,
      dryRun: true,
      confirm: false
    });
  });

  it("rejects an ungrantable plan and a malformed account id", async () => {
    const { parseComplimentaryPlanArgs } = await import("../scripts/complimentary-plan-helpers");

    expect(() =>
      parseComplimentaryPlanArgs(["status", "--account-id", "acct_x", "--plan", "free"])
    ).toThrow(/--plan must be one of/);
    expect(() => parseComplimentaryPlanArgs(["status", "--account-id", "nope"])).toThrow(
      /must match acct_/
    );
    expect(() => parseComplimentaryPlanArgs(["delete", "--account-id", "acct_x"])).toThrow(
      /status, grant, revoke/
    );
  });

  it("does not accept a plan for revoke", async () => {
    const { parseComplimentaryPlanArgs } = await import("../scripts/complimentary-plan-helpers");

    expect(() =>
      parseComplimentaryPlanArgs([
        "revoke",
        "--account-id",
        "acct_x",
        "--plan",
        "pro",
        "--reason",
        "r",
        "--confirm"
      ])
    ).toThrow(/not valid for revoke/);
  });
});
