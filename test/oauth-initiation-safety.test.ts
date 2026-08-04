import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { oauthInitFailureRedirect, readOAuthMode } from "@/lib/authProviders/oauthInitFailure";
import { OAUTH_ERROR_CODES } from "@/lib/authProviders/oauthErrors";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

/** Minimal NextRequest stand-in: the helper only reads nextUrl. */
function req(url: string) {
  return { nextUrl: new URL(url) } as never;
}

describe("OAuth initiation cannot produce a download", () => {
  it("GitHub and Google initiation guard their throwing region", () => {
    for (const path of ["app/api/auth/github/route.ts", "app/api/auth/google/route.ts"]) {
      const file = source(path);
      expect(file).toContain("oauthInitFailureRedirect");
      expect(file).toMatch(/try\s*\{/);
      expect(file).toContain("catch (error)");
    }
  });

  it("returns a redirect (never a body) for initiation failures", () => {
    const res = oauthInitFailureRedirect(req("https://x.test/api/auth/github?mode=login"), "redirect_failed", "login");
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toContain("/login");
    expect(location).toContain("oauth_error=redirect_failed");
    expect(res.body).toBeNull();
  });

  it("preserves mode and a safe next", () => {
    const res = oauthInitFailureRedirect(
      req("https://x.test/api/auth/github?mode=signup&next=%2Fpricing"),
      "provider_unconfigured",
      "signup"
    );
    const location = res.headers.get("location")!;
    expect(location).toContain("/signup");
    expect(location).toContain("next=%2Fpricing");
  });

  it("drops unsafe external next values", () => {
    for (const bad of ["https://evil.example.com", "//evil.example.com", "javascript:alert(1)"]) {
      const res = oauthInitFailureRedirect(
        req(`https://x.test/api/auth/github?mode=login&next=${encodeURIComponent(bad)}`),
        "redirect_failed",
        "login"
      );
      expect(res.headers.get("location")).not.toContain("evil.example.com");
      expect(res.headers.get("location")).not.toContain("javascript:");
    }
  });

  it("emits only known error codes", () => {
    const res = oauthInitFailureRedirect(req("https://x.test/api/auth/google?mode=login"), "provider_unconfigured", "login");
    const code = new URL(res.headers.get("location")!).searchParams.get("oauth_error")!;
    expect(OAUTH_ERROR_CODES).toContain(code);
  });

  it("reads the flow mode", () => {
    expect(readOAuthMode("signup")).toBe("signup");
    expect(readOAuthMode("reauth")).toBe("reauth");
    expect(readOAuthMode(null)).toBe("login");
    expect(readOAuthMode("bogus")).toBe("login");
  });

  it("no provider anchor sets a download attribute", () => {
    for (const path of [
      "components/auth/ContinueWithGitHub.tsx",
      "components/auth/ContinueWithGoogle.tsx",
      "app/auth-client.tsx",
      "app/[locale]/auth-client.tsx"
    ]) {
      expect(source(path)).not.toMatch(/\bdownload\b\s*(=|\})/);
    }
  });

  it("keeps the escape-hatch prop out of the DOM", () => {
    // `unstyled` must be destructured, never spread onto the anchor.
    for (const path of ["components/auth/ContinueWithGitHub.tsx", "components/auth/ContinueWithGoogle.tsx"]) {
      expect(source(path)).toMatch(/unstyled\s*=\s*false,/);
    }
  });
});

describe("locale login preserves next like the root route", () => {
  it("locale login and signup read and sanitise next", () => {
    for (const path of ["app/[locale]/login/page.tsx", "app/[locale]/signup/page.tsx"]) {
      const file = source(path);
      expect(file).toContain("searchParams");
      expect(file).toContain("safeNextPath");
      expect(file).toContain("nextPath={nextPath}");
    }
  });

  it("locale client honours nextPath with the root precedence", () => {
    const file = source("app/[locale]/auth-client.tsx");
    expect(file).toContain("safeNextPath(nextPath)");
    expect(file).toContain("assignOwnedLocation(redirectPath)");
    // Same guard as the root route: reject non-relative and protocol-relative paths.
    expect(file).toContain('next.startsWith("//")');
    expect(file).toContain('!next.startsWith("/")');
  });

  it("forwards next to the provider buttons", () => {
    const file = source("app/[locale]/auth-client.tsx");
    expect(file).toContain("next={nextPath}");
    expect(file).toContain("nextPath={nextPath}");
  });
});
