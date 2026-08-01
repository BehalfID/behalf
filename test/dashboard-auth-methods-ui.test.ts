import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard authentication methods UI", () => {
  it("exposes Authentication methods nav and LinkedAccountsSection with passkeys", async () => {
    const clientSource = await readFile(
      join(process.cwd(), "app/dashboard/client.tsx"),
      "utf8"
    );
    expect(clientSource).toContain("LinkedAccountsSection");
    expect(clientSource).toContain("#account-security");
    expect(clientSource).toContain("Authentication methods");
    expect(clientSource).toMatch(/Password,\s*GitHub,\s*passkeys/);
    expect(clientSource).not.toContain('label: "Connected accounts"');
  });

  it("renders passkey management controls in LinkedAccountsSection", async () => {
    const source = await readFile(
      join(process.cwd(), "components/dashboard/LinkedAccountsSection.tsx"),
      "utf8"
    );
    expect(source).toContain("Authentication methods");
    expect(source).toContain("Passkeys");
    expect(source).toContain("Add passkey");
    expect(source).toContain("Rename");
    expect(source).toContain("Remove");
    expect(source).toContain("Last signed in with");
    expect(source).toContain("Most recently used");
    expect(source).toContain("Last used unknown");
    expect(source).toContain("/api/auth/passkey/register/options");
    expect(source).toContain("/api/auth/passkeys");
    expect(source).toContain("PublicKeyCredential");
  });

  it("keeps login passkey entrypoint for discoverable credentials", async () => {
    const authClient = await readFile(join(process.cwd(), "app/auth-client.tsx"), "utf8");
    expect(authClient).toMatch(/Sign in with a passkey|ContinueWithPasskey/);
    const continuePasskey = await readFile(
      join(process.cwd(), "components/auth/ContinueWithPasskey.tsx"),
      "utf8"
    );
    expect(continuePasskey).toMatch(/Sign in with a passkey/);
  });
});
