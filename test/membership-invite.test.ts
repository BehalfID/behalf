import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inviteFindOneAndUpdate: vi.fn(),
  userFindOne: vi.fn(),
  membershipFindOne: vi.fn()
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
    findOne: mocks.membershipFindOne
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
});
