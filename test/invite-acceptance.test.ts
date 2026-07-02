import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inviteFindOne: vi.fn(),
  inviteUpdateOne: vi.fn(),
  membershipFindOne: vi.fn(),
  membershipCreate: vi.fn(),
  accountFindOne: vi.fn(),
  sessionUpdateOne: vi.fn()
}));

vi.mock("@/models/AccountInvite", () => ({
  default: {
    findOne: mocks.inviteFindOne,
    updateOne: mocks.inviteUpdateOne
  }
}));

vi.mock("@/models/AccountMembership", () => ({
  default: {
    findOne: mocks.membershipFindOne,
    create: mocks.membershipCreate
  }
}));

vi.mock("@/models/Account", () => ({
  default: {
    findOne: mocks.accountFindOne
  }
}));

vi.mock("@/models/DeveloperSession", () => ({
  default: {
    updateOne: mocks.sessionUpdateOne
  }
}));

describe("invite acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accountFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ accountId: "acct_team", name: "Team Workspace" })
      })
    });
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });
    mocks.membershipCreate.mockResolvedValue({
      membershipId: "mbr_new",
      accountId: "acct_team",
      userId: "user_invited",
      role: "ENGINEER"
    });
    mocks.inviteUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.sessionUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("generates token hash when invite token pair is created", async () => {
    const { createInviteTokenPair } = await import("@/lib/inviteAcceptance");
    const { hashEmailToken } = await import("@/lib/developerAuth");
    const pair = createInviteTokenPair();
    expect(pair.token.length).toBeGreaterThan(20);
    expect(pair.tokenHash).toBe(hashEmailToken(pair.token));
    expect(pair.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects invalid token", async () => {
    mocks.inviteFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      })
    });
    const { acceptInvite, getInvitePreview } = await import("@/lib/inviteAcceptance");
    await expect(getInvitePreview("bad-token")).resolves.toBeNull();
    await expect(acceptInvite("bad-token", "user_a", "a@example.com")).resolves.toEqual({
      error: "invalid_token"
    });
  });

  it("rejects expired invite", async () => {
    mocks.inviteFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          inviteId: "inv_expired",
          accountId: "acct_team",
          email: "invited@example.com",
          role: "ENGINEER",
          status: "pending",
          invitedBy: "user_owner",
          inviteTokenExpiresAt: new Date(Date.now() - 1000)
        })
      })
    });
    const { acceptInvite, getInvitePreview } = await import("@/lib/inviteAcceptance");
    const preview = await getInvitePreview("token_expired");
    expect(preview?.status).toBe("expired");
    await expect(acceptInvite("token_expired", "user_a", "invited@example.com")).resolves.toEqual({
      error: "expired"
    });
  });

  it("rejects revoked invite", async () => {
    mocks.inviteFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          inviteId: "inv_revoked",
          accountId: "acct_team",
          email: "invited@example.com",
          role: "ENGINEER",
          status: "revoked",
          invitedBy: "user_owner",
          inviteTokenExpiresAt: new Date(Date.now() + 60_000)
        })
      })
    });
    const { acceptInvite, getInvitePreview } = await import("@/lib/inviteAcceptance");
    expect((await getInvitePreview("token_revoked"))?.status).toBe("revoked");
    await expect(acceptInvite("token_revoked", "user_a", "invited@example.com")).resolves.toEqual({
      error: "revoked"
    });
  });

  it("blocks logged-in user with different email", async () => {
    mocks.inviteFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          inviteId: "inv_pending",
          accountId: "acct_team",
          email: "invited@example.com",
          role: "ENGINEER",
          status: "pending",
          invitedBy: "user_owner",
          inviteTokenExpiresAt: new Date(Date.now() + 60_000)
        })
      })
    });
    const { acceptInvite } = await import("@/lib/inviteAcceptance");
    await expect(acceptInvite("token_ok", "user_other", "other@example.com")).resolves.toEqual({
      error: "email_mismatch",
      invitedEmail: "invited@example.com"
    });
  });

  it("accepts invite and creates membership with invited role", async () => {
    mocks.inviteFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          inviteId: "inv_pending",
          accountId: "acct_team",
          email: "invited@example.com",
          role: "SENIOR_ENGINEER",
          status: "pending",
          invitedBy: "user_owner",
          inviteTokenExpiresAt: new Date(Date.now() + 60_000)
        })
      })
    });
    const { acceptInvite } = await import("@/lib/inviteAcceptance");
    const result = await acceptInvite("token_ok", "user_invited", "invited@example.com", {
      sessionId: "sess_test"
    });
    expect(result).toMatchObject({
      ok: true,
      accountId: "acct_team",
      role: "SENIOR_ENGINEER"
    });
    expect("membershipId" in result && result.membershipId).toBeTruthy();
    expect(mocks.membershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct_team",
        userId: "user_invited",
        role: "SENIOR_ENGINEER"
      })
    );
    expect(mocks.inviteUpdateOne).toHaveBeenCalled();
  });

  it("does not create duplicate membership on repeat accept", async () => {
    mocks.inviteFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          inviteId: "inv_accepted",
          accountId: "acct_team",
          email: "invited@example.com",
          role: "ENGINEER",
          status: "accepted",
          invitedBy: "user_owner",
          inviteTokenExpiresAt: new Date(Date.now() + 60_000)
        })
      })
    });
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        membershipId: "mbr_existing",
        accountId: "acct_team",
        userId: "user_invited",
        role: "ENGINEER"
      })
    });
    const { acceptInvite } = await import("@/lib/inviteAcceptance");
    const result = await acceptInvite("token_ok", "user_invited", "invited@example.com");
    expect(result).toMatchObject({
      ok: true,
      alreadyAccepted: true,
      alreadyMember: true,
      membershipId: "mbr_existing"
    });
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
  });
});

describe("account context switching", () => {
  it("placeholder for route-level account scoping tests", () => {
    expect(true).toBe(true);
  });
});
