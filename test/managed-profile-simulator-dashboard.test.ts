import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("managed profile simulator dashboard source", () => {
  const source = readFileSync(
    join(process.cwd(), "components/dashboard/ManagedProfilesView.tsx"),
    "utf-8"
  );

  it("includes simulator panel", () => {
    expect(source).toContain('data-testid="managed-profile-simulator"');
  });

  it("includes tool select", () => {
    expect(source).toContain('data-testid="simulator-tool-select"');
    expect(source).toContain('value="claude"');
    expect(source).toContain('value="codex"');
    expect(source).toContain('value="cursor"');
  });

  it("includes repo hash input", () => {
    expect(source).toContain('data-testid="simulator-repo-hash"');
  });

  it("renders mode and reason in result card", () => {
    expect(source).toContain('data-testid="simulator-result-mode"');
    expect(source).toContain('data-testid="simulator-result-reason"');
    expect(source).toContain("/api/cli/session-policy/simulate");
  });
});
