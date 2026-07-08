import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountFindOne: vi.fn(),
  accountUpdateOne: vi.fn(),
  agentCountDocuments: vi.fn(),
  membershipCountDocuments: vi.fn(),
  policyFindOne: vi.fn(),
  policyFindOneAndUpdate: vi.fn(),
  inviteFindOneAndUpdate: vi.fn()
}));

vi.mock("@/models/Account", () => ({
  default: {
    findOne: mocks.accountFindOne,
    updateOne: mocks.accountUpdateOne
  }
}));

vi.mock("@/models/Agent", () => ({
  default: {
    countDocuments: mocks.agentCountDocuments
  }
}));

vi.mock("@/models/AccountMembership", () => ({
  default: {
    countDocuments: mocks.membershipCountDocuments
  }
}));

vi.mock("@/models/ManagedProfilePolicy", () => ({
  default: {
    findOne: mocks.policyFindOne,
    findOneAndUpdate: mocks.policyFindOneAndUpdate
  }
}));

vi.mock("@/models/AccountInvite", () => ({
  default: {
    findOneAndUpdate: mocks.inviteFindOneAndUpdate
  }
}));

describe("repository boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accountFindOne.mockResolvedValue({ accountId: "acct_test", plan: "free" });
    mocks.agentCountDocuments.mockResolvedValue(2);
    mocks.membershipCountDocuments.mockResolvedValue(1);
    mocks.policyFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ protectedRepos: [{ repoHash: "abc" }] })
      }),
      lean: vi.fn().mockResolvedValue(null)
    });
    mocks.policyFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ policyId: "pprf_test", accountId: "acct_test" })
    });
    mocks.inviteFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ inviteId: "inv_test", email: "a@b.com", role: "ENGINEER", invitedBy: "user_1" })
    });
  });

  it("findAccountById delegates to Account.findOne", async () => {
    const { findAccountById } = await import("@/lib/repositories/accounts");
    await findAccountById("acct_test");
    expect(mocks.accountFindOne).toHaveBeenCalledWith({ accountId: "acct_test" });
  });

  it("countAgentsByAccountId delegates to Agent.countDocuments", async () => {
    const { countAgentsByAccountId } = await import("@/lib/repositories/agents");
    await expect(countAgentsByAccountId("acct_test")).resolves.toBe(2);
    expect(mocks.agentCountDocuments).toHaveBeenCalledWith({ accountId: "acct_test" });
  });

  it("countBillableSeatsByAccountId delegates to AccountMembership.countDocuments", async () => {
    const { countBillableSeatsByAccountId } = await import("@/lib/repositories/memberships");
    await expect(countBillableSeatsByAccountId("acct_test")).resolves.toBe(1);
    expect(mocks.membershipCountDocuments).toHaveBeenCalledWith({
      accountId: "acct_test",
      role: { $in: expect.arrayContaining(["OWNER", "ENGINEER"]) }
    });
  });

  it("countProtectedReposByAccountId reads protectedRepos length", async () => {
    const { countProtectedReposByAccountId } = await import("@/lib/repositories/managedProfiles");
    await expect(countProtectedReposByAccountId("acct_test")).resolves.toBe(1);
    expect(mocks.policyFindOne).toHaveBeenCalledWith({ accountId: "acct_test" });
  });

  it("upsertPendingInvite delegates to AccountInvite.findOneAndUpdate with upsert", async () => {
    const { upsertPendingInvite } = await import("@/lib/repositories/memberships");
    const expiresAt = new Date("2026-12-31T00:00:00.000Z");
    await upsertPendingInvite("acct_test", "new@example.com", {
      role: "ENGINEER",
      invitedBy: "user_owner",
      inviteTokenHash: "hash",
      inviteTokenExpiresAt: expiresAt,
      inviteId: "inv_new"
    });
    expect(mocks.inviteFindOneAndUpdate).toHaveBeenCalledWith(
      { accountId: "acct_test", email: "new@example.com", status: "pending" },
      expect.objectContaining({
        $set: expect.objectContaining({ role: "ENGINEER", invitedBy: "user_owner" }),
        $setOnInsert: expect.objectContaining({ inviteId: "inv_new", status: "pending" })
      }),
      { upsert: true, returnDocument: "after" }
    );
  });
});
