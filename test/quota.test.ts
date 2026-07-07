import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountFixture, mockAccountPlan } from "./fixtures";

const quotaMocks = vi.hoisted(() => ({
  accountFindOne: vi.fn(),
  accountUpdateOne: vi.fn(),
  agentCountDocuments: vi.fn()
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

describe("billing and quota enforcement", () => {
  beforeEach(() => {
    quotaMocks.accountFindOne.mockResolvedValue(accountFixture());
    quotaMocks.accountUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    quotaMocks.agentCountDocuments.mockResolvedValue(0);
  });

  it("enforces free and pro agent limits", async () => {
    const { checkAgentLimit } = await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(mockAccountPlan("free"));
    quotaMocks.agentCountDocuments.mockResolvedValue(5);
    await expect(checkAgentLimit("acct_test")).resolves.toEqual({
      allowed: false,
      code: "AGENT_LIMIT_REACHED",
      plan: "free",
      limit: 5,
      reason: "Agent limit of 5 reached on the free plan.",
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
    const { checkAgentLimit, checkAndIncrementVerifications } = await import("@/lib/quota");

    const denied = {
      allowed: false,
      code: "ACCOUNT_CONTEXT_MISSING",
      reason: "Account context is missing for this request, so quota cannot be enforced."
    };
    await expect(checkAndIncrementVerifications(undefined)).resolves.toEqual(denied);
    await expect(checkAndIncrementVerifications(null)).resolves.toEqual(denied);
    await expect(checkAgentLimit(undefined)).resolves.toEqual(denied);
    await expect(checkAgentLimit(null)).resolves.toEqual(denied);
    expect(quotaMocks.accountFindOne).not.toHaveBeenCalled();
    expect(quotaMocks.accountUpdateOne).not.toHaveBeenCalled();
  });

  it("keeps a known accountId without an Account document unmetered", async () => {
    // Accounts are never deleted and every accountId passed to the quota helpers
    // originates from a created Account, so a missing document is a data
    // inconsistency rather than lost auth context. See decision note in lib/quota.ts.
    const { checkAgentLimit, checkAndIncrementVerifications } = await import("@/lib/quota");

    quotaMocks.accountFindOne.mockResolvedValue(null);
    await expect(checkAndIncrementVerifications("acct_missing")).resolves.toEqual({ allowed: true });
    await expect(checkAgentLimit("acct_missing")).resolves.toEqual({ allowed: true });
    expect(quotaMocks.accountUpdateOne).not.toHaveBeenCalled();
    expect(quotaMocks.agentCountDocuments).not.toHaveBeenCalled();
  });

  it("does not grant paid webhook behavior when plan state is missing or invalid", async () => {
    const { checkWebhooksEnabled } = await import("@/lib/quota");

    expect(checkWebhooksEnabled(undefined)).toEqual({
      allowed: false,
      code: "WEBHOOKS_REQUIRE_PRO",
      plan: "free",
      limit: 0,
      reason: "Webhooks require Pro or Enterprise.",
      upgradeHint: "Upgrade to Pro to enable webhook delivery."
    });
    expect(checkWebhooksEnabled("stripe_missing")).toEqual({
      allowed: false,
      code: "WEBHOOKS_REQUIRE_PRO",
      plan: "free",
      limit: 0,
      reason: "Webhooks require Pro or Enterprise.",
      upgradeHint: "Upgrade to Pro to enable webhook delivery."
    });
    expect(checkWebhooksEnabled("pro")).toEqual({ allowed: true });
    expect(checkWebhooksEnabled("enterprise")).toEqual({ allowed: true });
  });
});
