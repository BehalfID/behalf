import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const clientSource = readFileSync(
  join(process.cwd(), "app/authenticate/authenticate-client.tsx"),
  "utf-8"
);

describe("AuthenticateClient", () => {
  it("uses a plain anchor for switch-account logout so Link prefetch cannot clear the session", () => {
    expect(clientSource).toContain('href="/logout?next=/authenticate"');
    expect(clientSource).not.toContain('Link href="/logout');
    expect(clientSource).not.toMatch(/from ["']next\/link["']/);
  });
});
