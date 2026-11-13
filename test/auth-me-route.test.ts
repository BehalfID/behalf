import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: vi.fn(async () => ({
    user: {
      userId: "usr_test",
      email: "dev@example.com",
      emailVerified: true,
      firstName: "Dev",
      lastName: "Eloper",
      primaryAccountId: "acct_test",
      authProviders: ["password"],
      onboardingUseCase: "sdk",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      mfaEnabledAt: new Date("2026-02-01T00:00:00.000Z"),
      passwordHash: "scrypt$secret-hash",
      googleSub: "google-sub-123",
      mfaTotpSecretEnc: "v1:iv:tag:data",
      mfaTotpPendingSecretEnc: "v1:iv:tag:pending",
      mfaBackupCodeHashes: ["hash1", "hash2"],
      passwordResetTokenHash: "reset-hash",
      emailVerificationTokenHash: "verify-hash",
      emailVerificationCodeHash: "code-hash",
      lastSignInUserAgent: "Mozilla/5.0"
    },
    error: null
  }))
}));

vi.mock("@/lib/repositories/users", () => ({ updateUser: vi.fn() }));

describe("GET /api/auth/me", () => {
  it("returns only allowlisted profile fields and never credential material", async () => {
    const { GET } = await import("@/app/api/auth/me/route");
    const response = await GET(new NextRequest("http://localhost/api/auth/me"));
    expect(response?.status).toBe(200);
    const text = await response!.text();
    const body = JSON.parse(text) as { user: Record<string, unknown> };

    expect(body.user).toMatchObject({
      userId: "usr_test",
      email: "dev@example.com",
      emailVerified: true,
      onboardingUseCase: "sdk",
      mfaEnabled: true,
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    for (const key of [
      "passwordHash",
      "googleSub",
      "mfaTotpSecretEnc",
      "mfaTotpPendingSecretEnc",
      "mfaBackupCodeHashes",
      "passwordResetTokenHash",
      "emailVerificationTokenHash",
      "emailVerificationCodeHash",
      "lastSignInUserAgent"
    ]) {
      expect(body.user).not.toHaveProperty(key);
    }
    for (const secret of ["secret-hash", "v1:iv", "hash1", "reset-hash", "verify-hash", "code-hash"]) {
      expect(text).not.toContain(secret);
    }
  });
});
