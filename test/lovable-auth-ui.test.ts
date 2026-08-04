import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

const shell = source("components/auth/lovable/AuthShell.tsx");
const authClient = source("app/auth-client.tsx");
const localeAuthClient = source("app/[locale]/auth-client.tsx");
const generatedCss = source("app/lovable-utilities.generated.css");

describe("Lovable auth UI (Phase 3)", () => {
  it("uses the Lovable split-screen shell with the source grid ratio", () => {
    expect(shell).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]");
    // `.ds` must be an ancestor of the utilities, never the same element:
    // the scoped stylesheet emits `.ds <utility>` (descendant) selectors.
    expect(shell).toMatch(/className="ds"\s*>/);
    expect(shell).toContain("grid min-h-dvh overflow-x-clip lg:grid-cols-");
  });

  it("emits the auth split-screen grid utility into the scoped stylesheet", () => {
    expect(generatedCss).toContain("minmax(0,520px)");
  });

  it("keeps the Lovable product panel: grid field, brand, shield points, status link", () => {
    expect(shell).toContain("grid-field opacity-40");
    expect(shell).toContain("hidden flex-col justify-between border-r bg-surface-2 p-10 lg:flex");
    expect(shell).toContain("ShieldCheck");
    expect(shell).toContain("View live status");
  });

  it("uses the Lovable form control classes", () => {
    expect(shell).toContain("h-9 w-full rounded-md border border-input bg-transparent");
    expect(shell).toContain("shadow-sm");
    expect(shell).toContain("focus-visible:ring-1 focus-visible:ring-ring");
  });

  it("does not introduce Lovable auth backends or routing", () => {
    for (const file of [shell, authClient, localeAuthClient]) {
      expect(file).not.toMatch(/@supabase\/supabase-js/);
      expect(file).not.toMatch(/supabase\.auth/);
      expect(file).not.toMatch(/@tanstack\/react-router/);
      expect(file).not.toMatch(/from "sonner"/);
    }
  });

  describe("production auth capabilities are preserved", () => {
    it("keeps passkey, GitHub and Google entry points in the recommended order", () => {
      // Measure inside the rendered provider block, not the import list.
      const body = authClient.slice(authClient.indexOf("{showOauth || showPasskey ?"));
      const passkey = body.indexOf("ContinueWithPasskey");
      const github = body.indexOf("ContinueWithGitHub");
      const google = body.indexOf("ContinueWithGoogle");
      const divider = body.indexOf("<AuthDivider");
      const email = body.indexOf('htmlFor="auth-email"');
      expect(passkey).toBeGreaterThan(-1);
      expect(github).toBeGreaterThan(passkey);
      expect(google).toBeGreaterThan(github);
      expect(divider).toBeGreaterThan(google);
      expect(email).toBeGreaterThan(divider);
    });

    it("keeps the production endpoints and redirect helpers", () => {
      expect(authClient).toContain("/api/auth/mfa/verify");
      expect(authClient).toContain("`/api/auth/${mode}`");
      expect(authClient).toContain("assignOwnedLocation(redirectPath)");
      expect(authClient).toContain("credentials: \"include\"");
    });

    it("keeps signup date-of-birth with the 13-year minimum", () => {
      expect(authClient).toContain('id="auth-date-of-birth"');
      expect(authClient).toContain("maxDateOfBirth(13)");
      expect(authClient).toContain("You must be at least 13 years old to create an account.");
    });

    it("keeps the MFA challenge screen and forgot-password link", () => {
      expect(authClient).toContain('id="auth-mfa-code"');
      expect(authClient).toContain("one-time-code");
      expect(authClient).toContain('href="/forgot-password"');
    });

    it("keeps signup legal links", () => {
      expect(authClient).toContain('href="/terms"');
      expect(authClient).toContain('href="/privacy"');
    });
  });

  it("migrates the remaining auth surfaces onto the shared shell", () => {
    for (const path of [
      "app/forgot-password/client.tsx",
      "app/reset-password/client.tsx",
      "app/verify-email/client.tsx",
      "app/complete-profile/complete-profile-client.tsx",
      "app/authenticate/authenticate-client.tsx"
    ]) {
      expect(source(path)).toContain("@/components/auth/lovable/AuthShell");
    }
  });

  it("keeps the production submission endpoints on the migrated pages", () => {
    expect(source("app/forgot-password/client.tsx")).toContain("/api/auth/forgot-password");
    expect(source("app/reset-password/client.tsx")).toContain("/api/auth/reset-password");
  });

  it("provider buttons expose presentation-only overrides that keep OAuth behaviour", () => {
    const github = source("components/auth/ContinueWithGitHub.tsx");
    const google = source("components/auth/ContinueWithGoogle.tsx");
    const passkey = source("components/auth/ContinueWithPasskey.tsx");
    expect(github).toContain("unstyled");
    expect(google).toContain("unstyled");
    expect(passkey).toContain("buttonClassName");
    // The OAuth hrefs and the full-navigation anchor must be untouched.
    expect(github).toContain("githubAuthHref");
    expect(google).toContain("googleAuthHref");
  });
});
