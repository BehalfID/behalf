import { describe, expect, it } from "vitest";
import {
  BehalfInstaller,
  createDefaultRuntimeRegistration,
  DEFAULT_RUNTIME_ID,
  DEFAULT_VERIFY_ENDPOINT,
} from "../src/installer/index.js";
import { BEHALF_MCP_SERVER_NAME } from "../src/types/index.js";
import {
  createTestEnvironment,
  FakeMcpConfigManager,
  FakePlatformDetector,
  FakeRuntimeRegistrar,
  FakeVerifier,
  MemoryStateManager,
} from "./fakes/index.js";

function createInstaller(overrides?: {
  detector?: FakePlatformDetector;
  configManager?: FakeMcpConfigManager;
  runtimeRegistrar?: FakeRuntimeRegistrar;
  stateManager?: MemoryStateManager;
  verifier?: FakeVerifier;
}) {
  const cursorPath = "/tmp/cursor/mcp.json";
  const vscodePath = "/tmp/vscode/mcp.json";

  const configManager = overrides?.configManager ?? new FakeMcpConfigManager();
  if (!configManager.configs.has(cursorPath)) {
    configManager.seed(cursorPath, {
      mcpServers: { other: { command: "echo" } },
    });
  }
  if (!configManager.configs.has(vscodePath)) {
    configManager.seed(vscodePath, { mcpServers: {} });
  }

  const detector =
    overrides?.detector ??
    new FakePlatformDetector(
      createTestEnvironment([
        {
          id: "cursor",
          name: "Cursor",
          installed: true,
          configPaths: { mcpConfigPath: cursorPath },
        },
        {
          id: "vscode",
          name: "VS Code",
          installed: true,
          configPaths: { mcpConfigPath: vscodePath },
        },
        {
          id: "windsurf",
          name: "Windsurf",
          installed: false,
          configPaths: {},
        },
      ]),
    );

  const verifier =
    overrides?.verifier ??
    new FakeVerifier({
      healthy: true,
      installerVersion: "0.1.0",
      installedVersion: "0.1.0",
      checkedAt: "2026-01-01T00:00:00.000Z",
      checks: [],
      runtimeInstalled: true,
      mcpRegistration: [],
      verifyEndpoint: {
        id: "verify-endpoint",
        name: "Verify endpoint",
        status: "pass",
        message: "ok",
      },
      packageVersions: {},
      configurationIntegrity: [],
    });

  const stateManager = overrides?.stateManager ?? new MemoryStateManager();

  return {
    installer: new BehalfInstaller({
      detector,
      configManager,
      runtimeRegistrar: overrides?.runtimeRegistrar ?? new FakeRuntimeRegistrar(),
      stateManager,
      verifier,
      runtimeVersion: "1.0.0",
      installerVersion: "0.1.0",
    }),
    configManager,
    detector,
    stateManager,
    cursorPath,
    vscodePath,
  };
}

describe("createDefaultRuntimeRegistration", () => {
  it("builds the default mcp-runtime registration payload", () => {
    const runtime = createDefaultRuntimeRegistration({ version: "1.2.3" });
    expect(runtime.id).toBe(DEFAULT_RUNTIME_ID);
    expect(runtime.serverName).toBe(BEHALF_MCP_SERVER_NAME);
    expect(runtime.command).toBe("npx");
    expect(runtime.args).toEqual(["-y", "@behalfid/mcp-runtime@1.2.3"]);
    expect(runtime.env?.BEHALFID_VERIFY_URL).toBe(DEFAULT_VERIFY_ENDPOINT);
  });
});

describe("BehalfInstaller", () => {
  it("reports not installed via status", async () => {
    const stateManager = new MemoryStateManager();
    const { installer } = createInstaller({ stateManager });
    await expect(installer.status()).resolves.toMatchObject({
      installed: false,
      installedVersion: null,
      installerVersion: "0.1.0",
    });
  });

  it("installs into detected clients and preserves unrelated MCP servers", async () => {
    const stateManager = new MemoryStateManager();
    const { installer, configManager, cursorPath } = createInstaller({ stateManager });

    const result = await installer.install();

    expect(result.success).toBe(true);
    expect(result.alreadyInstalled).toBe(false);
    expect(result.configuredClients.sort()).toEqual(["cursor", "vscode"]);
    expect(result.registeredRuntimes).toEqual([DEFAULT_RUNTIME_ID]);

    const cursorConfig = await configManager.read(cursorPath);
    expect(cursorConfig.mcpServers?.other).toEqual({ command: "echo" });
    expect(cursorConfig.mcpServers?.[BEHALF_MCP_SERVER_NAME]?.command).toBe("npx");

    const status = await installer.status();
    expect(status.installed).toBe(true);
    expect(status.installedVersion).toBe("1.0.0");
    expect(status.configuredClients).toHaveLength(2);
  });

  it("is idempotent when already installed", async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new FakeMcpConfigManager();
    const { installer, cursorPath, vscodePath } = createInstaller({
      stateManager,
      configManager,
    });

    await installer.install();
    const firstRegisterCount = configManager.registerCalls.length;

    const second = await installer.install();
    expect(second.success).toBe(true);
    expect(second.alreadyInstalled).toBe(true);
    expect(configManager.registerCalls.length).toBe(firstRegisterCount);

    expect(await configManager.hasRuntime(cursorPath, BEHALF_MCP_SERVER_NAME)).toBe(true);
    expect(await configManager.hasRuntime(vscodePath, BEHALF_MCP_SERVER_NAME)).toBe(true);
  });

  it("supports dry-run install without writing state or config", async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new FakeMcpConfigManager();
    const { installer, cursorPath } = createInstaller({ stateManager, configManager });

    const result = await installer.install({ dryRun: true });
    expect(result.success).toBe(true);
    expect(result.configuredClients.sort()).toEqual(["cursor", "vscode"]);
    expect(await stateManager.load()).toBeNull();
    expect(await configManager.hasRuntime(cursorPath, BEHALF_MCP_SERVER_NAME)).toBe(false);
    expect(configManager.registerCalls).toHaveLength(0);
  });

  it("rolls back configuration when registration fails mid-install", async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new FakeMcpConfigManager();
    const { installer, cursorPath, vscodePath } = createInstaller({
      stateManager,
      configManager,
    });

    configManager.failRegisterFor.add(vscodePath);

    const result = await installer.install();
    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.code === "RUNTIME_REGISTRATION_FAILED")).toBe(
      true,
    );
    expect(await configManager.hasRuntime(cursorPath, BEHALF_MCP_SERVER_NAME)).toBe(false);
    expect(await configManager.hasRuntime(vscodePath, BEHALF_MCP_SERVER_NAME)).toBe(false);
    expect(await stateManager.load()).toBeNull();

    const cursorConfig = await configManager.read(cursorPath);
    expect(cursorConfig.mcpServers?.other).toEqual({ command: "echo" });
  });

  it("upgrades an existing installation and preserves installedAt", async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new FakeMcpConfigManager();
    configManager.seed("/tmp/cursor/mcp.json", { mcpServers: {} });
    const detector = new FakePlatformDetector(
      createTestEnvironment([
        {
          id: "cursor",
          name: "Cursor",
          installed: true,
          configPaths: { mcpConfigPath: "/tmp/cursor/mcp.json" },
        },
      ]),
    );
    const verifier = new FakeVerifier({
      healthy: true,
      installerVersion: "0.1.0",
      installedVersion: "1.0.0",
      checkedAt: "2026-01-01T00:00:00.000Z",
      checks: [],
      runtimeInstalled: true,
      mcpRegistration: [],
      verifyEndpoint: {
        id: "verify-endpoint",
        name: "Verify endpoint",
        status: "pass",
        message: "ok",
      },
      packageVersions: {},
      configurationIntegrity: [],
    });

    const v1 = new BehalfInstaller({
      detector,
      configManager,
      runtimeRegistrar: new FakeRuntimeRegistrar(),
      stateManager,
      verifier,
      runtimeVersion: "1.0.0",
      installerVersion: "0.1.0",
    });
    await v1.install();
    const before = await stateManager.load();

    const v2 = new BehalfInstaller({
      detector,
      configManager,
      runtimeRegistrar: new FakeRuntimeRegistrar(),
      stateManager,
      verifier,
      runtimeVersion: "2.0.0",
      installerVersion: "0.1.0",
    });
    const upgraded = await v2.upgrade();
    expect(upgraded.success).toBe(true);
    expect(upgraded.previousVersion).toBe("1.0.0");
    expect(upgraded.currentVersion).toBe("2.0.0");
    expect(upgraded.migrated).toBe(true);

    const after = await stateManager.load();
    expect(after?.installedAt).toBe(before?.installedAt);
    expect(after?.installedVersion).toBe("2.0.0");
  });

  it("returns NOT_INSTALLED when upgrading without prior install", async () => {
    const { installer } = createInstaller();
    const result = await installer.upgrade();
    expect(result.success).toBe(false);
    expect(result.errors[0]?.code).toBe("NOT_INSTALLED");
  });

  it("maps corrupt state load failures to STATE_INVALID", async () => {
    const stateManager = new MemoryStateManager();
    stateManager.loadError = new Error("Installation state is invalid: schemaVersion");
    const { installer } = createInstaller({ stateManager });

    const result = await installer.install();
    expect(result.success).toBe(false);
    expect(result.errors[0]?.code).toBe("STATE_INVALID");
  });

  it("maps generic state load failures to STATE_READ_FAILED", async () => {
    const stateManager = new MemoryStateManager();
    stateManager.failOnLoad = true;
    const { installer } = createInstaller({ stateManager });

    const result = await installer.install();
    expect(result.success).toBe(false);
    expect(result.errors[0]?.code).toBe("STATE_READ_FAILED");
  });

  it("uninstalls clients, removes runtime entries, and clears state", async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new FakeMcpConfigManager();
    const { installer, cursorPath, vscodePath } = createInstaller({
      stateManager,
      configManager,
    });

    await installer.install();
    const result = await installer.uninstall();

    expect(result.success).toBe(true);
    expect(result.removedClients.sort()).toEqual(["cursor", "vscode"]);
    expect(result.stateCleared).toBe(true);
    expect(await configManager.hasRuntime(cursorPath, BEHALF_MCP_SERVER_NAME)).toBe(false);
    expect(await configManager.hasRuntime(vscodePath, BEHALF_MCP_SERVER_NAME)).toBe(false);
    expect(await stateManager.load()).toBeNull();

    const cursorConfig = await configManager.read(cursorPath);
    expect(cursorConfig.mcpServers?.other).toEqual({ command: "echo" });
  });

  it("delegates doctor to the verifier", async () => {
    const verifier = new FakeVerifier({
      healthy: false,
      installerVersion: "0.1.0",
      installedVersion: null,
      checkedAt: "2026-01-01T00:00:00.000Z",
      checks: [
        {
          id: "runtime",
          name: "Runtime",
          status: "fail",
          message: "missing",
        },
      ],
      runtimeInstalled: false,
      mcpRegistration: [],
      verifyEndpoint: {
        id: "verify-endpoint",
        name: "Verify endpoint",
        status: "skip",
        message: "skipped",
      },
      packageVersions: {},
      configurationIntegrity: [],
    });
    const { installer } = createInstaller({ verifier });
    const report = await installer.doctor();
    expect(report.healthy).toBe(false);
    expect(report.checks[0]?.id).toBe("runtime");
  });

  it("filters install targets by client id", async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new FakeMcpConfigManager();
    const { installer, cursorPath, vscodePath } = createInstaller({
      stateManager,
      configManager,
    });

    const result = await installer.install({ clients: ["cursor"] });
    expect(result.success).toBe(true);
    expect(result.configuredClients).toEqual(["cursor"]);
    expect(await configManager.hasRuntime(cursorPath, BEHALF_MCP_SERVER_NAME)).toBe(true);
    expect(await configManager.hasRuntime(vscodePath, BEHALF_MCP_SERVER_NAME)).toBe(false);
  });
});
