import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inviteFindOneAndUpdate: vi.fn(),
  userFindOne: vi.fn(),
  membershipFindOne: vi.fn(),
  membershipCountDocuments: vi.fn(),
  accountFindOne: vi.fn()
}));

vi.mock("@/models/AccountInvite", () => ({
  default: {
    findOneAndUpdate: mocks.inviteFindOneAndUpdate
  }
}));

vi.mock("@/models/DeveloperUser", () => ({
  default: {
    findOne: mocks.userFindOne
  }
}));

vi.mock("@/models/AccountMembership", () => ({
  default: {
    findOne: mocks.membershipFindOne,
    countDocuments: mocks.membershipCountDocuments
  }
}));

vi.mock("@/models/Account", () => ({
  default: {
    findOne: mocks.accountFindOne
  }
}));

describe("addOrInviteMember pending invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      })
    });
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });
    mocks.membershipCountDocuments.mockResolvedValue(1);
    mocks.accountFindOne.mockResolvedValue({
      accountId: "acct_team",
      name: "Team Workspace",
      plan: "team"
    });
    mocks.inviteFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        inviteId: "inv_test",
        email: "new@example.com",
        role: "ENGINEER",
        invitedBy: "user_owner"
      })
    });
  });

  it("generates invite token hash and accept URL when inviting a new email", async () => {
    const { addOrInviteMember } = await import("@/lib/membershipManagement");
    const result = await addOrInviteMember(
      {
        userId: "user_owner",
        accountId: "acct_team",
        role: "OWNER",
        authorityLevel: 100
      },
      { email: "new@example.com", role: "ENGINEER" },
      { appBaseUrl: "https://app.example.com" }
    );

    expect("invite" in result).toBe(true);
    if ("invite" in result) {
      expect(result.invite.acceptUrl).toMatch(/^https:\/\/app\.example\.com\/invite\//);
    }
    const updateArg = mocks.inviteFindOneAndUpdate.mock.calls[0]?.[1];
    expect(updateArg.$set.inviteTokenHash).toBeTruthy();
    expect(updateArg.$set.inviteTokenExpiresAt).toBeInstanceOf(Date);
  });

  it("blocks billable invites at the seat limit without touching existing members", async () => {
    mocks.accountFindOne.mockResolvedValue({
      accountId: "acct_team",
      name: "Free Workspace",
      plan: "free"
    });
    mocks.membershipCountDocuments.mockResolvedValue(1);

    const { addOrInviteMember } = await import("@/lib/membershipManagement");
    const result = await addOrInviteMember(
      {
        userId: "user_owner",
        accountId: "acct_team",
        role: "OWNER",
        authorityLevel: 100
      },
      { email: "new@example.com", role: "ENGINEER" }
    );

    expect("error" in result).toBe(true);
    if ("error" in result && result.error instanceof Response) {
      expect(result.error.status).toBe(402);
      await expect(result.error.json()).resolves.toEqual(expect.objectContaining({
        error: "Billable seat limit of 1 reached on the free plan.",
        code: "SEAT_LIMIT_REACHED",
        currentPlan: "free",
        limit: 1
      }));
    } else {
      throw new Error("Expected a structured seat limit error response.");
    }
    expect(mocks.inviteFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("allows viewer invites even when the workspace is at its seat limit", async () => {
    mocks.accountFindOne.mockResolvedValue({
      accountId: "acct_team",
      name: "Free Workspace",
      plan: "free"
    });
    mocks.membershipCountDocuments.mockResolvedValue(1);
    mocks.inviteFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        inviteId: "inv_viewer",
        email: "viewer@example.com",
        role: "VIEWER",
        invitedBy: "user_owner"
      })
    });

    const { addOrInviteMember } = await import("@/lib/membershipManagement");
    const result = await addOrInviteMember(
      {
        userId: "user_owner",
        accountId: "acct_team",
        role: "OWNER",
        authorityLevel: 100
      },
      { email: "viewer@example.com", role: "VIEWER" }
    );

    expect("invite" in result).toBe(true);
    expect(mocks.inviteFindOneAndUpdate).toHaveBeenCalled();
  });
});
