import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  githubOAuthBaseUrl,
  githubRedirectUri
} from "@/lib/authProviders/providers/github";

describe("githubOAuthBaseUrl / redirect_uri", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.GITHUB_OAUTH_BASE_URL;
    delete process.env.APP_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.BEHALFID_SUBDOMAIN_ROUTING;
    delete process.env.BEHALFID_HOST_AUTH;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("uses auth host when subdomain routing is enabled (ignores marketing APP_BASE_URL)", () => {
    process.env.BEHALFID_SUBDOMAIN_ROUTING = "1";
    process.env.BEHALFID_HOST_AUTH = "auth.behalfid.com";
    process.env.APP_BASE_URL = "https://behalfid.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://www.behalfid.com";

    expect(githubOAuthBaseUrl("https://auth.behalfid.com")).toBe(
      "https://auth.behalfid.com"
    );
    expect(githubRedirectUri("https://auth.behalfid.com")).toBe(
      "https://auth.behalfid.com/api/auth/github/callback"
    );
    // Even if initiation somehow sees www, canonical auth host wins.
    expect(githubRedirectUri("https://www.behalfid.com")).toBe(
      "https://auth.behalfid.com/api/auth/github/callback"
    );
  });

  it("keeps localhost / preview request origins for non-prod hosts", () => {
    process.env.BEHALFID_SUBDOMAIN_ROUTING = "1";
    process.env.BEHALFID_HOST_AUTH = "auth.behalfid.com";
    expect(githubOAuthBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(githubOAuthBaseUrl("https://preview-abc.vercel.app")).toBe(
      "https://preview-abc.vercel.app"
    );
  });

  it("honors GITHUB_OAUTH_BASE_URL override", () => {
    process.env.BEHALFID_SUBDOMAIN_ROUTING = "1";
    process.env.BEHALFID_HOST_AUTH = "auth.behalfid.com";
    process.env.GITHUB_OAUTH_BASE_URL = "https://auth.staging.example.com";
    expect(githubOAuthBaseUrl("https://auth.behalfid.com")).toBe(
      "https://auth.staging.example.com"
    );
  });

  it("falls back to APP_BASE_URL when subdomain routing is off", () => {
    process.env.APP_BASE_URL = "https://behalfid.com";
    expect(githubRedirectUri("https://ignored.example")).toBe(
      "https://behalfid.com/api/auth/github/callback"
    );
  });
});
