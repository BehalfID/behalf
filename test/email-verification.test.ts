import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  checkRateLimit: vi.fn(),
  checkAuthRateLimit: vi.fn(),
  sendEmail: vi.fn(),
  userFindOne: vi.fn(),
  userExists: vi.fn(),
  userCreate: vi.fn(),
  userUpdateOne: vi.fn(),
  sessionCreate: vi.fn(),
  createDeveloperAccount: vi.fn()
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
  getDeveloperFromToken: vi.fn().mockResolvedValue(null)
}));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/account", () => ({ createDeveloperAccount: mocks.createDeveloperAccount }));
vi.mock("@/models/DeveloperUser", () => ({
  default: {
    findOne: mocks.userFindOne,
    exists: mocks.userExists,
    create: mocks.userCreate,
    updateOne: mocks.userUpdateOne
  }
}));
vi.mock("@/models/DeveloperSession", () => ({
  default: { create: mocks.sessionCreate }
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>, cookie?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Origin": "http://localhost:3000"
  };
  if (cookie) headers["Cookie"] = `behalfid_developer=${cookie}`;
  return new Request("http://localhost:3000/api/auth/verify-email", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }) as never;
}

// ── verify-email route ────────────────────────────────────────────────────────

describe("POST /api/auth/verify-email", () => {
  beforeEach(() => {
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          userId: "user_test",
          emailVerificationTokenHash: "hashed",
          emailVerificationTokenExpiresAt: new Date(Date.now() + 60000)
        })
      })
    });
    mocks.userUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("verifies a valid token and clears token fields", async () => {
    const { POST } = await import("@/app/api/auth/verify-email/route");
    const res = await POST(makeRequest({ token: "validtoken123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(mocks.userUpdateOne).toHaveBeenCalledWith(
      { userId: "user_test" },
      expect.objectContaining({
        $set: { emailVerified: true },
        $unset: expect.objectContaining({ emailVerificationTokenHash: "" })
      })
    );
  });

  it("returns 400 for an invalid or expired token", async () => {
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
    });
    const { POST } = await import("@/app/api/auth/verify-email/route");
    const res = await POST(makeRequest({ token: "badtoken" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when token is missing", async () => {
    const { POST } = await import("@/app/api/auth/verify-email/route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("rate-limits requests", async () => {
    mocks.checkRateLimit.mockResolvedValue({ limited: true });
    const { POST } = await import("@/app/api/auth/verify-email/route");
    const res = await POST(makeRequest({ token: "any" }));
    expect(res.status).toBe(429);
  });
});

// ── resend-verification route ─────────────────────────────────────────────────

describe("POST /api/auth/resend-verification", () => {
  beforeEach(() => {
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.checkAuthRateLimit.mockResolvedValue({ limited: false });
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.userUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("returns ok=true even when not authenticated (no enumeration)", async () => {
    // getDeveloperFromToken is mocked to return null (unauthenticated).
    const { POST } = await import("@/app/api/auth/resend-verification/route");
    const req = new Request("http://localhost:3000/api/auth/resend-verification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://localhost:3000",
        "Cookie": ""
      }
    }) as never;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("rate-limits by IP", async () => {
    mocks.checkRateLimit.mockResolvedValue({ limited: true });
    const { POST } = await import("@/app/api/auth/resend-verification/route");
    const req = new Request("http://localhost:3000/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" }
    }) as never;
    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});
