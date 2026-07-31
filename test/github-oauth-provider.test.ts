import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GITHUB_SCOPES,
  githubLoginProvider,
  pickVerifiedPrimaryEmail,
  splitDisplayName
} from "@/lib/authProviders/providers/github";

describe("GitHub login provider adapter", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("requests only read:user and user:email scopes", () => {
    expect(GITHUB_SCOPES).toEqual(["read:user", "user:email"]);
    expect(githubLoginProvider.scopes).toEqual(["read:user", "user:email"]);
  });

  it("does not advertise PKCE support because GitHub OAuth Apps omit RFC 7636", () => {
    expect(githubLoginProvider.supportsPkce).toBe(false);
  });

  it("reports unconfigured when OAuth secrets are missing", () => {
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    expect(githubLoginProvider.isConfigured()).toEqual({
      configured: false,
      reason: "GITHUB_OAUTH_CLIENT_ID is not set."
    });
  });

  it("accepts GITHUB_OAUTH_* env names and legacy GITHUB_* aliases", () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "cid";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "secret";
    expect(githubLoginProvider.isConfigured()).toEqual({ configured: true });
  });

  it("builds authorize URL with state and redirect_uri", () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "cid";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "secret";
    process.env.APP_BASE_URL = "https://app.example";

    const url = githubLoginProvider.buildAuthorizeUrl({
      requestOrigin: "https://ignored.example",
      mode: "login",
      codeChallenge: "challenge",
      state: "state-secret"
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://github.com");
    expect(parsed.searchParams.get("client_id")).toBe("cid");
    expect(parsed.searchParams.get("state")).toBe("state-secret");
    expect(parsed.searchParams.get("scope")).toBe("read:user user:email");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example/api/auth/github/callback"
    );
    expect(parsed.searchParams.get("code_challenge")).toBeNull();
  });
});

describe("pickVerifiedPrimaryEmail", () => {
  it("returns the verified primary email when present", () => {
    expect(
      pickVerifiedPrimaryEmail([
        { email: "other@example.com", primary: false, verified: true },
        { email: "Primary@Example.com", primary: true, verified: true }
      ])
    ).toBe("primary@example.com");
  });

  it("ignores unverified entries", () => {
    expect(
      pickVerifiedPrimaryEmail([
        { email: "unverified@example.com", primary: true, verified: false }
      ])
    ).toBeNull();
  });

  it("falls back to the first verified email when none is primary", () => {
    expect(
      pickVerifiedPrimaryEmail([
        { email: "backup@example.com", primary: false, verified: true }
      ])
    ).toBe("backup@example.com");
  });
});

describe("splitDisplayName", () => {
  it("splits a full name into first and last", () => {
    expect(splitDisplayName("Ada Lovelace")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace"
    });
  });

  it("returns null names for empty input", () => {
    expect(splitDisplayName(null)).toEqual({ firstName: null, lastName: null });
  });
});
