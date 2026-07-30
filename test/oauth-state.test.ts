import { describe, expect, it } from "vitest";
import {
  createPkcePair,
  generateOAuthStateSecret,
  hashOAuthState,
  safeOAuthNextPath
} from "@/lib/authProviders/oauthState";
import { oauthErrorMessage } from "@/lib/authProviders/oauthErrors";
import { oauthOnlyLoginMessage } from "@/lib/authProviders/loginHints";

describe("OAuth state helpers", () => {
  it("hashes state secrets deterministically", () => {
    const secret = "test-state-secret";
    expect(hashOAuthState(secret)).toHaveLength(64);
    expect(hashOAuthState(secret)).toBe(hashOAuthState(secret));
  });

  it("generates high-entropy state secrets", () => {
    expect(generateOAuthStateSecret()).not.toBe(generateOAuthStateSecret());
  });

  it("creates PKCE pairs with matching verifier and challenge", async () => {
    const crypto = await import("crypto");
    const { verifier, challenge } = createPkcePair();
    const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  it("rejects unsafe next paths", () => {
    expect(safeOAuthNextPath("/dashboard")).toBe("/dashboard");
    expect(safeOAuthNextPath("//evil.example")).toBeUndefined();
    expect(safeOAuthNextPath("https://evil.example")).toBeUndefined();
  });
});

describe("oauthErrorMessage", () => {
  it("uses non-enumerating copy for requires_explicit_link", () => {
    expect(oauthErrorMessage("requires_explicit_link")).toMatch(/sign in to BehalfID first/i);
    expect(oauthErrorMessage("requires_explicit_link")).not.toMatch(/already exists/i);
  });
});

describe("oauthOnlyLoginMessage", () => {
  it("names GitHub for github-only accounts", () => {
    expect(oauthOnlyLoginMessage(["github"])).toMatch(/GitHub/);
  });

  it("lists multiple providers", () => {
    expect(oauthOnlyLoginMessage(["github", "google"])).toMatch(/GitHub/);
    expect(oauthOnlyLoginMessage(["github", "google"])).toMatch(/Google/);
  });
});
