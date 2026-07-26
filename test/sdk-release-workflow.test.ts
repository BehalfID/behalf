import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WORKFLOW = readFileSync(
  join(ROOT, ".github", "workflows", "sdk-release.yml"),
  "utf8"
);
const SDK_PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "packages", "sdk", "package.json"), "utf8")
) as { name: string; version: string };

describe("SDK release workflow", () => {
  it("uses a package-specific immutable semver tag", () => {
    expect(WORKFLOW).toContain('- "sdk-v*"');
    expect(WORKFLOW).not.toContain('- "v*"');
    expect(WORKFLOW).toContain(
      "grep -Eq '^sdk-v[0-9]+\\.[0-9]+\\.[0-9]+$'"
    );
    expect(WORKFLOW).toContain('VERSION="${TAG#sdk-v}"');
    expect(SDK_PACKAGE.name).toBe("@behalfid/sdk");
    expect(SDK_PACKAGE.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("checks out the tag and proves it is on main", () => {
    expect(WORKFLOW).toContain("ref: ${{ steps.version.outputs.tag }}");
    expect(WORKFLOW).toContain(
      'PKG_VERSION=$(node -p "require(\'./packages/sdk/package.json\').version")'
    );
    expect(WORKFLOW).toContain('if [ "sdk-v${PKG_VERSION}" != "$TAG" ]; then');
    expect(WORKFLOW).toContain(
      'git merge-base --is-ancestor "$TAG_COMMIT" origin/main'
    );
  });

  it("builds, tests, installs the tarball, and dry-runs before publishing", () => {
    expect(WORKFLOW).toContain("npm run build:sdk");
    expect(WORKFLOW).toContain("test/sdk-exports.test.ts");
    expect(WORKFLOW).toContain("npm run test:sdk:pack");
    expect(WORKFLOW).toContain(
      "npm publish --dry-run --access public --provenance=false"
    );
    expect(WORKFLOW).toContain("npm publish --access public --provenance");
    expect(WORKFLOW).toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(WORKFLOW).not.toContain("npm version");
  });
});
