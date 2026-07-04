import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

function tempHome() {
  return mkdtempSync(join(tmpdir(), "behalf-profile-"));
}

async function loadProfileModules(home: string) {
  vi.resetModules();
  vi.stubEnv("HOME", home);
  return import("../packages/cli/src/commands/profile.js");
}

function seedFakeBinary(home: string, tool: string): string {
  const binDir = join(home, "real-bin");
  mkdirSync(binDir, { recursive: true });
  const binPath = join(binDir, tool);
  writeFileSync(binPath, `#!/usr/bin/env bash\necho ${tool}\n`, { mode: 0o755 });
  chmodSync(binPath, 0o755);
  const currentPath = process.env.PATH ?? "";
  vi.stubEnv("PATH", `${binDir}${delimiter}${currentPath}`);
  return binPath;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("managed profile shims", () => {
  it("generates shim content without secrets", async () => {
    const home = tempHome();
    const { generateShimContent } = await loadProfileModules(home);
    const { shimContainsSecrets } = await import("../packages/cli/src/lib/profile/shims.js");
    const content = generateShimContent("claude");
    expect(content).toContain("ID_SHIM_v1");
    expect(content).toContain("__shim-launch claude");
    expect(shimContainsSecrets(content)).toBe(false);
  });

  it("installs shims idempotently", async () => {
    const home = tempHome();
    seedFakeBinary(home, "claude");
    const mod = await loadProfileModules(home);
    const first = mod.installShims({ tools: ["claude"] });
    expect(first[0]?.status).toBe("installed");
    expect(existsSync(first[0]!.shimPath)).toBe(true);
    expect(mod.isBehalfManagedShim(first[0]!.shimPath)).toBe(true);

    const second = mod.installShims({ tools: ["claude"] });
    expect(second[0]?.status).toBe("installed");
  });

  it("refuses to overwrite unmanaged files", async () => {
    const home = tempHome();
    seedFakeBinary(home, "codex");
    const mod = await loadProfileModules(home);
    const shimPath = join(home, ".behalf", "bin", "codex");
    mkdirSync(join(home, ".behalf", "bin"), { recursive: true });
    writeFileSync(shimPath, "#!/bin/bash\necho native\n", { mode: 0o755 });

    const result = mod.installShims({ tools: ["codex"] });
    expect(result[0]?.status).toBe("refused");
    expect(mod.isBehalfManagedShim(shimPath)).toBe(false);
  });

  it("resolves real binary path excluding shim directory", async () => {
    const home = tempHome();
    const realPath = seedFakeBinary(home, "cursor");
    const mod = await loadProfileModules(home);
    mod.installShims({ tools: ["cursor"] });
    expect(mod.resolveRealBinaryPath("cursor")).toBe(realPath);
  });

  it("warns when PATH ordering puts shims after real tool", async () => {
    const home = tempHome();
    const realDir = join(home, "real-bin");
    mkdirSync(realDir, { recursive: true });
    writeFileSync(join(realDir, "claude"), "#!/bin/bash\n", { mode: 0o755 });
    const shimDir = join(home, ".behalf", "bin");
    mkdirSync(shimDir, { recursive: true });
    vi.stubEnv("PATH", `${realDir}${delimiter}${shimDir}`);

    const mod = await loadProfileModules(home);
    const check = mod.checkPathOrdering("claude");
    expect(check.binDirPrecedesRealTool).toBe(false);
    expect(check.pathHint).toContain("PATH");
  });

  it("uninstall removes only managed shims", async () => {
    const home = tempHome();
    seedFakeBinary(home, "claude");
    const mod = await loadProfileModules(home);
    mod.installShims({ tools: ["claude"] });
    const removed = mod.uninstallShims({ tools: ["claude"] });
    expect(removed[0]?.status).toBe("removed");
    expect(existsSync(removed[0]!.shimPath)).toBe(false);
  });

  it("parses pause duration strings", async () => {
    const mod = await loadProfileModules(tempHome());
    expect(mod.parseDuration("30m")).toBe(30);
    expect(mod.parseDuration("2h")).toBe(120);
  });
});

describe("parseDuration errors", () => {
  it("rejects invalid duration", async () => {
    const mod = await loadProfileModules(tempHome());
    expect(() => mod.parseDuration("abc")).toThrow(/Duration/);
  });
});
