import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();

function tempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

async function loadModules(home: string) {
  vi.resetModules();
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("BEHALFID_BASE_URL", "http://localhost:3000");
  return {
    antigravity: await import("../packages/cli/src/lib/antigravity"),
    doctor: await import("../packages/cli/src/commands/doctor"),
    config: await import("../packages/cli/src/lib/config"),
  };
}

function writeFileEnsuringDir(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  process.chdir(originalCwd);
});

describe("installAntigravityHook", () => {
  it("writes the namespaced PreToolUse entry and is idempotent", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);

    expect(antigravity.hasAntigravityHook(home)).toBe(false);

    const first = antigravity.installAntigravityHook(home);
    expect(first.ok).toBe(true);
    expect(first.ok && first.changed).toBe(true);
    expect(antigravity.hasAntigravityHook(home)).toBe(true);

    const file = JSON.parse(readFileSync(antigravity.antigravityHooksPath(home), "utf-8"));
    expect(file.behalfid.PreToolUse).toEqual([
      { matcher: ".*", hooks: [{ type: "command", command: "behalf hook antigravity" }] },
    ]);

    const second = antigravity.installAntigravityHook(home);
    expect(second.ok && !second.changed).toBe(true);
    const after = JSON.parse(readFileSync(antigravity.antigravityHooksPath(home), "utf-8"));
    expect(after.behalfid.PreToolUse).toHaveLength(1);
  });

  it("preserves other namespaces and existing entries", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);
    const path = antigravity.antigravityHooksPath(home);
    writeFileEnsuringDir(
      path,
      JSON.stringify({
        cmux: {
          PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "cmux hooks feed" }] }],
          Stop: [{ hooks: [{ type: "command", command: "cmux hooks stop" }] }],
        },
      })
    );

    const result = antigravity.installAntigravityHook(home);
    expect(result.ok).toBe(true);

    const file = JSON.parse(readFileSync(path, "utf-8"));
    expect(file.cmux.PreToolUse[0].hooks[0].command).toBe("cmux hooks feed");
    expect(file.cmux.Stop).toBeDefined();
    expect(file.behalfid.PreToolUse[0].hooks[0].command).toBe("behalf hook antigravity");
  });

  it("refuses to touch a malformed hooks file and reports the failure", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);
    const path = antigravity.antigravityHooksPath(home);
    writeFileEnsuringDir(path, "{ not json");

    const result = antigravity.installAntigravityHook(home);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("malformed");
    expect(readFileSync(path, "utf-8")).toBe("{ not json");
    expect(antigravity.getAntigravityHookStatus(home).status).toBe("malformed");
  });
});

describe("uninstallAntigravityHook", () => {
  it("removes only the BehalfID entry and drops the empty namespace", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);
    const path = antigravity.antigravityHooksPath(home);
    writeFileEnsuringDir(
      path,
      JSON.stringify({
        cmux: { PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "cmux hooks feed" }] }] },
      })
    );
    antigravity.installAntigravityHook(home);
    expect(antigravity.hasAntigravityHook(home)).toBe(true);

    const result = antigravity.uninstallAntigravityHook(home);
    expect(result.status).toBe("removed");
    expect(antigravity.hasAntigravityHook(home)).toBe(false);

    const file = JSON.parse(readFileSync(path, "utf-8"));
    expect(file.behalfid).toBeUndefined();
    expect(file.cmux.PreToolUse[0].hooks[0].command).toBe("cmux hooks feed");
  });

  it("reports not_found when nothing is installed", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);

    expect(antigravity.uninstallAntigravityHook(home).status).toBe("not_found");
  });
});

describe("installAntigravityMcpServer", () => {
  it("creates the shared MCP config when no config exists", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);

    const results = antigravity.installAntigravityMcpServer(home);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].path).toBe(join(home, ".gemini", "config", "mcp_config.json"));

    const file = JSON.parse(readFileSync(results[0].path, "utf-8"));
    expect(file.mcpServers.behalfid).toEqual({ command: "behalf", args: ["mcp", "start"] });
  });

  it("merges into every existing MCP config file, preserving other servers", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);
    const [sharedPath, legacyPath] = antigravity.antigravityMcpConfigPaths(home);
    writeFileEnsuringDir(sharedPath, JSON.stringify({ mcpServers: { github: { serverUrl: "https://x/mcp" } } }));
    writeFileEnsuringDir(legacyPath, JSON.stringify({ mcpServers: {} }));

    const results = antigravity.installAntigravityMcpServer(home);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);

    const shared = JSON.parse(readFileSync(sharedPath, "utf-8"));
    expect(shared.mcpServers.github.serverUrl).toBe("https://x/mcp");
    expect(shared.mcpServers.behalfid.command).toBe("behalf");
    const legacy = JSON.parse(readFileSync(legacyPath, "utf-8"));
    expect(legacy.mcpServers.behalfid.command).toBe("behalf");

    // Idempotent.
    const again = antigravity.installAntigravityMcpServer(home);
    expect(again.every((r) => r.ok && !r.changed)).toBe(true);
  });

  it("refuses to touch a malformed MCP config", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);
    const [sharedPath] = antigravity.antigravityMcpConfigPaths(home);
    writeFileEnsuringDir(sharedPath, "not json");

    const results = antigravity.installAntigravityMcpServer(home);
    expect(results[0].ok).toBe(false);
    expect(!results[0].ok && results[0].code).toBe("malformed");
    expect(readFileSync(sharedPath, "utf-8")).toBe("not json");
  });

  it("uninstall removes the BehalfID entry from every config file", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);
    const [sharedPath, legacyPath] = antigravity.antigravityMcpConfigPaths(home);
    writeFileEnsuringDir(legacyPath, JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    antigravity.installAntigravityMcpServer(home);
    expect(antigravity.hasAntigravityMcpServer(home)).toBe(true);

    const results = antigravity.uninstallAntigravityMcpServer(home);
    expect(results.find((r) => r.path === legacyPath)?.status).toBe("removed");
    expect(antigravity.hasAntigravityMcpServer(home)).toBe(false);

    const legacy = JSON.parse(readFileSync(legacyPath, "utf-8"));
    expect(legacy.mcpServers.other.command).toBe("x");
    if (existsSync(sharedPath)) {
      const shared = JSON.parse(readFileSync(sharedPath, "utf-8"));
      expect(shared.mcpServers?.behalfid).toBeUndefined();
    }
  });
});

describe("installer write robustness", () => {
  it("creates a .behalfid.bak backup before modifying an existing file", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);
    const path = antigravity.antigravityHooksPath(home);
    const original = JSON.stringify({
      cmux: { PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "cmux hooks feed" }] }] },
    });
    writeFileEnsuringDir(path, original);

    const result = antigravity.installAntigravityHook(home);
    expect(result.ok).toBe(true);

    const backupPath = path + antigravity.ANTIGRAVITY_BACKUP_SUFFIX;
    expect(existsSync(backupPath)).toBe(true);
    // The backup is the pre-change content — a full manual rollback point.
    expect(readFileSync(backupPath, "utf-8")).toBe(original);
    const restored = JSON.parse(readFileSync(backupPath, "utf-8"));
    expect(restored.behalfid).toBeUndefined();
  });

  it("does not create a backup when creating a brand-new file", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);

    antigravity.installAntigravityHook(home);
    const path = antigravity.antigravityHooksPath(home);
    expect(existsSync(path)).toBe(true);
    expect(existsSync(path + antigravity.ANTIGRAVITY_BACKUP_SUFFIX)).toBe(false);
  });

  it("preserves existing file permissions across a rewrite", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);
    const path = antigravity.antigravityHooksPath(home);
    writeFileEnsuringDir(path, JSON.stringify({}));
    chmodSync(path, 0o640);
    const modeBeforeRewrite = statSync(path).mode & 0o777;

    const result = antigravity.installAntigravityHook(home);
    expect(result.ok).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(modeBeforeRewrite);
  });

  it("leaves no temp files behind after a successful write", async () => {
    const home = tempDir("behalf-home-");
    const { antigravity } = await loadModules(home);

    antigravity.installAntigravityHook(home);
    antigravity.installAntigravityMcpServer(home);

    const configDir = dirname(antigravity.antigravityHooksPath(home));
    const leftovers = readdirSync(configDir).filter((f) => f.includes("behalfid-tmp"));
    expect(leftovers).toEqual([]);
  });

  it("leaves the original file intact when the atomic rename fails mid-write", async () => {
    const home = tempDir("behalf-home-");
    vi.resetModules();
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs")>();
      return {
        ...actual,
        renameSync: () => {
          throw new Error("EIO: simulated interrupted rename");
        },
      };
    });
    const antigravity = await import("../packages/cli/src/lib/antigravity");
    const path = antigravity.antigravityHooksPath(home);
    const original = JSON.stringify({ other: { PreToolUse: [] } });
    writeFileEnsuringDir(path, original);

    const result = antigravity.installAntigravityHook(home);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("unwritable");
    // Never a truncated or partial target file.
    expect(readFileSync(path, "utf-8")).toBe(original);
    // Temp file cleaned up.
    const leftovers = readdirSync(dirname(path)).filter((f) => f.includes("behalfid-tmp"));
    expect(leftovers).toEqual([]);

    vi.doUnmock("node:fs");
    vi.resetModules();
  });
});

describe("doctor Antigravity checks", () => {
  it("reports the Antigravity hook as warn before install and ok after", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { antigravity, doctor } = await loadModules(home);

    const before = await doctor.runDoctorChecks(project);
    const hookBefore = before.find((c) => c.name === "Antigravity hook");
    expect(hookBefore?.status).toBe("warn");
    expect(hookBefore?.fix).toContain("behalf antigravity install");
    expect(before.find((c) => c.name === "Antigravity MCP")?.status).toBe("warn");

    antigravity.installAntigravityHook(home);
    antigravity.installAntigravityMcpServer(home);

    const after = await doctor.runDoctorChecks(project);
    const hookAfter = after.find((c) => c.name === "Antigravity hook");
    expect(hookAfter?.status).toBe("warn");
    expect(hookAfter?.detail).toContain("enforcement is unsupported on tested Antigravity CLI 1.1.2");
    expect(hookAfter?.detail).toContain("denied actions may still execute");
    const mcpAfter = after.find((c) => c.name === "Antigravity MCP");
    expect(mcpAfter?.status).toBe("ok");
    expect(mcpAfter?.detail).toContain("Advisory BehalfID MCP server");
  });

  it("reports a malformed hooks file as an error", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { antigravity, doctor } = await loadModules(home);
    writeFileEnsuringDir(antigravity.antigravityHooksPath(home), "{ nope");

    const checks = await doctor.runDoctorChecks(project);
    const hookCheck = checks.find((c) => c.name === "Antigravity hook");
    expect(hookCheck?.status).toBe("error");
    expect(hookCheck?.detail).toContain("malformed");
  });
});
