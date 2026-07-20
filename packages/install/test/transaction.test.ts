import { describe, expect, it } from "vitest";
import { InstallTransaction } from "../src/installer/transaction.js";
import { FakeMcpConfigManager } from "./fakes/index.js";
import { BEHALF_MCP_SERVER_NAME } from "../src/types/index.js";
import { createDefaultRuntimeRegistration } from "../src/installer/runtime.js";

describe("InstallTransaction", () => {
  it("restores backups in reverse order after a failure", async () => {
    const configManager = new FakeMcpConfigManager();
    configManager.seed("/tmp/a.json", { mcpServers: { keep: { command: "a" } } });
    configManager.seed("/tmp/b.json", { mcpServers: { keep: { command: "b" } } });

    const transaction = new InstallTransaction(configManager);
    const runtime = createDefaultRuntimeRegistration({ version: "1.0.0" });

    await transaction.backup("/tmp/a.json");
    await configManager.registerRuntime("/tmp/a.json", runtime);
    await transaction.backup("/tmp/b.json");
    await configManager.registerRuntime("/tmp/b.json", runtime);

    expect(await configManager.hasRuntime("/tmp/a.json", BEHALF_MCP_SERVER_NAME)).toBe(true);
    expect(await configManager.hasRuntime("/tmp/b.json", BEHALF_MCP_SERVER_NAME)).toBe(true);

    const rollback = await transaction.rollback();
    expect(rollback.errors).toHaveLength(0);
    expect(rollback.restored).toEqual(["/tmp/b.json", "/tmp/a.json"]);
    expect(await configManager.hasRuntime("/tmp/a.json", BEHALF_MCP_SERVER_NAME)).toBe(false);
    expect(await configManager.hasRuntime("/tmp/b.json", BEHALF_MCP_SERVER_NAME)).toBe(false);

    const a = await configManager.read("/tmp/a.json");
    expect(a.mcpServers?.keep).toEqual({ command: "a" });
  });

  it("records rollback errors without aborting remaining restores", async () => {
    const configManager = new FakeMcpConfigManager();
    configManager.seed("/tmp/a.json", { mcpServers: {} });
    configManager.seed("/tmp/b.json", { mcpServers: {} });

    const transaction = new InstallTransaction(configManager);
    await transaction.backup("/tmp/a.json");
    await transaction.backup("/tmp/b.json");

    configManager.failRestore = true;
    const rollback = await transaction.rollback();
    expect(rollback.restored).toHaveLength(0);
    expect(rollback.errors).toHaveLength(2);
    expect(rollback.errors[0]?.code).toBe("ROLLBACK_FAILED");
  });
});
