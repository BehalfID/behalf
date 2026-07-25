import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteDeveloperUser: vi.fn(),
  userFind: vi.fn()
}));

vi.mock("@/lib/accountDeletion", () => ({
  deleteDeveloperUser: mocks.deleteDeveloperUser
}));
vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/models/DeveloperUser", () => ({
  default: { findOne: mocks.userFind }
}));
vi.mock("@/models/DeveloperSession", () => ({
  default: { deleteOne: vi.fn(async () => undefined) }
}));
vi.mock("@/lib/developerAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/developerAuth")>();
  return {
    ...actual,
    requireVerifiedDeveloperApi: vi.fn(async () => ({
      user: { userId: "user_test", email: "dev@example.com", emailVerified: true },
      account: null,
      activeAccountId: null,
      session: null,
      workspaceSlug: null,
      error: null
    })),
    verifyPassword: vi.fn(async () => true),
    hashSessionToken: actual.hashSessionToken,
    clearDeveloperSessionCookie: vi.fn(),
    requireDashboardMutationOrigin: vi.fn(() => null)
  };
});
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));

function deleteRequest(body: Record<string, unknown>) {
  return Object.assign(
    new Request("http://example.test/api/auth/account", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://example.test"
      },
      body: JSON.stringify(body)
    }),
    {
      nextUrl: new URL("http://example.test/api/auth/account"),
      cookies: {
        get: () => ({ value: "session-token" })
      }
    }
  ) as never;
}

describe("DELETE /api/auth/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFind.mockReturnValue({
      select: vi.fn().mockResolvedValue({ userId: "user_test", passwordHash: "hash" })
    });
    mocks.deleteDeveloperUser.mockResolvedValue({ ok: true, deletedUserId: "user_test", deletedAccountIds: [] });
  });

  it("requires DELETE confirmation text", async () => {
    const { DELETE } = await import("@/app/api/auth/account/route");
    const res = await DELETE(deleteRequest({ password: "password12345", confirmation: "REMOVE" }));
    expect(res.status).toBe(400);
    expect(mocks.deleteDeveloperUser).not.toHaveBeenCalled();
  });

  it("deletes the account when confirmation and password are valid", async () => {
    const { DELETE } = await import("@/app/api/auth/account/route");
    const res = await DELETE(deleteRequest({ password: "password12345", confirmation: "DELETE" }));
    expect(res.status).toBe(200);
    expect(mocks.deleteDeveloperUser).toHaveBeenCalledWith("user_test");
  });
});
