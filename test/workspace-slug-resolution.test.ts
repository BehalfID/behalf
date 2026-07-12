import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAccountBySlugLean: vi.fn(),
  membershipFindOne: vi.fn()
}));

vi.mock("@/lib/repositories/accounts", () => ({
  findAccountBySlugLean: mocks.findAccountBySlugLean
}));

vi.mock("@/models/AccountMembership", () => ({
  default: {
    findOne: mocks.membershipFindOne
  }
}));

vi.mock("@/models/Account", () => ({
  default: {}
}));

vi.mock("@/models/DeveloperSession", () => ({
  default: {}
}));

describe("resolveWorkspaceForUserBySlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when the user is a member", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue({
      accountId: "acct_team",
      slug: "trajectus",
      name: "Trajectus"
    });
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        membershipId: "mbr_team",
        accountId: "acct_team",
        userId: "user_a",
        role: "OWNER"
      })
    });

    const { resolveWorkspaceForUserBySlug } = await import("@/lib/accountContext");
    const result = await resolveWorkspaceForUserBySlug("user_a", "trajectus");
    expect(result).toEqual({
      workspace: {
        accountId: "acct_team",
        slug: "trajectus",
        name: "Trajectus",
        role: "OWNER"
      }
    });
  });

  it("returns 403 when the workspace exists but the user is not a member", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue({
      accountId: "acct_other",
      slug: "other-co",
      name: "Other Co"
    });
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });

    const { resolveWorkspaceForUserBySlug } = await import("@/lib/accountContext");
    const result = await resolveWorkspaceForUserBySlug("user_a", "other-co");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.status).toBe(403);
      expect(result.error.status).toBe(403);
    }
  });

  it("returns 404 for a nonexistent slug", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue(null);

    const { resolveWorkspaceForUserBySlug } = await import("@/lib/accountContext");
    const result = await resolveWorkspaceForUserBySlug("user_a", "missing-co");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.status).toBe(404);
      expect(result.error.status).toBe(404);
    }
  });

  it("returns 404 for reserved or invalid slug inputs", async () => {
    // Reserved/invalid inputs normalize to the "workspace" fallback; when that
    // slug is not an owned account match, resolution is 404 (proxy also blocks
    // reserved first segments before they reach this helper).
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    const { resolveWorkspaceForUserBySlug } = await import("@/lib/accountContext");

    const reserved = await resolveWorkspaceForUserBySlug("user_a", "dashboard");
    expect("error" in reserved).toBe(true);
    if ("error" in reserved) {
      expect(reserved.status).toBe(404);
    }
    expect(mocks.findAccountBySlugLean).toHaveBeenCalledWith("workspace", "accountId name slug");

    mocks.findAccountBySlugLean.mockClear();
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    const invalid = await resolveWorkspaceForUserBySlug("user_a", "---");
    expect("error" in invalid).toBe(true);
    if ("error" in invalid) {
      expect(invalid.status).toBe(404);
    }
  });
});

describe("requireWorkspaceMembershipBySlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to resolveWorkspaceForUserBySlug", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue({
      accountId: "acct_team",
      slug: "trajectus",
      name: "Trajectus"
    });
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        membershipId: "mbr_team",
        accountId: "acct_team",
        userId: "user_a",
        role: "ENGINEER"
      })
    });

    const { requireWorkspaceMembershipBySlug } = await import("@/lib/accountContext");
    const result = await requireWorkspaceMembershipBySlug("user_a", "Trajectus");
    expect(result).toEqual({
      workspace: {
        accountId: "acct_team",
        slug: "trajectus",
        name: "Trajectus",
        role: "ENGINEER"
      }
    });
  });
});
