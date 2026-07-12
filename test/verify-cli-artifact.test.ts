import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const VERIFIER = join(process.cwd(), "scripts", "release", "verify-cli-artifact.mjs");

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("verify-cli-artifact", () => {
  it("accepts a locally packed CLI tarball for 0.2.11", () => {
    const build = spawnSync("npm", ["run", "build:cli"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    expect(build.status, build.stderr + build.stdout).toBe(0);

    const pack = spawnSync("npm", ["pack", "--json"], {
      cwd: join(process.cwd(), "packages", "cli"),
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    expect(pack.status, pack.stderr + pack.stdout).toBe(0);
    const meta = JSON.parse(pack.stdout) as Array<{ filename: string }>;
    const filename = meta[0]?.filename;
    expect(filename).toMatch(/behalfid-cli-0\.2\.11\.tgz$/);
    const tarball = join(process.cwd(), "packages", "cli", filename);

    const verify = spawnSync(process.execPath, [VERIFIER, tarball, "0.2.11"], {
      encoding: "utf8",
    });
    expect(verify.status, verify.stderr + verify.stdout).toBe(0);
    expect(verify.stdout).toMatch(/verify-cli-artifact: OK/);
    expect(verify.stdout).toMatch(/policyContext/);
    expect(sha256File(tarball)).toMatch(/^[a-f0-9]{64}$/);
  }, 120_000);

  it("rejects a tarball missing hook mappings", () => {
    const dir = mkdtempSync(join(tmpdir(), "behalf-bad-pack-"));
    try {
      const pkg = join(dir, "package");
      mkdirSync(join(pkg, "dist", "commands"), { recursive: true });
      writeFileSync(
        join(pkg, "package.json"),
        JSON.stringify({ name: "@behalfid/cli", version: "0.2.11" })
      );
      writeFileSync(join(pkg, "dist", "index.js"), "console.log('0.2.11')\n");
      writeFileSync(join(pkg, "dist", "commands", "hook.js"), "export const x = 1;\n");
      const tarball = join(dir, "bad.tgz");
      const tar = spawnSync("tar", ["-czf", tarball, "-C", dir, "package"], { encoding: "utf8" });
      expect(tar.status).toBe(0);

      const verify = spawnSync(process.execPath, [VERIFIER, tarball, "0.2.11"], {
        encoding: "utf8",
      });
      expect(verify.status).not.toBe(0);
      expect(verify.stderr + verify.stdout).toMatch(/missing required token|policyContext/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
