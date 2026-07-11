import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const SCRIPT = join(process.cwd(), "scripts", "release", "render-homebrew-formula.mjs");
const ARM_SHA = "a".repeat(64);
const X64_SHA = "b".repeat(64);

function render(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

describe("renderHomebrewFormula", () => {
  it("renders a complete standalone-binary formula for BehalfID/homebrew-tap", () => {
    const result = render([
      "--version",
      "0.2.9",
      "--darwin-arm64-url",
      "https://github.com/BehalfID/behalf/releases/download/v0.2.9/behalf-darwin-arm64.tar.gz",
      "--darwin-arm64-sha256",
      ARM_SHA,
      "--darwin-x64-url",
      "https://github.com/BehalfID/behalf/releases/download/v0.2.9/behalf-darwin-x64.tar.gz",
      "--darwin-x64-sha256",
      X64_SHA,
    ]);
    expect(result.status, result.stderr).toBe(0);
    const formula = result.stdout;
    expect(formula).toContain("Canonical tap: github.com/BehalfID/homebrew-tap");
    expect(formula).toContain('version "0.2.9"');
    expect(formula).toContain("behalf-darwin-arm64.tar.gz");
    expect(formula).toContain("behalf-darwin-x64.tar.gz");
    expect(formula).toContain(`sha256 "${ARM_SHA}"`);
    expect(formula).toContain(`sha256 "${X64_SHA}"`);
    expect(formula).toContain('bin.install "behalf"');
    expect(formula).toContain('bin.install_symlink "behalf" => "behalfid"');
    expect(formula).toContain("#{bin}/behalf --version");
    expect(formula).toContain("#{bin}/behalfid --version");
    expect(formula).not.toContain('depends_on "node"');
    expect(formula).not.toContain("potatobeyonddefeat");
    expect(formula).not.toContain("registry.npmjs.org");
  });

  it("writes --out and rejects invalid inputs", () => {
    const dir = mkdtempSync(join(tmpdir(), "behalf-formula-"));
    try {
      const out = join(dir, "Formula", "behalf.rb");
      const ok = render([
        "--version",
        "0.2.9",
        "--darwin-arm64-url",
        "https://example.com/a.tgz",
        "--darwin-arm64-sha256",
        ARM_SHA,
        "--darwin-x64-url",
        "https://example.com/b.tgz",
        "--darwin-x64-sha256",
        X64_SHA,
        "--out",
        out,
      ]);
      expect(ok.status, ok.stderr).toBe(0);
      expect(readFileSync(out, "utf8")).toContain('version "0.2.9"');

      const badVersion = render([
        "--version",
        "latest",
        "--darwin-arm64-url",
        "https://example.com/a.tgz",
        "--darwin-arm64-sha256",
        ARM_SHA,
        "--darwin-x64-url",
        "https://example.com/b.tgz",
        "--darwin-x64-sha256",
        X64_SHA,
      ]);
      expect(badVersion.status).not.toBe(0);

      const badSha = render([
        "--version",
        "0.2.9",
        "--darwin-arm64-url",
        "https://example.com/a.tgz",
        "--darwin-arm64-sha256",
        "nope",
        "--darwin-x64-url",
        "https://example.com/b.tgz",
        "--darwin-x64-sha256",
        X64_SHA,
      ]);
      expect(badSha.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects versions that only start with X.Y.Z (anchored match)", () => {
    // These all passed the old prefix-only /^[0-9]+\.[0-9]+\.[0-9]+/ check.
    for (const version of ["0.2.9-beta", "0.2.9x", "0.2.9.1", "0.2.9/../../x"]) {
      const result = render([
        "--version",
        version,
        "--darwin-arm64-url",
        "https://example.com/a.tgz",
        "--darwin-arm64-sha256",
        ARM_SHA,
        "--darwin-x64-url",
        "https://example.com/b.tgz",
        "--darwin-x64-sha256",
        X64_SHA,
      ]);
      expect(result.status, `version "${version}" should be rejected`).not.toBe(0);
      expect(result.stderr).toContain("invalid version");
    }
  });
});
