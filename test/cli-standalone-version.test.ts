import {
  copyFileSync,
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PKG_JSON = join(ROOT, "packages", "cli", "package.json");
const PKG_VERSION = (
  JSON.parse(readFileSync(PKG_JSON, "utf8")) as { version: string }
).version;
const RELEASE_WORKFLOW = join(ROOT, ".github", "workflows", "cli-release.yml");
const BUILD_SCRIPT = join(ROOT, "scripts", "release", "build-cli-binaries.sh");
const DIST_INDEX = join(ROOT, "packages", "cli", "dist", "index.js");

function shellAvailable(cmd: string): boolean {
  const probe = spawnSync(cmd, ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return probe.status === 0;
}

describe("CLI standalone version embedding", () => {
  it("package metadata is 0.2.10", () => {
    expect(PKG_VERSION).toBe("0.2.10");
  });

  it("Node/npm CLI reports the package version", () => {
    const build = spawnSync("npm", ["run", "build:cli"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    expect(build.status, build.stderr + build.stdout).toBe(0);

    const ver = spawnSync(process.execPath, [DIST_INDEX, "--version"], {
      encoding: "utf8",
    });
    expect(ver.status, ver.stderr + ver.stdout).toBe(0);
    expect(ver.stdout.trim()).toBe(PKG_VERSION);
    expect(ver.stdout.trim()).toBe("0.2.10");
  }, 120_000);

  it("release workflow injects build-time version define and has no 0.2.9 pin", () => {
    const workflow = readFileSync(RELEASE_WORKFLOW, "utf8");
    const script = readFileSync(BUILD_SCRIPT, "utf8");

    expect(workflow).not.toMatch(/VERSION\s*!=\s*"0\.2\.9"/);
    expect(workflow).not.toMatch(/pinned to package version 0\.2\.9/);
    expect(workflow).toMatch(/build-cli-binaries\.sh/);
    expect(workflow).toContain("^v[0-9]+\\.[0-9]+\\.[0-9]+$");

    expect(script).toMatch(/__BEHALF_CLI_VERSION__/);
    expect(script).toMatch(/--define\s+"__BEHALF_CLI_VERSION__=\$\{CLI_VERSION_JSON\}"/);
    expect(script).toMatch(/CLI_VERSION_JSON=\$\(node -p "JSON\.stringify\(require\('\.\/package\.json'\)\.version\)"\)/);
  });

  it("package, tag, tarball, and binary version all derive from package.json", () => {
    const workflow = readFileSync(RELEASE_WORKFLOW, "utf8");
    const script = readFileSync(BUILD_SCRIPT, "utf8");
    const indexSrc = readFileSync(
      join(ROOT, "packages", "cli", "src", "index.ts"),
      "utf8"
    );

    expect(PKG_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    // Tag is derived as v${package version} in the integrity check.
    expect(workflow).toMatch(/v\$\{PKG_VERSION\}/);
    expect(workflow).toMatch(
      /require\('\.\/packages\/cli\/package\.json'\)\.version/
    );
    // npm tarball verifier receives the resolved workflow version explicitly.
    expect(workflow).toMatch(
      /verify-cli-artifact\.mjs "\$TARBALL" "\$\{\{ steps\.version\.outputs\.version \}\}"/
    );
    // Binary version comes from the same package.json via Bun --define.
    expect(script).toMatch(/require\('\.\/package\.json'\)\.version/);
    expect(indexSrc).toMatch(/__BEHALF_CLI_VERSION__/);
    expect(indexSrc).toMatch(/readFileSync\(join\(__dirname, "\.\.\/package\.json"/);
  });

  it.skipIf(process.platform !== "linux")(
    "standalone Linux executable reports package version and works outside the repo",
    () => {
    // Real Bun compile + execute; do not replace with source-text assertions.
    if (!shellAvailable("bun")) {
      throw new Error(
        "Bun is required on Linux to smoke-test the standalone CLI binary"
      );
    }

    const build = spawnSync("bash", [BUILD_SCRIPT, "linux-x64"], {
      encoding: "utf8",
      cwd: ROOT,
    });
    expect(build.status, build.stderr + build.stdout).toBe(0);

    const binary = join(ROOT, "packages", "cli", "bin", "behalf-linux-x64");
    expect(existsSync(binary)).toBe(true);

    const inRepo = spawnSync(binary, ["--version"], { encoding: "utf8" });
    expect(inRepo.status, inRepo.stderr + inRepo.stdout).toBe(0);
    expect(inRepo.stdout.replace(/\r/g, "").trim()).toBe(PKG_VERSION);

    const emptyDir = mkdtempSync(join(tmpdir(), "behalf-standalone-empty-"));
    try {
      const isolated = join(emptyDir, "behalf");
      copyFileSync(binary, isolated);
      chmodSync(isolated, 0o755);
      expect(existsSync(join(emptyDir, "package.json"))).toBe(false);

      const outside = spawnSync(isolated, ["--version"], {
        encoding: "utf8",
        cwd: emptyDir,
      });
      expect(outside.status, outside.stderr + outside.stdout).toBe(0);
      expect(outside.stdout.replace(/\r/g, "").trim()).toBe(PKG_VERSION);
      expect(outside.stdout.replace(/\r/g, "").trim()).toBe("0.2.10");
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  },
    300_000
  );
});
