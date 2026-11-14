import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentDeveloper: vi.fn(),
  createOAuthState: vi.fn(),
  checkRateLimit: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({ getCurrentDeveloper: mocks.getCurrentDeveloper }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/lib/authProviders/identityAudit", () => ({ recordIdentityAudit: vi.fn() }));
vi.mock("@/lib/authProviders/providers/registry", () => ({
  getLoginProvider: () => ({
    isConfigured: () => ({ configured: true }),
    buildAuthorizeUrl: () => "https://github.com/login/oauth/authorize?x=1"
  })
}));
vi.mock("@/lib/authProviders/oauthState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authProviders/oauthState")>()),
  createOAuthState: mocks.createOAuthState
}));

describe("GET /api/auth/github?mode=link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.createOAuthState.mockResolvedValue({
      state: { state: "st_1", next: null },
      codeChallenge: "challenge"
    });
  });

  it("refuses to start linking for an account whose email is unverified", async () => {
    mocks.getCurrentDeveloper.mockResolvedValue({ userId: "user_1", emailVerified: false });
    const { GET } = await import("@/app/api/auth/github/route");

    const res = await GET(new NextRequest("http://localhost:3000/api/auth/github?mode=link"));

    expect(res.status).toBe(403);
    expect(mocks.createOAuthState).not.toHaveBeenCalled();
  });

  it("starts linking for a verified account", async () => {
    mocks.getCurrentDeveloper.mockResolvedValue({ userId: "user_1", emailVerified: true });
    const { GET } = await import("@/app/api/auth/github/route");

    const res = await GET(new NextRequest("http://localhost:3000/api/auth/github?mode=link"));

    expect(res.status).not.toBe(403);
    expect(mocks.createOAuthState).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "link", userId: "user_1" })
    );
  });
});
