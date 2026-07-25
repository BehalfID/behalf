import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { BEHALF_MCP_SERVER_NAME } from "../../src/types/index.js";
import {
  cleanupAllIntegrationFixtures,
  createIntegrationFixture,
  mockFetchOk,
  readJsonFile,
} from "./helpers.js";

afterEach(async () => {
  await cleanupAllIntegrationFixtures();
});

describe("integration: install lifecycle", () => {
  it("performs a fresh install across detected clients and preserves unrelated MCP servers", async () => {
    const fixture = await createIntegrationFixture({
      runtimeVersion: "1.0.0",
      installerVersion: "0.1.0",
      fetchImpl: mockFetchOk,
    });

    const result = await fixture.installer.install();
    expect(result.success).toBe(true);
    expect(result.alreadyInstalled).toBe(false);
    expect(result.configuredClients.sort()).toEqual([
      "claude-code",
      "claude-desktop",
      "codex",
      "cursor",
      "vscode",
      "windsurf",
    ]);

    const cursorConfig = (await readJsonFile(fixture.paths.cursorMcp)) as {
      mcpServers: Record<string, unknown>;
    };
    expect(cursorConfig.mcpServers.filesystem).toBeDefined();
    expect(cursorConfig.mcpServers[BEHALF_MCP_SERVER_NAME]).toBeDefined();

    const vscodeConfig = (await readJsonFile(fixture.paths.vscodeMcp)) as {
      servers: Record<string, unknown>;
    };
    expect(vscodeConfig.servers.github).toBeDefined();
    expect(vscodeConfig.servers[BEHALF_MCP_SERVER_NAME]).toMatchObject({
      type: "stdio",
      command: "npx",
    });

    const codexRaw = await readFile(fixture.paths.codexConfig, "utf8");
    expect(codexRaw).toContain("[mcp_servers.other]");
    expect(codexRaw).toContain("[mcp_servers.behalfid]");

    const state = await fixture.stateManager.load();
    expect(state?.installedVersion).toBe("1.0.0");
    expect(state?.configuredClients).toHaveLength(6);

    await fixture.cleanup();
  });

  it("is idempotent on repeated installation", async () => {
    const fixture = await createIntegrationFixture({
      runtimeVersion: "1.0.0",
      fetchImpl: mockFetchOk,
    });

    const first = await fixture.installer.install();
    expect(first.success).toBe(true);

    const cursorAfterFirst = await readFile(fixture.paths.cursorMcp, "utf8");
    const second = await fixture.installer.install();
    expect(second.success).toBe(true);
    expect(second.alreadyInstalled).toBe(true);

    const cursorAfterSecond = await readFile(fixture.paths.cursorMcp, "utf8");
    expect(cursorAfterSecond).toBe(cursorAfterFirst);

    await fixture.cleanup();
  });

  it("upgrades version while preserving installedAt", async () => {
    const { BehalfInstaller } = await import("../../src/installer/BehalfInstaller.js");
    const { MemoryRuntimeRegistrar } = await import("../../src/runtime/MemoryRuntimeRegistrar.js");
    const { InstallationVerifier } = await import("../../src/verification/InstallationVerifier.js");
    const { createDefaultRuntimeCatalog } = await import("../../src/runtime/catalog.js");

    const fixture = await createIntegrationFixture({
      runtimeVersion: "1.0.0",
      fetchImpl: mockFetchOk,
    });

    await fixture.installer.install();
    const installedAt = (await fixture.stateManager.load())?.installedAt;

    const catalog = createDefaultRuntimeCatalog();
    const upgrader = new BehalfInstaller({
      detector: fixture.detector,
      configManager: fixture.configManager,
      runtimeRegistrar: new MemoryRuntimeRegistrar(),
      stateManager: fixture.stateManager,
      verifier: new InstallationVerifier({
        stateManager: fixture.stateManager,
        configManager: fixture.configManager,
        fetchImpl: mockFetchOk,
      }),
      createRuntimeRegistration: (input) =>
        catalog.get("mcp-runtime")!.createRegistration(input),
      runtimeVersion: "2.0.0",
      installerVersion: "0.1.0",
    });

    const upgradeResult = await upgrader.upgrade();
    expect(upgradeResult.success).toBe(true);
    expect(upgradeResult.previousVersion).toBe("1.0.0");
    expect(upgradeResult.currentVersion).toBe("2.0.0");

    const after = await fixture.stateManager.load();
    expect(after?.installedAt).toBe(installedAt);
    expect(after?.installedVersion).toBe("2.0.0");

    const cursorConfig = (await readJsonFile(fixture.paths.cursorMcp)) as {
      mcpServers: Record<string, { args?: string[] }>;
    };
    expect(cursorConfig.mcpServers[BEHALF_MCP_SERVER_NAME]?.args?.[1]).toContain("@2.0.0");

    await fixture.cleanup();
  });

  it("uninstalls and clears state", async () => {
    const fixture = await createIntegrationFixture({
      runtimeVersion: "1.0.0",
      fetchImpl: mockFetchOk,
    });

    await fixture.installer.install();
    const removed = await fixture.installer.uninstall();
    expect(removed.success).toBe(true);
    expect(removed.removedClients.length).toBeGreaterThan(0);
    expect(removed.stateCleared).toBe(true);

    expect(await fixture.configManager.hasRuntime(fixture.paths.cursorMcp, BEHALF_MCP_SERVER_NAME)).toBe(
      false,
    );

    const cursorConfig = (await readJsonFile(fixture.paths.cursorMcp)) as {
      mcpServers: Record<string, unknown>;
    };
    expect(cursorConfig.mcpServers.filesystem).toBeDefined();

    const status = await fixture.installer.status();
    expect(status.installed).toBe(false);

    await fixture.cleanup();
  });
});
