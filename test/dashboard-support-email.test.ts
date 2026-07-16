import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL } from "@/lib/support";

const BROKEN_SUPPORT_EMAIL = "support@[REDACTED].com";

describe("dashboard support email", () => {
  it("exports the correct support email constant", () => {
    expect(SUPPORT_EMAIL).toBe("support@behalfid.com"); // pragma: allowlist secret
  });

  it("lib/support.ts is the single source of truth for the support email", () => {
    const supportSource = readFileSync(join(process.cwd(), "lib/support.ts"), "utf-8");
    expect(supportSource).toContain('SUPPORT_EMAIL = "support@behalfid.com"'); // pragma: allowlist secret
    expect(supportSource).not.toContain(BROKEN_SUPPORT_EMAIL);
  });

  it("dashboard settings paths do not contain the broken support email placeholder", () => {
    const paths = [
      "app/api/dashboard/settings/route.ts",
      "app/dashboard/client.tsx",
      "lib/support.ts",
    ];

    for (const relativePath of paths) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf-8");
      expect(source, relativePath).not.toContain(BROKEN_SUPPORT_EMAIL);
    }
  });
});
