import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WORKFLOW = readFileSync(
  join(ROOT, ".github", "workflows", "package-release.yml"),
  "utf8"
);

const ALLOWED_KEYS = ["mcp-audit", "mcp-runtime", "egress-proxy", "install"] as const;
const ALLOWED_NAMES = [
  "@behalfid/mcp-audit",
  "@behalfid/mcp-runtime",
  "@behalfid/egress-proxy",
  "@behalfid/install",
] as const;

describe("package release workflow", () => {
  it("is workflow_dispatch-only with a fixed package allowlist", () => {
    expect(WORKFLOW).toContain("workflow_dispatch:");
    expect(WORKFLOW).not.toMatch(/\n\s+push:/);
    expect(WORKFLOW).not.toMatch(/\n\s+pull_request:/);
    for (const key of ALLOWED_KEYS) {
      expect(WORKFLOW).toContain(`- ${key}`);
    }
    expect(WORKFLOW).not.toContain("@behalfid/sdk");
    expect(WORKFLOW).not.toContain("@behalfid/cli");
    expect(WORKFLOW).not.toContain("packages/sdk");
    expect(WORKFLOW).not.toContain("packages/cli");
  });

  it("limits dist_tag to next or latest and scopes concurrency", () => {
    expect(WORKFLOW).toContain("- next");
    expect(WORKFLOW).toContain("- latest");
    expect(WORKFLOW).toContain(
      "group: package-release-${{ github.event.inputs.package }}"
    );
    expect(WORKFLOW).toContain("environment: npm-release");
    expect(WORKFLOW).toContain("contents: read");
    expect(WORKFLOW).toContain("id-token: write");
    expect(WORKFLOW).toContain("runs-on: ubuntu-latest");
  });

  it("verifies main tip and maps keys to fixed package directories", () => {
    expect(WORKFLOW).toContain("git rev-parse origin/main");
    expect(WORKFLOW).toContain(
      'if [ "$HEAD_COMMIT" != "$MAIN_COMMIT" ]; then'
    );
    expect(WORKFLOW).toContain('PACKAGE_DIR="packages/mcp-audit"');
    expect(WORKFLOW).toContain('PACKAGE_DIR="packages/mcp-runtime"');
    expect(WORKFLOW).toContain('PACKAGE_DIR="packages/egress-proxy"');
    expect(WORKFLOW).toContain('PACKAGE_DIR="packages/install"');
    for (const name of ALLOWED_NAMES) {
      expect(WORKFLOW).toContain(name);
    }
  });

  it("fails on existing npm versions and validates before publish", () => {
    expect(WORKFLOW).toContain("npm ci");
    expect(WORKFLOW).toContain("check-package-integrity.mjs");
    expect(WORKFLOW).toContain("pack-smoke.mjs");
    expect(WORKFLOW).toContain("npm publish --dry-run --access public");
    expect(WORKFLOW).toContain("npm auto-corrected");
    expect(WORKFLOW).toContain("git status --porcelain");
    expect(WORKFLOW).toContain(
      'npm view "${PACKAGE_NAME}@${EXPECTED_VERSION}" version --json'
    );
    expect(WORKFLOW).toContain(
      "npm publish --access public --provenance --tag \"$DIST_TAG\""
    );
    expect(WORKFLOW).toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(WORKFLOW).not.toContain("npm version");
  });

  it("documents the unpublished publish order", () => {
    expect(WORKFLOW).toContain("1. mcp-audit");
    expect(WORKFLOW).toContain("2. mcp-runtime");
    expect(WORKFLOW).toContain("3. egress-proxy");
    expect(WORKFLOW).toContain("4. install");
  });
});
