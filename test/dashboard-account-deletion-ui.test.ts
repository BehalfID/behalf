import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("dashboard account deletion UI", () => {
  it("settings page includes connected accounts section", () => {
    const clientSource = readFileSync(join(process.cwd(), "app/dashboard/client.tsx"), "utf-8");
    expect(clientSource).toContain("LinkedAccountsSection");
    expect(clientSource).toContain("#account-security");
  });

  it("settings page mounts provider-aware AccountDeletionSection", () => {
    const clientSource = readFileSync(join(process.cwd(), "app/dashboard/client.tsx"), "utf-8");
    expect(clientSource).toContain("AccountDeletionSection");
    expect(clientSource).not.toContain("deletePassword");
  });

  it("deletion UI is provider-aware and does not hard-require password", () => {
    const source = readFileSync(
      join(process.cwd(), "components/dashboard/AccountDeletionSection.tsx"),
      "utf-8"
    );
    expect(source).toContain("/api/auth/reauth/methods");
    expect(source).toContain("Continue with GitHub");
    expect(source).toContain("Continue with Google");
    expect(source).toContain("Verify with passkey");
    expect(source).toContain("Permanently delete account");
    expect(source).toContain("hasPassword");
    expect(source).toContain('githubAuthHref("reauth"');
    expect(source).toContain('googleAuthHref("reauth"');
    expect(source).toContain("/api/auth/account");
    // Password field is conditional — not always required.
    expect(source).toContain("{hasPassword ? (");
    expect(source).not.toContain("Enter your password");
  });

  it("settings API no longer returns support-only danger zone text", () => {
    const routeSource = readFileSync(
      join(process.cwd(), "app/api/dashboard/settings/route.ts"),
      "utf-8"
    );
    expect(routeSource).not.toContain("accountDeletionSupportMessage");
  });
});
