import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountAllowsEmailDomain,
  emailDomain,
  isPublicEmailDomain,
  normalizeEmailDomain,
  readWorkspaceSso,
  validateSsoDomainList
} from "@/lib/workspaceSso";
import { buildGoogleAuthorizeRedirect, createPkcePair, googleAuthHref, safeOAuthNextPath } from "@/lib/googleOAuth";
import { getPlanEntitlements } from "@/lib/plans";

describe("workspace SSO helpers", () => {
  it("extracts and normalizes email domains", () => {
    expect(emailDomain("Dev@Acme.COM")).toBe("acme.com");
    expect(emailDomain("bad")).toBeNull();
    expect(normalizeEmailDomain(" Acme.COM ")).toBe("acme.com");
    expect(normalizeEmailDomain("not a domain")).toBeNull();
    expect(normalizeEmailDomain("gmail.com")).toBe("gmail.com");
  });

  it("flags public email providers", () => {
    expect(isPublicEmailDomain("gmail.com")).toBe(true);
    expect(isPublicEmailDomain("acme.com")).toBe(false);
  });

  it("matches allowlisted domains", () => {
    expect(accountAllowsEmailDomain(["acme.com", "eng.acme.com"], "acme.com")).toBe(true);
    expect(accountAllowsEmailDomain(["acme.com"], "other.com")).toBe(false);
    expect(accountAllowsEmailDomain([], "acme.com")).toBe(false);
  });

  it("rejects public domains when enforce is on", () => {
    const result = validateSsoDomainList(["gmail.com"], { enforce: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Public email domains/);
    }
  });

  it("requires domains when enforce is on", () => {
    const result = validateSsoDomainList([], { enforce: true });
    expect(result.ok).toBe(false);
  });

  it("accepts company domains", () => {
    const result = validateSsoDomainList(["Acme.com", "eng.acme.com", "acme.com"], { enforce: true });
    expect(result).toEqual({ ok: true, domains: ["acme.com", "eng.acme.com"] });
  });

  it("reads workspace SSO config defaults", () => {
    expect(readWorkspaceSso(null)).toEqual({
      provider: "google",
      enabled: false,
      enforce: false,
      allowedEmailDomains: []
    });
    expect(
      readWorkspaceSso({
        sso: { enabled: true, enforce: true, allowedEmailDomains: ["Acme.COM"] }
      })
    ).toEqual({
      provider: "google",
      enabled: true,
      enforce: true,
      allowedEmailDomains: ["acme.com"]
    });
  });

  it("gates workspace SSO on plan entitlements", () => {
    expect(getPlanEntitlements("free").googleWorkspaceSsoEnabled).toBe(false);
    expect(getPlanEntitlements("team").googleWorkspaceSsoEnabled).toBe(true);
    expect(getPlanEntitlements("pro").googleWorkspaceSsoEnabled).toBe(true);
  });
});

describe("Google OAuth helpers", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://behalfid.com");
  });

  it("creates PKCE verifier/challenge pairs", () => {
    const pair = createPkcePair();
    expect(pair.verifier.length).toBeGreaterThan(20);
    expect(pair.challenge.length).toBeGreaterThan(20);
    expect(pair.verifier).not.toBe(pair.challenge);
  });

  it("rejects unsafe next paths", () => {
    expect(safeOAuthNextPath("/dashboard")).toBe("/dashboard");
    expect(safeOAuthNextPath("//evil.com")).toBeUndefined();
    expect(safeOAuthNextPath("https://evil.com")).toBeUndefined();
  });

  it("builds public Google auth hrefs", () => {
    expect(googleAuthHref("signup")).toBe("/api/auth/google?mode=signup");
    expect(googleAuthHref("login", "/dashboard")).toBe("/api/auth/google?mode=login&next=%2Fdashboard");
    expect(googleAuthHref("login", "//evil.com")).toBe("/api/auth/google?mode=login");
  });

  it("builds authorize URL with PKCE and state cookie", () => {
    const started = buildGoogleAuthorizeRedirect({
      requestOrigin: "https://behalfid.com",
      mode: "login",
      next: "/dashboard"
    });
    expect("error" in started).toBe(false);
    if ("error" in started) return;
    expect(started.url).toContain("accounts.google.com");
    expect(started.url).toContain("code_challenge_method=S256");
    expect(started.url).toContain(encodeURIComponent("https://behalfid.com/api/auth/google/callback"));
    expect(started.stateCookieValue).toContain(".");
  });

  it("uses auth host for redirect_uri when subdomain routing is enabled", () => {
    vi.stubEnv("BEHALFID_SUBDOMAIN_ROUTING", "1");
    vi.stubEnv("BEHALFID_HOST_AUTH", "auth.behalfid.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://behalfid.com");

    const started = buildGoogleAuthorizeRedirect({
      requestOrigin: "https://auth.behalfid.com",
      mode: "login",
      next: "/dashboard"
    });
    expect("error" in started).toBe(false);
    if ("error" in started) return;
    expect(started.url).toContain(
      encodeURIComponent("https://auth.behalfid.com/api/auth/google/callback")
    );
    expect(started.url).not.toContain(encodeURIComponent("https://behalfid.com/api/auth/google/callback"));
  });

  it("ignores marketing APP_BASE_URL when subdomain routing is on", () => {
    vi.stubEnv("BEHALFID_SUBDOMAIN_ROUTING", "1");
    vi.stubEnv("BEHALFID_HOST_AUTH", "auth.behalfid.com");
    vi.stubEnv("APP_BASE_URL", "https://www.behalfid.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://behalfid.com");

    // Even if the request somehow arrives with a non-auth origin, canonical auth host wins.
    const started = buildGoogleAuthorizeRedirect({
      requestOrigin: "https://www.behalfid.com",
      mode: "signup"
    });
    expect("error" in started).toBe(false);
    if ("error" in started) return;
    expect(started.url).toContain(
      encodeURIComponent("https://auth.behalfid.com/api/auth/google/callback")
    );
  });
});
