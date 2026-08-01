import { describe, expect, it } from "vitest";
import {
  AUTH_PAGE_PATHS,
  authPagePath,
  canonicalCompleteProfilePathFromLegacy,
  completeProfilePath,
  isCanonicalCompleteProfilePath,
  LEGACY_COMPLETE_PROFILE_PATH,
  resolveAuthPageHref,
  resolveLegacyCompleteProfileRedirect
} from "@/lib/authPageUrls";

describe("authPageUrls", () => {
  it("exposes canonical paths without an /auth prefix", () => {
    expect(AUTH_PAGE_PATHS.login).toBe("/login");
    expect(AUTH_PAGE_PATHS.completeProfile).toBe("/complete-profile");
    expect(authPagePath("completeProfile")).toBe("/complete-profile");
    expect(authPagePath("completeProfile")).not.toContain("/auth/");
  });

  it("builds complete-profile URLs with provider and next query params", () => {
    expect(completeProfilePath()).toBe("/complete-profile");
    expect(
      completeProfilePath({ provider: "github", next: "/dashboard" })
    ).toBe("/complete-profile?provider=github&next=%2Fdashboard");
    expect(completeProfilePath({ next: "/onboarding" })).toBe(
      "/complete-profile?next=%2Fonboarding"
    );
  });

  it("never emits duplicated /auth/auth prefixes", () => {
    expect(completeProfilePath({ provider: "google" })).not.toMatch(/\/auth\/auth\b/);
    expect(authPagePath("login")).not.toMatch(/\/auth\/auth\b/);
    expect(LEGACY_COMPLETE_PROFILE_PATH).toBe("/auth/complete-profile");
    expect(LEGACY_COMPLETE_PROFILE_PATH).not.toBe(AUTH_PAGE_PATHS.completeProfile);
  });

  it("resolves auth-subdomain absolute URLs for complete-profile", () => {
    expect(
      resolveAuthPageHref("completeProfile", {
        hostname: "www.behalfid.com",
        protocol: "https:",
        query: { next: "/dashboard" }
      })
    ).toBe("https://auth.behalfid.com/complete-profile?next=%2Fdashboard");

    expect(
      resolveAuthPageHref("completeProfile", {
        hostname: "auth.behalfid.com",
        protocol: "https:"
      })
    ).toBe("/complete-profile");
  });

  it("keeps relative paths on apex and local development hosts", () => {
    expect(
      resolveAuthPageHref("completeProfile", {
        hostname: "behalfid.com",
        query: { provider: "github" }
      })
    ).toBe("/complete-profile?provider=github");

    expect(
      resolveAuthPageHref("completeProfile", {
        hostname: "localhost"
      })
    ).toBe("/complete-profile");
  });

  it("maps legacy /auth/complete-profile to the canonical path without loops", () => {
    expect(canonicalCompleteProfilePathFromLegacy("/auth/complete-profile")).toBe(
      "/complete-profile"
    );
    expect(canonicalCompleteProfilePathFromLegacy("/de/auth/complete-profile")).toBe(
      "/de/complete-profile"
    );
    expect(canonicalCompleteProfilePathFromLegacy("/complete-profile")).toBeNull();
    expect(canonicalCompleteProfilePathFromLegacy("/de/complete-profile")).toBeNull();
    expect(canonicalCompleteProfilePathFromLegacy("/login")).toBeNull();
    expect(isCanonicalCompleteProfilePath("/complete-profile?next=%2Fdashboard")).toBe(
      true
    );
    expect(isCanonicalCompleteProfilePath("/auth/complete-profile")).toBe(false);
  });

  it("builds legacy compatibility redirects that preserve query params", () => {
    expect(
      resolveLegacyCompleteProfileRedirect({
        pathname: "/auth/complete-profile",
        search: "?next=%2Fdashboard&provider=github",
        hostname: "auth.behalfid.com",
        protocol: "https:"
      })
    ).toBe("/complete-profile?next=%2Fdashboard&provider=github");

    expect(
      resolveLegacyCompleteProfileRedirect({
        pathname: "/auth/complete-profile",
        search: "?next=%2Fonboarding",
        hostname: "www.behalfid.com",
        protocol: "https:"
      })
    ).toBe("https://auth.behalfid.com/complete-profile?next=%2Fonboarding");

    expect(
      resolveLegacyCompleteProfileRedirect({
        pathname: "/complete-profile",
        search: "?next=%2Fdashboard",
        hostname: "auth.behalfid.com",
        protocol: "https:"
      })
    ).toBeNull();
  });
});
