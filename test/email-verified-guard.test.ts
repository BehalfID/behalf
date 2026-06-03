import { describe, expect, it } from "vitest";
import { isEmailVerified } from "@/lib/developerAuth";

describe("isEmailVerified migration safety", () => {
  it("treats undefined (pre-feature accounts) as verified", () => {
    expect(isEmailVerified(undefined)).toBe(true);
  });

  it("treats null as verified", () => {
    expect(isEmailVerified(null)).toBe(true);
  });

  it("treats explicit true as verified", () => {
    expect(isEmailVerified(true)).toBe(true);
  });

  it("treats explicit false as unverified", () => {
    expect(isEmailVerified(false)).toBe(false);
  });
});

// requireVerifiedDeveloperApi unverified-access tests live at the route level
// in email-verification.test.ts and email-verified-route.test.ts, where the full
// auth stack can be mocked via vi.mock("@/lib/developerAuth", ...).
