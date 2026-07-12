import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSessionToken } from "@/lib/developerAuth";
import { WORKSPACE_SLUG_HEADER } from "@/lib/workspaceSlug";

const mocks = vi.hoisted(() => ({
  sessionFindOne: vi.fn(),
  userFindOne: vi.fn(),
  accountFindOne: vi.fn(),
  membershipFind: vi.fn(),
  resolveActiveAccountId: vi.fn(),
  requireWorkspaceMembershipBySlug: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/models/DeveloperSession", () => ({
  default: { findOne: mocks.sessionFindOne }
}));
vi.mock("@/models/DeveloperUser", () => ({
  default: { findOne: mocks.userFindOne }
}));
vi.mock("@/models/Account", () => ({
  default: { findOne: mocks.accountFindOne }
}));
vi.mock("@/models/AccountMembership", () => ({
  default: { find: mocks.membershipFind }
}));
vi.mock("@/lib/accountContext", () => ({
  resolveActiveAccountId: mocks.resolveActiveAccountId,
  requireWorkspaceMembershipBySlug: mocks.requireWorkspaceMembershipBySlug
}));

const SESSION_TOKEN = "test-session-token";

function authRequest(path: string, method = "GET", extraHeaders: Record<string, string> = {}) {
  const url = new URL(`http://example.test${path}`);
  return Object.assign(
    new Request(url, {
      method,
      headers: {
        Origin: "http://example.test",
        ...extraHeaders
      }
    }),
    {
      nextUrl: url,
      cookies: {
        get: () => ({ value: SESSION_TOKEN })
      }
    }
  ) as never;
}

describe("requireDeveloperApi workspace slug scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        sessionId: "sess_test",
        userId: "dev_test",
        tokenHash: hashSessionToken(SESSION_TOKEN),
        expiresAt: new Date(Date.now() + 60_000),
        activeAccountId: "acct_session"
      })
    });
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          userId: "dev_test",
          email: "dev@example.com",
          emailVerified: true,
          primaryAccountId: "acct_session"
        })
      })
    });
    mocks.resolveActiveAccountId.mockResolvedValue("acct_session");
    mocks.accountFindOne.mockImplementation((query: { accountId?: string }) => ({
      lean: vi.fn().mockResolvedValue({
        accountId: query.accountId ?? "acct_session",
        name: "Workspace",
        slug: query.accountId === "acct_alpha" ? "alpha" : query.accountId === "acct_beta" ? "beta" : "session-ws"
      })
    }));
  });

  it("uses trusted x-behalf-workspace-slug over session activeAccountId", async () => {
    mocks.requireWorkspaceMembershipBySlug.mockResolvedValue({
      workspace: {
        accountId: "acct_alpha",
        slug: "alpha",
        name: "Alpha",
        role: "OWNER"
      }
    });

    const { requireDeveloperApi } = await import("@/lib/developerAuth");
    const result = await requireDeveloperApi(
      authRequest("/api/dashboard/summary", "GET", { [WORKSPACE_SLUG_HEADER]: "alpha" })
    );

    expect(result.error).toBeNull();
    expect(result.activeAccountId).toBe("acct_alpha");
    expect(result.workspaceSlug).toBe("alpha");
    expect(mocks.requireWorkspaceMembershipBySlug).toHaveBeenCalledWith("dev_test", "alpha");
    expect(result.activeAccountId).not.toBe("acct_session");
  });

  it("returns 403 for a forged slug without membership", async () => {
    mocks.requireWorkspaceMembershipBySlug.mockResolvedValue({
      error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }),
      status: 403
    });

    const { requireDeveloperApi } = await import("@/lib/developerAuth");
    const result = await requireDeveloperApi(
      authRequest("/api/dashboard/summary", "GET", { [WORKSPACE_SLUG_HEADER]: "forged" })
    );

    expect(result.user).toBeNull();
    expect(result.activeAccountId).toBeNull();
    expect(result.error).not.toBeNull();
    expect((result.error as Response).status).toBe(403);
  });

  it("returns 404 for a nonexistent slug", async () => {
    mocks.requireWorkspaceMembershipBySlug.mockResolvedValue({
      error: Response.json({ error: "Workspace not found." }, { status: 404 }),
      status: 404
    });

    const { requireDeveloperApi } = await import("@/lib/developerAuth");
    const result = await requireDeveloperApi(
      authRequest("/api/dashboard/summary", "GET", { [WORKSPACE_SLUG_HEADER]: "missing-co" })
    );

    expect(result.user).toBeNull();
    expect(result.error).not.toBeNull();
    expect((result.error as Response).status).toBe(404);
  });

  it("falls back to legacy session activeAccountId without the header", async () => {
    const { requireDeveloperApi } = await import("@/lib/developerAuth");
    const result = await requireDeveloperApi(authRequest("/api/dashboard/summary", "GET"));

    expect(result.error).toBeNull();
    expect(result.activeAccountId).toBe("acct_session");
    expect(result.workspaceSlug).toBeNull();
    expect(mocks.requireWorkspaceMembershipBySlug).not.toHaveBeenCalled();
  });

  it("scopes two requests with different authorized slugs independently", async () => {
    mocks.requireWorkspaceMembershipBySlug
      .mockResolvedValueOnce({
        workspace: { accountId: "acct_alpha", slug: "alpha", name: "Alpha", role: "OWNER" }
      })
      .mockResolvedValueOnce({
        workspace: { accountId: "acct_beta", slug: "beta", name: "Beta", role: "ENGINEER" }
      });

    const { requireDeveloperApi, requireWorkspaceDeveloperApi } = await import("@/lib/developerAuth");
    const first = await requireDeveloperApi(
      authRequest("/api/dashboard/summary", "GET", { [WORKSPACE_SLUG_HEADER]: "alpha" })
    );
    const second = await requireWorkspaceDeveloperApi(
      authRequest("/api/dashboard/summary", "GET", { [WORKSPACE_SLUG_HEADER]: "beta" })
    );

    expect(first.activeAccountId).toBe("acct_alpha");
    expect(second.activeAccountId).toBe("acct_beta");
    expect(first.workspaceSlug).toBe("alpha");
    expect(second.workspaceSlug).toBe("beta");
  });
});
