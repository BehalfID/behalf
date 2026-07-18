import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  checkRateLimit: vi.fn(),
  checkAuthRateLimit: vi.fn(),
  isPasswordLoginBlockedBySso: vi.fn(),
  userFindOne: vi.fn(),
  createDeveloperSession: vi.fn(),
  setDeveloperSessionCookie: vi.fn(),
  verifyPassword: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  checkAuthRateLimit: mocks.checkAuthRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/lib/developerAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/developerAuth")>()),
  requireDashboardMutationOrigin: vi.fn().mockReturnValue(null),
  createDeveloperSession: mocks.createDeveloperSession,
  setDeveloperSessionCookie: mocks.setDeveloperSessionCookie,
  verifyPassword: mocks.verifyPassword
}));
vi.mock("@/lib/workspaceSso", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspaceSso")>()),
  isPasswordLoginBlockedBySso: mocks.isPasswordLoginBlockedBySso
}));
vi.mock("@/models/DeveloperUser", () => ({
  default: { findOne: mocks.userFindOne }
}));

function makeLoginRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000"
    },
    body: JSON.stringify(body)
  });
}

describe("POST /api/auth/login SSO enforcement", () => {
  beforeEach(() => {
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.checkAuthRateLimit.mockResolvedValue({ limited: false });
    mocks.isPasswordLoginBlockedBySso.mockResolvedValue(false);
    mocks.userFindOne.mockReset();
    mocks.createDeveloperSession.mockResolvedValue({ token: "t", session: { sessionId: "s" } });
    mocks.verifyPassword.mockResolvedValue(true);
  });

  it("blocks password login when workspace SSO enforce matches the email domain", async () => {
    mocks.isPasswordLoginBlockedBySso.mockResolvedValue(true);
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeLoginRequest({ email: "dev@acme.com", password: "longpassword1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Continue with Google/);
    expect(mocks.userFindOne).not.toHaveBeenCalled();
  });

  it("directs Google-only accounts to Google sign-in", async () => {
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        userId: "user_1",
        email: "dev@acme.com",
        passwordHash: null,
        authProviders: ["google"],
        emailVerified: true
      })
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeLoginRequest({ email: "dev@acme.com", password: "longpassword1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Google sign-in/);
  });
});
