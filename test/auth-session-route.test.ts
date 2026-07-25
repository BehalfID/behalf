import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkSessionOnServer: vi.fn(),
  connectToDatabase: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: mocks.connectToDatabase
}));
vi.mock("@/lib/developerAuth", () => ({
  checkSessionOnServer: mocks.checkSessionOnServer
}));

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
  });

  it("returns 401 when no valid session exists", async () => {
    mocks.checkSessionOnServer.mockResolvedValue(null);
    const { GET } = await import("@/app/api/auth/session/route");
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ authenticated: false });
  });

  it("returns session status when authenticated", async () => {
    mocks.checkSessionOnServer.mockResolvedValue({
      sessionId: "sess_test",
      userId: "user_test",
      email: "dev@example.com",
      emailVerified: true,
      inactivityMs: 3_600_000
    });
    const { GET } = await import("@/app/api/auth/session/route");
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      authenticated: true,
      session: {
        sessionId: "sess_test",
        userId: "user_test",
        email: "dev@example.com",
        emailVerified: true,
        inactivityMs: 3_600_000
      }
    });
  });
});
