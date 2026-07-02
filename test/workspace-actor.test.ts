import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceActor: vi.fn(),
  canManageAgents: vi.fn()
}));

vi.mock("@/lib/delegatedAuth", () => ({
  getWorkspaceActor: mocks.getWorkspaceActor,
  canManageAgents: mocks.canManageAgents,
  viewerMutationForbidden: () => new Response(null, { status: 403 })
}));

describe("requireWorkspaceMutationActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks authority against active account, not primary account", async () => {
    mocks.getWorkspaceActor.mockImplementation(async (_userId: string, accountId: string | null | undefined) => {
      if (accountId === "acct_team") {
        return { userId: "user_a", accountId: "acct_team", role: "VIEWER", authorityLevel: 10 };
      }
      return { userId: "user_a", accountId: "acct_primary", role: "ENGINEERING_LEAD", authorityLevel: 80 };
    });
    mocks.canManageAgents.mockReturnValue(false);

    const { requireWorkspaceMutationActor } = await import("@/lib/workspaceActor");
    const result = await requireWorkspaceMutationActor(
      { userId: "user_a", primaryAccountId: "acct_primary" },
      "acct_team"
    );

    expect(mocks.getWorkspaceActor).toHaveBeenCalledWith("user_a", "acct_team");
    expect(result.actor).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("allows mutation when active account role can manage agents", async () => {
    mocks.getWorkspaceActor.mockResolvedValue({
      userId: "user_a",
      accountId: "acct_team",
      role: "ENGINEERING_LEAD",
      authorityLevel: 80
    });
    mocks.canManageAgents.mockReturnValue(true);

    const { requireWorkspaceMutationActor } = await import("@/lib/workspaceActor");
    const result = await requireWorkspaceMutationActor(
      { userId: "user_a", primaryAccountId: "acct_primary" },
      "acct_team"
    );

    expect(result.error).toBeNull();
    expect(result.actor?.accountId).toBe("acct_team");
  });
});
