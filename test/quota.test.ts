import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountFixture, mockAccountPlan } from "./fixtures";

const quotaMocks = vi.hoisted(() => ({
  accountFindOne: vi.fn(),
  accountUpdateOne: vi.fn(),
  agentCountDocuments: vi.fn(),
  membershipCountDocuments: vi.fn()
}));

vi.mock("@/models/Account", () => ({
  default: {
    findOne: quotaMocks.accountFindOne,
    updateOne: quotaMocks.accountUpdateOne
  }
}));

vi.mock("@/models/Agent", () => ({
  default: {
    countDocuments: quotaMocks.agentCountDocuments
  }
}));

vi.mock("@/models/AccountMembership", () => ({
  default: {
    countDocuments: quotaMocks.membershipCountDocuments
  }
}));

describe("billing and quota enforcement", () => {
  beforeEach(() => {
    quotaMocks.accountFindOne.mockResolvedValue(accountFixture());
    quotaMocks.accountUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    quotaMocks.agentCountDocuments.mockResolvedValue(0);
    quotaMocks.membershipCountDocuments.mockResolvedValue(0);
  });

  it("enforces free and pro agent limits", async () => {
    const { checkAgentLimit } = await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("free"));
    quotaMocks.agentCountDocuments.mockResolvedValue(3);
    await expect(checkAgentLimit("acct_test")).resolves.toEqual({
      allowed: false,
      code: "AGENT_LIMIT_REACHED",
      plan: "free",
      limit: 3,
      reason: "Agent limit of 3 reached on the free plan.",
      upgradeHint: "Upgrade to Pro to add more agents."
    });

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("pro"));
    quotaMocks.agentCountDocuments.mockResolvedValue(50);
    await expect(checkAgentLimit("acct_test")).resolves.toEqual({
      allowed: false,
      code: "AGENT_LIMIT_REACHED",
      plan: "pro",
      limit: 50,
      reason: "Agent limit of 50 reached on the pro plan.",
      upgradeHint: "Contact BehalfID for Enterprise limits."
    });
  });

  it("enforces team and business agent limits", async () => {
    const { checkAgentLimit } = await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("team"));
    quotaMocks.agentCountDocuments.mockResolvedValue(25);
    await expect(checkAgentLimit("acct_test")).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "AGENT_LIMIT_REACHED", plan: "team", limit: 25 })
    );

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("business"));
    quotaMocks.agentCountDocuments.mockResolvedValue(249);
    await expect(checkAgentLimit("acct_test")).resolves.toEqual({ allowed: true });
    quotaMocks.agentCountDocuments.mockResolvedValue(250);
    await expect(checkAgentLimit("acct_test")).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "AGENT_LIMIT_REACHED", plan: "business", limit: 250 })
    );
  });

  it("treats enterprise agent and verification quotas as unlimited", async () => {
    const { checkAgentLimit, checkAndIncrementVerifications } = await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("enterprise", {
      verificationCount: Number.MAX_SAFE_INTEGER
    }));
    quotaMocks.agentCountDocuments.mockResolvedValue(Number.MAX_SAFE_INTEGER);

    await expect(checkAgentLimit("acct_test")).resolves.toEqual({ allowed: true });
    await expect(checkAndIncrementVerifications("acct_test")).resolves.toEqual({ allowed: true });
    expect(quotaMocks.accountUpdateOne).not.toHaveBeenCalled();
  });

  it("enforces free and pro monthly verification limits", async () => {
    const { checkAndIncrementVerifications } = await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("free", { verificationCount: 10_000 }));
    await expect(checkAndIncrementVerifications("acct_test")).resolves.toEqual({
      allowed: false,
      code: "VERIFICATION_LIMIT_REACHED",
      plan: "free",
      limit: 10_000,
      reason: "Monthly verification limit of 10,000 reached on the free plan.",
      upgradeHint: "Upgrade to Pro to continue."
    });

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("pro", { verificationCount: 250_000 }));
    await expect(checkAndIncrementVerifications("acct_test")).resolves.toEqual({
      allowed: false,
      code: "VERIFICATION_LIMIT_REACHED",
      plan: "pro",
      limit: 250_000,
      reason: "Monthly verification limit of 250,000 reached on the pro plan.",
      upgradeHint: "Contact BehalfID for Enterprise limits."
    });
  });

  it("enforces team and business monthly verification limits", async () => {
    const { checkAndIncrementVerifications } = await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("team", { verificationCount: 250_000 }));
    await expect(checkAndIncrementVerifications("acct_test")).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "VERIFICATION_LIMIT_REACHED", plan: "team", limit: 250_000 })
    );

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("business", { verificationCount: 2_000_000 }));
    await expect(checkAndIncrementVerifications("acct_test")).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "VERIFICATION_LIMIT_REACHED", plan: "business", limit: 2_000_000 })
    );
  });

  it("increments allowed verifications and resets stale billing periods", async () => {
    const { checkAndIncrementVerifications } = await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(accountFixture({ verificationCount: 42 }));
    await expect(checkAndIncrementVerifications("acct_test")).resolves.toEqual({ allowed: true });
    expect(quotaMocks.accountUpdateOne).toHaveBeenCalledWith(
      { accountId: "acct_test" },
      { $inc: { verificationCount: 1 } }
    );

    quotaMocks.accountUpdateOne.mockClear();
    quotaMocks.accountFindOne.mockResolvedValue(accountFixture({
      verificationCount: 10_000,
      verificationPeriodStart: new Date("2024-01-01T00:00:00.000Z")
    }));
    await expect(checkAndIncrementVerifications("acct_test")).resolves.toEqual({ allowed: true });
    expect(quotaMocks.accountUpdateOne).toHaveBeenCalledWith(
      { accountId: "acct_test" },
      expect.objectContaining({ $set: expect.objectContaining({ verificationCount: 1 }) })
    );
  });

  it("fails closed when accountId is missing on metered quota checks (issue #77)", async () => {
    const { checkAgentLimit, checkAndIncrementVerifications, checkProtectedRepoLimit, checkSeatLimit } =
      await import("@/lib/quota");

    const denied = {
      allowed: false,
      code: "ACCOUNT_CONTEXT_MISSING",
      reason: "Account context is missing for this request, so quota cannot be enforced."
    };
    await expect(checkAndIncrementVerifications(undefined)).resolves.toEqual(denied);
    await expect(checkAndIncrementVerifications(null)).resolves.toEqual(denied);
    await expect(checkAgentLimit(undefined)).resolves.toEqual(denied);
    await expect(checkAgentLimit(null)).resolves.toEqual(denied);
    await expect(checkSeatLimit(undefined, "ENGINEER")).resolves.toEqual(denied);
    await expect(
      checkProtectedRepoLimit(undefined, { currentCount: 0, nextCount: 1 })
    ).resolves.toEqual(denied);
    expect(quotaMocks.accountFindOne).not.toHaveBeenCalled();
    expect(quotaMocks.accountUpdateOne).not.toHaveBeenCalled();
  });

  it("keeps a known accountId without an Account document unmetered", async () => {
    // Accounts are never deleted and every accountId passed to the quota helpers
    // originates from a created Account, so a missing document is a data
    // inconsistency rather than lost auth context. See decision note in lib/quota.ts.
    const { checkAgentLimit, checkAndIncrementVerifications, checkProtectedRepoLimit, checkSeatLimit } =
      await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(null);
    await expect(checkAndIncrementVerifications("acct_missing")).resolves.toEqual({ allowed: true });
    await expect(checkAgentLimit("acct_missing")).resolves.toEqual({ allowed: true });
    await expect(checkSeatLimit("acct_missing", "ENGINEER")).resolves.toEqual({ allowed: true });
    await expect(
      checkProtectedRepoLimit("acct_missing", { currentCount: 0, nextCount: 1 })
    ).resolves.toEqual({ allowed: true });
    expect(quotaMocks.accountUpdateOne).not.toHaveBeenCalled();
    expect(quotaMocks.agentCountDocuments).not.toHaveBeenCalled();
    expect(quotaMocks.membershipCountDocuments).not.toHaveBeenCalled();
  });

  it("does not grant paid webhook behavior when plan state is missing or invalid", async () => {
    const { checkWebhooksEnabled } = await import("@/lib/quota");

    expect(checkWebhooksEnabled(undefined)).toEqual({
      allowed: false,
      code: "WEBHOOKS_REQUIRE_PRO",
      plan: "free",
      limit: 0,
      reason: "Webhooks require a paid plan.",
      upgradeHint: "Upgrade to Pro to enable webhook delivery."
    });
    expect(checkWebhooksEnabled("stripe_missing")).toEqual({
      allowed: false,
      code: "WEBHOOKS_REQUIRE_PRO",
      plan: "free",
      limit: 0,
      reason: "Webhooks require a paid plan.",
      upgradeHint: "Upgrade to Pro to enable webhook delivery."
    });
    expect(checkWebhooksEnabled("pro")).toEqual({ allowed: true });
    expect(checkWebhooksEnabled("team")).toEqual({ allowed: true });
    expect(checkWebhooksEnabled("business")).toEqual({ allowed: true });
    expect(checkWebhooksEnabled("enterprise")).toEqual({ allowed: true });
  });
});

describe("billable seat limits", () => {
  beforeEach(() => {
    quotaMocks.accountFindOne.mockResolvedValue(accountFixture());
    quotaMocks.membershipCountDocuments.mockResolvedValue(0);
  });

  it("counts only billable roles as seats", async () => {
    const { countBillableSeats } = await import("@/lib/quota");
    quotaMocks.membershipCountDocuments.mockResolvedValue(4);
    await expect(countBillableSeats("acct_test")).resolves.toBe(4);
    expect(quotaMocks.membershipCountDocuments).toHaveBeenCalledWith({
      accountId: "acct_test",
      role: { $in: ["OWNER", "ENGINEERING_LEAD", "SENIOR_ENGINEER", "ENGINEER"] }
    });
  });

  it("blocks adding a billable member when the free seat limit is reached", async () => {
    const { checkSeatLimit } = await import("@/lib/quota");
    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("free"));
    quotaMocks.membershipCountDocuments.mockResolvedValue(1);
    await expect(checkSeatLimit("acct_test", "ENGINEER")).resolves.toEqual({
      allowed: false,
      code: "SEAT_LIMIT_REACHED",
      plan: "free",
      limit: 1,
      reason: "Billable seat limit of 1 reached on the free plan.",
      upgradeHint: "Upgrade to Pro to add more billable seats."
    });
  });

  it("never blocks non-billable (viewer) roles", async () => {
    const { checkSeatLimit } = await import("@/lib/quota");
    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("free"));
    quotaMocks.membershipCountDocuments.mockResolvedValue(999);
    await expect(checkSeatLimit("acct_test", "VIEWER")).resolves.toEqual({ allowed: true });
    expect(quotaMocks.accountFindOne).not.toHaveBeenCalled();
  });

  it("enforces team and business seat limits and allows below them", async () => {
    const { checkSeatLimit } = await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("team"));
    quotaMocks.membershipCountDocuments.mockResolvedValue(24);
    await expect(checkSeatLimit("acct_test", "ENGINEER")).resolves.toEqual({ allowed: true });
    quotaMocks.membershipCountDocuments.mockResolvedValue(25);
    await expect(checkSeatLimit("acct_test", "ENGINEER")).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "SEAT_LIMIT_REACHED", plan: "team", limit: 25 })
    );

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("business"));
    quotaMocks.membershipCountDocuments.mockResolvedValue(100);
    await expect(checkSeatLimit("acct_test", "OWNER")).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "SEAT_LIMIT_REACHED", plan: "business", limit: 100 })
    );
  });

  it("treats enterprise seats as unlimited", async () => {
    const { checkSeatLimit } = await import("@/lib/quota");
    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("enterprise"));
    quotaMocks.membershipCountDocuments.mockResolvedValue(Number.MAX_SAFE_INTEGER);
    await expect(checkSeatLimit("acct_test", "ENGINEER")).resolves.toEqual({ allowed: true });
    expect(quotaMocks.membershipCountDocuments).not.toHaveBeenCalled();
  });
});

describe("protected repo limits", () => {
  beforeEach(() => {
    quotaMocks.accountFindOne.mockResolvedValue(accountFixture());
  });

  it("blocks protected repo growth beyond the free limit", async () => {
    const { checkProtectedRepoLimit } = await import("@/lib/quota");
    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("free"));
    await expect(
      checkProtectedRepoLimit("acct_test", { currentCount: 1, nextCount: 2 })
    ).resolves.toEqual({
      allowed: false,
      code: "PROTECTED_REPO_LIMIT_REACHED",
      plan: "free",
      limit: 1,
      reason: "Protected repo limit of 1 reached on the free plan.",
      upgradeHint: "Upgrade to Pro to protect more repositories."
    });
  });

  it("never blocks saving or shrinking an existing over-limit policy", async () => {
    const { checkProtectedRepoLimit } = await import("@/lib/quota");
    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("free"));
    // Unchanged over-limit count: allowed, and no account lookup is needed.
    await expect(
      checkProtectedRepoLimit("acct_test", { currentCount: 5, nextCount: 5 })
    ).resolves.toEqual({ allowed: true });
    await expect(
      checkProtectedRepoLimit("acct_test", { currentCount: 5, nextCount: 2 })
    ).resolves.toEqual({ allowed: true });
    expect(quotaMocks.accountFindOne).not.toHaveBeenCalled();
  });

  it("enforces pro/team/business limits and keeps enterprise unlimited", async () => {
    const { checkProtectedRepoLimit } = await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("pro"));
    await expect(
      checkProtectedRepoLimit("acct_test", { currentCount: 9, nextCount: 10 })
    ).resolves.toEqual({ allowed: true });
    await expect(
      checkProtectedRepoLimit("acct_test", { currentCount: 10, nextCount: 11 })
    ).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "PROTECTED_REPO_LIMIT_REACHED", limit: 10 })
    );

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("business"));
    await expect(
      checkProtectedRepoLimit("acct_test", { currentCount: 100, nextCount: 101 })
    ).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "PROTECTED_REPO_LIMIT_REACHED", limit: 100 })
    );

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("enterprise"));
    await expect(
      checkProtectedRepoLimit("acct_test", { currentCount: 10_000, nextCount: 10_001 })
    ).resolves.toEqual({ allowed: true });
  });
});

describe("managed profile feature gates", () => {
  it("allows managed profiles and required mode on every current plan", async () => {
    const { checkManagedProfilesEnabled, checkRequiredManagedProfileMode } = await import("@/lib/quota");
    for (const plan of ["free", "pro", "team", "business", "enterprise", undefined, "bogus"]) {
      expect(checkManagedProfilesEnabled(plan)).toEqual({ allowed: true });
      expect(checkRequiredManagedProfileMode(plan)).toEqual({ allowed: true });
    }
  });
});
