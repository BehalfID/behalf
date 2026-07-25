import { describe, expect, it } from "vitest";
import { createBehalfInstaller } from "../src/installer/BehalfInstaller.js";
import {
  FakeMcpConfigManager,
  FakePlatformDetector,
  FakeRuntimeRegistrar,
  FakeVerifier,
  MemoryStateManager,
} from "./fakes/index.js";

describe("BehalfInstaller wrapExisting", () => {
  it("rewrites existing servers and restores originals on uninstall", async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new FakeMcpConfigManager();
    const cursorPath = "/tmp/cursor/mcp.json";
    configManager.seed(cursorPath, {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        },
        other: { command: "echo" },
      },
    });

    const detector = new FakePlatformDetector({
      os: "linux",
      packageManagers: ["npm"],
      clients: [
        {
          id: "cursor",
          name: "Cursor",
          installed: true,
          configPaths: { mcpConfigPath: cursorPath },
        },
      ],
    });

    const installer = createBehalfInstaller({
      detector,
      configManager,
      runtimeRegistrar: new FakeRuntimeRegistrar(),
      stateManager,
      verifier: new FakeVerifier(),
      runtimeVersion: "9.9.9",
    });

    const result = await installer.install({
      clients: ["cursor"],
      wrapExisting: true,
      agentId: "agent_wrap",
      apiKey: "bhf_sk_wrap",
      force: true,
    });

    expect(result.success).toBe(true);
    const config = await configManager.read(cursorPath);
    expect(config.mcpServers?.filesystem?.env?.BEHALFID_DOWNSTREAM_COMMAND).toBe(
      "npx",
    );
    expect(config.mcpServers?.filesystem?.env?.BEHALFID_AGENT_ID).toBe(
      "agent_wrap",
    );
    expect(config.mcpServers?.behalfid?.command).toBe("npx");

    const state = await stateManager.load();
    expect(state?.configuredClients[0]?.wrappedServers?.[0]?.serverName).toBe(
      "filesystem",
    );
    expect(
      state?.configuredClients[0]?.wrappedServers?.[0]?.original,
    ).toMatchObject({
      command: "npx",
    });

    const uninstall = await installer.uninstall({ clients: ["cursor"] });
    expect(uninstall.success).toBe(true);
    const restored = await configManager.read(cursorPath);
    expect(restored.mcpServers?.filesystem).toMatchObject({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    });
    expect(restored.mcpServers?.behalfid).toBeUndefined();
  });
});
