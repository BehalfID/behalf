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

  it("returns already-member for an existing billable member before seat-limit checks", async () => {
    mocks.accountFindOne.mockResolvedValue({
      accountId: "acct_team",
      name: "Free Workspace",
      plan: "free"
    });
    mocks.membershipCountDocuments.mockResolvedValue(1);
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          userId: "user_existing",
          email: "existing@example.com",
          primaryAccountId: "acct_personal"
        })
      })
    });
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        membershipId: "mbr_existing",
        accountId: "acct_team",
        userId: "user_existing",
        role: "ENGINEER"
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

    expect(result).toEqual({
      error: "This user is already a member of the workspace."
    });
    expect(mocks.membershipCountDocuments).not.toHaveBeenCalled();
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
    expect(mocks.inviteFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("blocks adding a new billable existing user when the workspace is at its seat limit", async () => {
    mocks.accountFindOne.mockResolvedValue({
      accountId: "acct_team",
      name: "Free Workspace",
      plan: "free"
    });
    mocks.membershipCountDocuments.mockResolvedValue(1);
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          userId: "user_new",
          email: "newbillable@example.com",
          primaryAccountId: "acct_personal"
        })
      })
    });
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });

    const { addOrInviteMember } = await import("@/lib/membershipManagement");
    const result = await addOrInviteMember(
      {
        userId: "user_owner",
        accountId: "acct_team",
        role: "OWNER",
        authorityLevel: 100
      },
      { email: "newbillable@example.com", role: "ENGINEER" }
    );

    expect("error" in result).toBe(true);
    if ("error" in result && result.error instanceof Response) {
      expect(result.error.status).toBe(402);
      await expect(result.error.json()).resolves.toEqual(expect.objectContaining({
        code: "SEAT_LIMIT_REACHED"
      }));
    } else {
      throw new Error("Expected a structured seat limit error response.");
    }
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
  });
});
