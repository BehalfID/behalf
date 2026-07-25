import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("dashboard account deletion UI", () => {
  it("settings page includes self-service delete account flow", () => {
    const clientSource = readFileSync(join(process.cwd(), "app/dashboard/client.tsx"), "utf-8");
    expect(clientSource).toContain('"/api/auth/account"');
    expect(clientSource).toContain("Delete account");
    expect(clientSource).toContain("Permanently delete account");
  });

  it("settings API no longer returns support-only danger zone text", () => {
    const routeSource = readFileSync(
      join(process.cwd(), "app/api/dashboard/settings/route.ts"),
      "utf-8"
    );
    expect(routeSource).not.toContain("accountDeletionSupportMessage");
  });
});
