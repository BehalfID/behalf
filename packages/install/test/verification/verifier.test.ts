import { describe, expect, it } from "vitest";
import { createInstallationState } from "../../src/state/InstallationState.js";
import { BEHALF_MCP_SERVER_NAME } from "../../src/types/index.js";
import {
  createInstallationVerifier,
  isHealthy,
  probeVerifyEndpoint,
} from "../../src/verification/index.js";
import { FakeMcpConfigManager, MemoryStateManager } from "../fakes/index.js";

describe("probeVerifyEndpoint", () => {
  it("passes when the endpoint returns an HTTP response", async () => {
    const check = await probeVerifyEndpoint({
      url: "https://behalfid.com/api/verify",
      fetchImpl: async () => ({ status: 401, ok: false }),
    });
    expect(check.status).toBe("pass");
    expect(check.details?.status).toBe(401);
  });

  it("warns on 5xx responses", async () => {
    const check = await probeVerifyEndpoint({
      url: "https://behalfid.com/api/verify",
      fetchImpl: async () => ({ status: 503, ok: false }),
    });
    expect(check.status).toBe("warn");
  });

  it("fails on network errors", async () => {
    const check = await probeVerifyEndpoint({
      url: "https://behalfid.com/api/verify",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(check.status).toBe("fail");
    expect(check.message).toContain("ECONNREFUSED");
  });
});

describe("InstallationVerifier", () => {
  it("reports unhealthy when not installed", async () => {
    const verifier = createInstallationVerifier({
      stateManager: new MemoryStateManager(),
      configManager: new FakeMcpConfigManager(),
      installerVersion: "0.1.0",
      fetchImpl: async () => ({ status: 200, ok: true }),
      now: () => new Date("2026-01-02T00:00:00.000Z"),
    });

    const report = await verifier.verify();
    expect(report.healthy).toBe(false);
    expect(report.installedVersion).toBeNull();
    expect(report.runtimeInstalled).toBe(false);
    expect(report.checkedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(report.checks.find((check) => check.id === "runtime-installed")?.status).toBe(
      "fail",
    );
    expect(report.verifyEndpoint.status).toBe("pass");
    expect(report.packageVersions["@behalfid/install"]).toBe("0.1.0");
  });

  it("reports healthy for a fully configured installation", async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new FakeMcpConfigManager();
    const cursorPath = "/tmp/cursor/mcp.json";
    configManager.seed(cursorPath, { mcpServers: {} });

    await configManager.registerRuntime(cursorPath, {
      id: "mcp-runtime",
      packageName: "@behalfid/mcp-runtime",
      version: "1.2.3",
      serverName: BEHALF_MCP_SERVER_NAME,
      command: "npx",
      args: ["-y", "@behalfid/mcp-runtime@1.2.3"],
      metadata: { verifyEndpoint: "https://example.test/api/verify" },
    });

    await stateManager.save(
      createInstallationState({
        installedVersion: "1.2.3",
        installerVersion: "0.1.0",
        configuredClients: [
          {
            clientId: "cursor",
            mcpConfigPath: cursorPath,
            configuredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        registeredRuntimes: [
          {
            id: "mcp-runtime",
            packageName: "@behalfid/mcp-runtime",
            version: "1.2.3",
            serverName: BEHALF_MCP_SERVER_NAME,
            registeredAt: "2026-01-01T00:00:00.000Z",
            metadata: { verifyEndpoint: "https://example.test/api/verify" },
          },
        ],
      }),
    );

    const verifier = createInstallationVerifier({
      stateManager,
      configManager,
      installerVersion: "0.1.0",
      fetchImpl: async (url) => {
        expect(url).toBe("https://example.test/api/verify");
        return { status: 200, ok: true };
      },
    });

    const report = await verifier.verify();
    expect(report.healthy).toBe(true);
    expect(report.runtimeInstalled).toBe(true);
    expect(report.installedVersion).toBe("1.2.3");
    expect(report.packageVersions["@behalfid/mcp-runtime"]).toBe("1.2.3");
    expect(report.mcpRegistration.every((check) => check.status === "pass")).toBe(true);
    expect(report.configurationIntegrity.every((check) => check.status === "pass")).toBe(
      true,
    );
    expect(report.verifyEndpoint.status).toBe("pass");
  });

  it("fails MCP registration and integrity when the runtime entry is missing", async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new FakeMcpConfigManager();
    const cursorPath = "/tmp/cursor/mcp.json";
    configManager.seed(cursorPath, { mcpServers: { other: { command: "echo" } } });

    await stateManager.save(
      createInstallationState({
        installedVersion: "1.0.0",
        installerVersion: "0.1.0",
        configuredClients: [
          {
            clientId: "cursor",
            mcpConfigPath: cursorPath,
            configuredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        registeredRuntimes: [
          {
            id: "mcp-runtime",
            packageName: "@behalfid/mcp-runtime",
            version: "1.0.0",
            serverName: BEHALF_MCP_SERVER_NAME,
            registeredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const verifier = createInstallationVerifier({
      stateManager,
      configManager,
      installerVersion: "0.1.0",
      fetchImpl: async () => ({ status: 200, ok: true }),
    });

    const report = await verifier.verify();
    expect(report.healthy).toBe(false);
    expect(report.mcpRegistration[0]?.status).toBe("fail");
    expect(report.configurationIntegrity[0]?.status).toBe("fail");
  });

  it("honors verifyEndpoint option over state metadata", async () => {
    const stateManager = new MemoryStateManager();
    await stateManager.save(
      createInstallationState({
        installedVersion: "1.0.0",
        installerVersion: "0.1.0",
        registeredRuntimes: [
          {
            id: "mcp-runtime",
            packageName: "@behalfid/mcp-runtime",
            version: "1.0.0",
            serverName: BEHALF_MCP_SERVER_NAME,
            registeredAt: "2026-01-01T00:00:00.000Z",
            metadata: { verifyEndpoint: "https://from-state.test/api/verify" },
          },
        ],
      }),
    );

    const seen: string[] = [];
    const verifier = createInstallationVerifier({
      stateManager,
      configManager: new FakeMcpConfigManager(),
      installerVersion: "0.1.0",
      fetchImpl: async (url) => {
        seen.push(url);
        return { status: 204, ok: true };
      },
    });

    await verifier.verify({ verifyEndpoint: "https://override.test/api/verify" });
    expect(seen).toEqual(["https://override.test/api/verify"]);
  });
});

describe("isHealthy", () => {
  it("treats warnings as healthy and failures as unhealthy", () => {
    expect(
      isHealthy([
        { id: "a", name: "a", status: "pass", message: "ok" },
        { id: "b", name: "b", status: "warn", message: "warn" },
      ]),
    ).toBe(true);
    expect(
      isHealthy([{ id: "a", name: "a", status: "fail", message: "bad" }]),
    ).toBe(false);
  });
});
