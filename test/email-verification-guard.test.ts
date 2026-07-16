import { describe, expect, it } from "vitest";
import {
  isUnverifiedAuthApiPath,
  requiresEmailVerificationRedirect
} from "@/lib/emailVerificationGuard";

describe("email verification guard", () => {
  it("requires redirect only for explicitly unverified users", () => {
    expect(requiresEmailVerificationRedirect({ emailVerified: false })).toBe(true);
    expect(requiresEmailVerificationRedirect({ emailVerified: true })).toBe(false);
    expect(requiresEmailVerificationRedirect({ emailVerified: undefined })).toBe(false);
    expect(requiresEmailVerificationRedirect(null)).toBe(false);
  });

  it("allowlists verification auth endpoints", () => {
    expect(isUnverifiedAuthApiPath("/api/auth/verify-email")).toBe(true);
    expect(isUnverifiedAuthApiPath("/api/auth/verification-status")).toBe(true);
    expect(isUnverifiedAuthApiPath("/api/dashboard/settings")).toBe(false);
  });
});
