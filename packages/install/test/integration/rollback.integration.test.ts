import { writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { BEHALF_MCP_SERVER_NAME } from "../../src/types/index.js";
import {
  FailOnRegisterMcpConfigManager,
  cleanupAllIntegrationFixtures,
  createIntegrationFixture,
  mockFetchOk,
  readJsonFile,
} from "./helpers.js";

afterEach(async () => {
  await cleanupAllIntegrationFixtures();
});

describe("integration: rollback and malformed config", () => {
  it("rolls back MCP config when registration fails mid-install", async () => {
    const fixture = await createIntegrationFixture({
      runtimeVersion: "1.0.0",
      fetchImpl: mockFetchOk,
    });

    const failingManager = new FailOnRegisterMcpConfigManager(
      fixture.configManager,
      new Set([fixture.paths.vscodeMcp]),
    );

    const { BehalfInstaller } = await import("../../src/installer/BehalfInstaller.js");
    const { MemoryRuntimeRegistrar } = await import("../../src/runtime/MemoryRuntimeRegistrar.js");
    const { InstallationVerifier } = await import("../../src/verification/InstallationVerifier.js");
    const { createDefaultRuntimeCatalog } = await import("../../src/runtime/catalog.js");

    const catalog = createDefaultRuntimeCatalog();
    const installer = new BehalfInstaller({
      detector: fixture.detector,
      configManager: failingManager,
      runtimeRegistrar: new MemoryRuntimeRegistrar(),
      stateManager: fixture.stateManager,
      verifier: new InstallationVerifier({
        stateManager: fixture.stateManager,
        configManager: failingManager,
        fetchImpl: mockFetchOk,
      }),
      createRuntimeRegistration: (input) =>
        catalog.get("mcp-runtime")!.createRegistration(input),
      runtimeVersion: "1.0.0",
    });

    const vscodeBefore = await readJsonFile(fixture.paths.vscodeMcp);
    const result = await installer.install();
    expect(result.success).toBe(false);

    const vscodeAfter = await readJsonFile(fixture.paths.vscodeMcp);
    expect(vscodeAfter).toEqual(vscodeBefore);

    expect(await fixture.configManager.hasRuntime(fixture.paths.cursorMcp, BEHALF_MCP_SERVER_NAME)).toBe(
      false,
    );

    const state = await fixture.stateManager.load();
    expect(state).toBeNull();

    await fixture.cleanup();
  });

  it("rejects malformed MCP JSON and leaves the file untouched on write attempts", async () => {
    const fixture = await createIntegrationFixture();
    await writeFile(fixture.paths.cursorMcp, "{ not valid json", "utf8");

    await expect(fixture.configManager.read(fixture.paths.cursorMcp)).rejects.toThrow();

    const result = await fixture.installer.install();
    expect(result.success).toBe(false);

    const raw = await (await import("node:fs/promises")).readFile(fixture.paths.cursorMcp, "utf8");
    expect(raw).toBe("{ not valid json");

    await fixture.cleanup();
  });

  it("reports doctor failures for missing runtime registration after partial tampering", async () => {
    const fixture = await createIntegrationFixture({
      runtimeVersion: "1.0.0",
      fetchImpl: mockFetchOk,
    });

    await fixture.installer.install();
    await writeFile(
      fixture.paths.cursorMcp,
      `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`,
      "utf8",
    );

    const report = await fixture.installer.doctor();
    expect(report.healthy).toBe(false);
    expect(report.checks.some((c) => c.id.startsWith("mcp-registration:") && c.status === "fail")).toBe(
      true,
    );

    await fixture.cleanup();
  });
});
