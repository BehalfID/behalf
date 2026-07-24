import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostPlatformDetector } from "../src/detection/HostPlatformDetector.js";
import type { CommandExistsFn } from "../src/detection/fs.js";
import { createBehalfInstaller } from "../src/installer/BehalfInstaller.js";
import { FileMcpConfigManager } from "../src/mcp/FileMcpConfigManager.js";
import { MemoryRuntimeRegistrar } from "../src/runtime/MemoryRuntimeRegistrar.js";
import { FileStateManager } from "../src/state/FileStateManager.js";
import { BEHALF_MCP_SERVER_NAME } from "../src/types/index.js";
import { InstallationVerifier } from "../src/verification/InstallationVerifier.js";
import { FailOnRegisterMcpConfigManager } from "./integration/helpers.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createHarness() {
  const root = await mkdtemp(join(tmpdir(), "behalf-install-harden-"));
  tempRoots.push(root);

  const homeDir = join(root, "home");
  const cwd = join(root, "project");
  const cursorMcp = join(homeDir, ".cursor", "mcp.json");
  const vscodeMcp = join(cwd, ".vscode", "mcp.json");
  const codexConfig = join(homeDir, ".codex", "config.toml");
  const stateFile = join(homeDir, ".behalfid", "install-state.json");

  await mkdir(join(homeDir, ".cursor"), { recursive: true });
  await mkdir(join(cwd, ".vscode"), { recursive: true });
  await mkdir(join(homeDir, ".codex"), { recursive: true });

  const cursorOriginal = {
    mcpServers: {
      filesystem: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        env: { HOME: "/tmp" },
      },
      remote: { url: "https://example.com/mcp" },
      keepMe: { command: "echo", args: ["hello"] },
    },
    preferences: { theme: "dark" },
  };
  await writeFile(cursorMcp, `${JSON.stringify(cursorOriginal, null, 2)}\n`, "utf8");
  await writeFile(
    vscodeMcp,
    `${JSON.stringify(
      {
        servers: {
          github: { type: "stdio", command: "gh", args: ["mcp"] },
          sse: { type: "sse", url: "https://example.com/sse" },
        },
        inputs: [{ id: "token" }],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    codexConfig,
    'model = "gpt-5"\n\n[mcp_servers.shell]\ncommand = "node"\nargs = ["shell.js"]\n',
    "utf8",
  );

  const commandExists: CommandExistsFn = async () => true;
  const detector = new HostPlatformDetector({
    homeDir,
    cwd,
    platform: "linux",
    env: {},
    commandExists,
  });
  const configManager = new FileMcpConfigManager();
  const stateManager = new FileStateManager({ stateFilePath: stateFile });
  const installer = createBehalfInstaller({
    detector,
    configManager,
    runtimeRegistrar: new MemoryRuntimeRegistrar(),
    stateManager,
    verifier: new InstallationVerifier({
      stateManager,
      configManager,
      fetchImpl: async () => ({ status: 200, ok: true }),
    }),
    runtimeVersion: "1.0.0",
    installerVersion: "0.1.0",
  });

  return {
    root,
    homeDir,
    cwd,
    cursorMcp,
    vscodeMcp,
    codexConfig,
    cursorOriginal,
    detector,
    installer,
    configManager,
    stateManager,
  };
}

function createInstaller(
  harness: Awaited<ReturnType<typeof createHarness>>,
  overrides: {
    configManager?: FileMcpConfigManager | FailOnRegisterMcpConfigManager;
    runtimeVersion?: string;
  } = {},
) {
  const configManager = overrides.configManager ?? harness.configManager;
  return createBehalfInstaller({
    detector: harness.detector,
    configManager: configManager as FileMcpConfigManager,
    runtimeRegistrar: new MemoryRuntimeRegistrar(),
    stateManager: harness.stateManager,
    verifier: new InstallationVerifier({
      stateManager: harness.stateManager,
      configManager: harness.configManager,
      fetchImpl: async () => ({ status: 200, ok: true }),
    }),
    runtimeVersion: overrides.runtimeVersion ?? "1.0.0",
    installerVersion: "0.1.0",
  });
}

describe("installer hardening — backup / rollback / upgrade / uninstall / doctor", () => {
  it("backs up before mutation and restores on mid-install failure", async () => {
    const harness = await createHarness();
    const before = await readFile(harness.cursorMcp, "utf8");
    const failing = new FailOnRegisterMcpConfigManager(
      harness.configManager,
      new Set([harness.vscodeMcp]),
    );
    const installer = createInstaller(harness, { configManager: failing });

    const result = await installer.install({ clients: ["cursor", "vscode"] });
    expect(result.success).toBe(false);
    expect(await readFile(harness.cursorMcp, "utf8")).toBe(before);
    expect(await harness.stateManager.load()).toBeNull();
  });

  it("is idempotent: a second install reports alreadyInstalled and leaves config unchanged", async () => {
    const harness = await createHarness();
    const first = await harness.installer.install({ clients: ["cursor"] });
    expect(first.success).toBe(true);
    expect(first.alreadyInstalled).toBe(false);

    const afterFirst = await readFile(harness.cursorMcp, "utf8");
    const second = await harness.installer.install({ clients: ["cursor"] });
    expect(second.success).toBe(true);
    expect(second.alreadyInstalled).toBe(true);
    expect(await readFile(harness.cursorMcp, "utf8")).toBe(afterFirst);
  });

  it("upgrades the runtime package pin without dropping unrelated servers", async () => {
    const harness = await createHarness();
    await harness.installer.install({ clients: ["cursor", "codex"] });

    const upgraded = createInstaller(harness, { runtimeVersion: "2.0.0" });
    const result = await upgraded.upgrade({ clients: ["cursor", "codex"] });
    expect(result.success).toBe(true);
    expect(result.previousVersion).toBe("1.0.0");
    expect(result.currentVersion).toBe("2.0.0");

    const cursor = JSON.parse(await readFile(harness.cursorMcp, "utf8")) as {
      mcpServers: Record<string, { args?: string[] }>;
      preferences?: unknown;
    };
    expect(cursor.preferences).toEqual({ theme: "dark" });
    expect(cursor.mcpServers.filesystem).toBeDefined();
    expect(cursor.mcpServers.remote).toEqual({ url: "https://example.com/mcp" });
    expect(cursor.mcpServers[BEHALF_MCP_SERVER_NAME]?.args?.[1]).toContain("@2.0.0");

    const codex = await readFile(harness.codexConfig, "utf8");
    expect(codex).toContain('model = "gpt-5"');
    expect(codex).toContain("[mcp_servers.shell]");
    expect(codex).toContain("@2.0.0");
  });

  it("uninstall removes BehalfID and leaves unrelated servers intact", async () => {
    const harness = await createHarness();
    await harness.installer.install({ clients: ["cursor", "vscode"] });

    const removed = await harness.installer.uninstall();
    expect(removed.success).toBe(true);
    expect(removed.stateCleared).toBe(true);

    const cursor = JSON.parse(await readFile(harness.cursorMcp, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(cursor.mcpServers[BEHALF_MCP_SERVER_NAME]).toBeUndefined();
    expect(cursor.mcpServers.filesystem).toBeDefined();
    expect(cursor.mcpServers.remote).toBeDefined();
    expect(cursor.mcpServers.keepMe).toBeDefined();

    const vscode = JSON.parse(await readFile(harness.vscodeMcp, "utf8")) as {
      servers: Record<string, unknown>;
      inputs?: unknown;
    };
    expect(vscode.servers[BEHALF_MCP_SERVER_NAME]).toBeUndefined();
    expect(vscode.servers.github).toBeDefined();
    expect(vscode.inputs).toEqual([{ id: "token" }]);
  });

  it("doctor passes after a clean install and fails after registration tampering", async () => {
    const harness = await createHarness();
    await harness.installer.install({ clients: ["cursor"] });

    const healthy = await harness.installer.doctor();
    expect(healthy.healthy).toBe(true);
    expect(healthy.runtimeInstalled).toBe(true);
    expect(healthy.verifyEndpoint.status).toBe("pass");

    await writeFile(
      harness.cursorMcp,
      `${JSON.stringify({ mcpServers: { filesystem: { command: "echo" } } }, null, 2)}\n`,
      "utf8",
    );

    const sick = await harness.installer.doctor();
    expect(sick.healthy).toBe(false);
    expect(
      sick.checks.some(
        (check) =>
          check.id.startsWith("mcp-registration:") && check.status === "fail",
      ),
    ).toBe(true);
  });
});

describe("installer hardening — --wrap without corrupting existing client config", () => {
  it("rewrites only wrappable stdio servers and preserves everything else", async () => {
    const harness = await createHarness();

    const result = await harness.installer.install({
      clients: ["cursor"],
      wrapExisting: true,
      agentId: "agent_wrap",
      apiKey: "bhf_sk_wrap",
      force: true,
    });
    expect(result.success).toBe(true);

    const config = JSON.parse(await readFile(harness.cursorMcp, "utf8")) as {
      mcpServers: Record<
        string,
        { command?: string; args?: string[]; env?: Record<string, string>; url?: string }
      >;
      preferences?: unknown;
    };

    expect(config.preferences).toEqual({ theme: "dark" });
    expect(config.mcpServers.remote).toEqual({ url: "https://example.com/mcp" });
    expect(config.mcpServers[BEHALF_MCP_SERVER_NAME]?.command).toBe("npx");

    expect(config.mcpServers.filesystem?.env?.BEHALFID_DOWNSTREAM_COMMAND).toBe("npx");
    expect(JSON.parse(config.mcpServers.filesystem?.env?.BEHALFID_DOWNSTREAM_ARGS ?? "[]")).toEqual([
      "-y",
      "@modelcontextprotocol/server-filesystem",
      "/tmp",
    ]);
    expect(JSON.parse(config.mcpServers.filesystem?.env?.BEHALFID_DOWNSTREAM_ENV ?? "{}")).toEqual({
      HOME: "/tmp",
    });
    expect(config.mcpServers.keepMe?.env?.BEHALFID_DOWNSTREAM_COMMAND).toBe("echo");

    expect(Object.keys(config.mcpServers).sort()).toEqual(
      ["behalfid", "filesystem", "keepMe", "remote"].sort(),
    );
  });

  it("restores original server entries on uninstall after --wrap", async () => {
    const harness = await createHarness();
    await harness.installer.install({
      clients: ["cursor"],
      wrapExisting: true,
      agentId: "agent_wrap",
      apiKey: "bhf_sk_wrap",
      force: true,
    });

    const uninstall = await harness.installer.uninstall({ clients: ["cursor"] });
    expect(uninstall.success).toBe(true);

    const restored = JSON.parse(await readFile(harness.cursorMcp, "utf8")) as {
      mcpServers: Record<string, unknown>;
      preferences?: unknown;
    };
    expect(restored.preferences).toEqual({ theme: "dark" });
    expect(restored.mcpServers[BEHALF_MCP_SERVER_NAME]).toBeUndefined();
    expect(restored.mcpServers.filesystem).toEqual(
      harness.cursorOriginal.mcpServers.filesystem,
    );
    expect(restored.mcpServers.keepMe).toEqual(
      harness.cursorOriginal.mcpServers.keepMe,
    );
    expect(restored.mcpServers.remote).toEqual(
      harness.cursorOriginal.mcpServers.remote,
    );
  });

  it("does not double-wrap an already wrapped configuration", async () => {
    const harness = await createHarness();
    await harness.installer.install({
      clients: ["cursor"],
      wrapExisting: true,
      agentId: "agent_wrap",
      apiKey: "bhf_sk_wrap",
      force: true,
    });

    const second = await harness.installer.install({
      clients: ["cursor"],
      wrapExisting: true,
      agentId: "agent_wrap",
      apiKey: "bhf_sk_wrap",
      force: true,
    });
    expect(second.success).toBe(true);
    expect(
      second.warnings.some((warning) => warning.code === "SERVER_WRAP_SKIPPED"),
    ).toBe(true);

    const afterSecond = JSON.parse(await readFile(harness.cursorMcp, "utf8")) as {
      mcpServers: Record<string, { args?: string[]; env?: Record<string, string> }>;
    };
    expect(afterSecond.mcpServers.filesystem?.env?.BEHALFID_DOWNSTREAM_COMMAND).toBe(
      "npx",
    );
    expect(afterSecond.mcpServers.filesystem?.args?.join(" ")).not.toContain(
      "BEHALFID_DOWNSTREAM_COMMAND",
    );
    // Nested wrap would put the interceptor package into DOWNSTREAM_ARGS.
    expect(afterSecond.mcpServers.filesystem?.env?.BEHALFID_DOWNSTREAM_ARGS).not.toContain(
      "@behalfid/mcp-runtime",
    );
  });

  it("requires credentials for --wrap and leaves config untouched when they are missing", async () => {
    const harness = await createHarness();
    const before = await readFile(harness.cursorMcp, "utf8");

    const result = await harness.installer.install({
      clients: ["cursor"],
      wrapExisting: true,
    });

    expect(result.success).toBe(false);
    expect(await readFile(harness.cursorMcp, "utf8")).toBe(before);
  });
});
