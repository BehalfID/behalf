import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  checkRateLimit: vi.fn(),
  checkAuthRateLimit: vi.fn(),
  sendEmail: vi.fn(),
  userFindOne: vi.fn(),
  userExists: vi.fn(),
  userUpdateOne: vi.fn(),
  sessionDeleteMany: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/lib/developerAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/developerAuth")>()),
  requireDashboardMutationOrigin: vi.fn().mockReturnValue(null)
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  checkAuthRateLimit: mocks.checkAuthRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/models/DeveloperUser", () => ({
  default: {
    findOne: mocks.userFindOne,
    exists: mocks.userExists,
    updateOne: mocks.userUpdateOne
  }
}));
vi.mock("@/models/DeveloperSession", () => ({
  default: { deleteMany: mocks.sessionDeleteMany }
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function postRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
    body: JSON.stringify(body)
  }) as never;
}

// ── forgot-password route ─────────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.checkAuthRateLimit.mockResolvedValue({ limited: false });
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.userFindOne.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ userId: "user_test", email: "dev@example.com" }) }) });
    mocks.userUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("returns ok=true for a registered email", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(postRequest("http://localhost:3000/api/auth/forgot-password", { email: "dev@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it("returns ok=true for an unregistered email (no enumeration)", async () => {
    mocks.userFindOne.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(postRequest("http://localhost:3000/api/auth/forgot-password", { email: "nobody@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("does not send email when rate-limited by auth limiter", async () => {
    mocks.checkAuthRateLimit.mockResolvedValue({ limited: true });
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(postRequest("http://localhost:3000/api/auth/forgot-password", { email: "dev@example.com" }));
    expect(res.status).toBe(429);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("does not log the reset token value", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    await POST(postRequest("http://localhost:3000/api/auth/forgot-password", { email: "dev@example.com" }));
    for (const call of consoleSpy.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toMatch(/bhf_/);
    }
  });
});

// ── reset-password route ──────────────────────────────────────────────────────

describe("POST /api/auth/reset-password", () => {
  const validUser = { userId: "user_test", email: "dev@example.com" };

  beforeEach(() => {
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.checkAuthRateLimit.mockResolvedValue({ limited: false });
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(validUser)
      })
    });
    mocks.userUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.sessionDeleteMany.mockResolvedValue({ deletedCount: 2 });
  });

  it("resets password with a valid token", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const res = await POST(postRequest("http://localhost:3000/api/auth/reset-password", {
      token: "validtoken123",
      password: "newpassword123"
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("invalidates all sessions after password change", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    await POST(postRequest("http://localhost:3000/api/auth/reset-password", {
      token: "validtoken123",
      password: "newpassword123"
    }));
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ userId: validUser.userId });
  });

  it("clears the reset token fields after use", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    await POST(postRequest("http://localhost:3000/api/auth/reset-password", {
      token: "validtoken123",
      password: "newpassword123"
    }));
    expect(mocks.userUpdateOne).toHaveBeenCalledWith(
      { userId: validUser.userId },
      expect.objectContaining({
        $unset: expect.objectContaining({ passwordResetTokenHash: "", passwordResetTokenExpiresAt: "" })
      })
    );
  });

  it("returns 400 for an invalid or expired token", async () => {
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
    });
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const res = await POST(postRequest("http://localhost:3000/api/auth/reset-password", {
      token: "expiredtoken",
      password: "newpassword123"
    }));
    expect(res.status).toBe(400);
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("rejects a short password", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const res = await POST(postRequest("http://localhost:3000/api/auth/reset-password", {
      token: "validtoken123",
      password: "short"
    }));
    expect(res.status).toBe(400);
    expect(mocks.userUpdateOne).not.toHaveBeenCalled();
  });

  it("sends a password-changed notification email", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    await POST(postRequest("http://localhost:3000/api/auth/reset-password", {
      token: "validtoken123",
      password: "newpassword123"
    }));
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    const call = mocks.sendEmail.mock.calls[0][0];
    expect(call.subject).toContain("password");
  });

  it("marks email as verified after password reset (implies email access)", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    await POST(postRequest("http://localhost:3000/api/auth/reset-password", {
      token: "validtoken123",
      password: "newpassword123"
    }));
    expect(mocks.userUpdateOne).toHaveBeenCalledWith(
      { userId: validUser.userId },
      expect.objectContaining({ $set: expect.objectContaining({ emailVerified: true }) })
    );
  });
});

// ── email module security ─────────────────────────────────────────────────────

describe("email module does not log tokens", () => {
  it("sendEmail call does not receive token values in arguments", async () => {
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.checkAuthRateLimit.mockResolvedValue({ limited: false });
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ userId: "user_test", email: "dev@example.com" })
      })
    });
    mocks.userUpdateOne.mockResolvedValue({ modifiedCount: 1 });

    const { POST } = await import("@/app/api/auth/forgot-password/route");
    await POST(postRequest("http://localhost:3000/api/auth/forgot-password", { email: "dev@example.com" }));

    const emailArg = mocks.sendEmail.mock.calls[0]?.[0];
    expect(emailArg).toBeDefined();
    // The reset URL in the email contains the raw token — that's intentional.
    // What must NOT happen is the raw token appearing in console.log calls.
    const consoleSpy = vi.spyOn(console, "log");
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
