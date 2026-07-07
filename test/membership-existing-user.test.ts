import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inviteFindOneAndUpdate: vi.fn(),
  userFindOne: vi.fn(),
  membershipFindOne: vi.fn(),
  membershipCreate: vi.fn(),
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
    create: mocks.membershipCreate,
    countDocuments: mocks.membershipCountDocuments
  }
}));

vi.mock("@/models/Account", () => ({
  default: {
    findOne: mocks.accountFindOne
  }
}));

describe("addOrInviteMember existing user behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });
    mocks.membershipCreate.mockResolvedValue({
      membershipId: "mbr_existing",
      userId: "user_existing",
      accountId: "acct_team",
      role: "ENGINEER"
    });
    mocks.membershipCountDocuments.mockResolvedValue(1);
    mocks.accountFindOne.mockResolvedValue({
      accountId: "acct_team",
      name: "Team Workspace",
      plan: "team"
    });
  });

  it("adds existing users immediately without creating a pending invite", async () => {
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          userId: "user_existing",
          email: "existing@example.com",
          primaryAccountId: "acct_personal"
        })
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
      { email: "existing@example.com", role: "ENGINEER" }
    );

    expect("member" in result).toBe(true);
    if ("member" in result) {
      expect(result.member.userId).toBe("user_existing");
      expect(result.member.role).toBe("ENGINEER");
    }
    expect(mocks.membershipCreate).toHaveBeenCalledOnce();
    expect(mocks.inviteFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
