import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileMcpConfigManager,
  detectMcpConfigFormat,
  parseMcpConfigContents,
  serializeMcpConfig,
} from "../../src/mcp/index.js";
import { createDefaultRuntimeRegistration } from "../../src/installer/runtime.js";
import { BEHALF_MCP_SERVER_NAME } from "../../src/types/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "behalf-mcp-"));
  tempDirs.push(dir);
  return dir;
}

describe("detectMcpConfigFormat", () => {
  it("detects format from path", () => {
    expect(detectMcpConfigFormat("/home/me/.cursor/mcp.json")).toBe("mcpServers-json");
    expect(detectMcpConfigFormat("/home/me/project/.vscode/mcp.json")).toBe("vscode-json");
    expect(detectMcpConfigFormat("/home/me/.codex/config.toml")).toBe("codex-toml");
    expect(
      detectMcpConfigFormat("/home/me/.config/Code/User/mcp.json"),
    ).toBe("vscode-json");
  });
});

describe("codec", () => {
  it("round-trips standard mcpServers JSON", () => {
    const raw = serializeMcpConfig(
      {
        mcpServers: {
          other: { command: "echo" },
        },
        keep: true,
      },
      "mcpServers-json",
    );
    const parsed = parseMcpConfigContents(raw, "mcpServers-json");
    expect(parsed.keep).toBe(true);
    expect(parsed.mcpServers).toEqual({ other: { command: "echo" } });
  });

  it("round-trips Codex TOML mcp_servers", () => {
    const raw = serializeMcpConfig(
      {
        model: "gpt-5",
        mcp_servers: {
          behalfid: {
            command: "npx",
            args: ["-y", "@behalfid/mcp-runtime@1.0.0"],
            env: { BEHALFID_VERIFY_URL: "https://behalfid.com/api/verify" },
          },
        },
      },
      "codex-toml",
    );
    expect(raw).toContain("[mcp_servers.behalfid]");
    const parsed = parseMcpConfigContents(raw, "codex-toml");
    expect(parsed.model).toBe("gpt-5");
    expect((parsed.mcp_servers as Record<string, unknown>).behalfid).toMatchObject({
      command: "npx",
    });
  });
});

describe("FileMcpConfigManager", () => {
  it("registers into Cursor-style JSON without clobbering unrelated servers", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, ".cursor", "mcp.json");
    await mkdir(join(dir, ".cursor"), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({ mcpServers: { filesystem: { command: "npx", args: ["-y", "fs"] } }, theme: "dark" }, null, 2)}\n`,
      "utf8",
    );

    const manager = new FileMcpConfigManager();
    const runtime = createDefaultRuntimeRegistration({ version: "1.2.3" });
    await manager.registerRuntime(configPath, runtime);

    const config = await manager.read(configPath);
    expect(config.theme).toBe("dark");
    expect(config.mcpServers).toMatchObject({
      filesystem: { command: "npx", args: ["-y", "fs"] },
      [BEHALF_MCP_SERVER_NAME]: {
        command: "npx",
        args: ["-y", "@behalfid/mcp-runtime@1.2.3"],
      },
    });
    expect(await manager.hasRuntime(configPath, BEHALF_MCP_SERVER_NAME)).toBe(true);
  });

  it("is idempotent when registering the same server twice", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "mcp.json");
    const manager = new FileMcpConfigManager();
    const runtime = createDefaultRuntimeRegistration({ version: "1.0.0" });

    await manager.registerRuntime(configPath, runtime);
    await manager.registerRuntime(
      configPath,
      createDefaultRuntimeRegistration({ version: "2.0.0" }),
    );

    const config = await manager.read(configPath);
    const servers = config.mcpServers ?? {};
    expect(Object.keys(servers)).toEqual([BEHALF_MCP_SERVER_NAME]);
    expect(servers[BEHALF_MCP_SERVER_NAME]?.args).toEqual([
      "-y",
      "@behalfid/mcp-runtime@2.0.0",
    ]);
  });

  it("writes VS Code servers key and stdio type", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, ".vscode", "mcp.json");
    const manager = new FileMcpConfigManager();
    await manager.registerRuntime(
      configPath,
      createDefaultRuntimeRegistration({ version: "1.0.0" }),
    );

    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      servers: Record<string, { type?: string; command?: string }>;
      mcpServers?: unknown;
    };
    expect(parsed.mcpServers).toBeUndefined();
    expect(parsed.servers[BEHALF_MCP_SERVER_NAME]?.type).toBe("stdio");
    expect(parsed.servers[BEHALF_MCP_SERVER_NAME]?.command).toBe("npx");
  });

  it("registers and unregisters Codex TOML servers while preserving other keys", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, ".codex", "config.toml");
    await mkdir(join(dir, ".codex"), { recursive: true });
    await writeFile(configPath, 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "echo"\n', "utf8");

    const manager = new FileMcpConfigManager();
    await manager.registerRuntime(
      configPath,
      createDefaultRuntimeRegistration({ version: "1.0.0" }),
    );

    let raw = await readFile(configPath, "utf8");
    expect(raw).toContain('model = "gpt-5"');
    expect(raw).toContain("[mcp_servers.other]");
    expect(raw).toContain("[mcp_servers.behalfid]");
    expect(await manager.hasRuntime(configPath, BEHALF_MCP_SERVER_NAME)).toBe(true);

    await manager.unregisterRuntime(configPath, BEHALF_MCP_SERVER_NAME);
    raw = await readFile(configPath, "utf8");
    expect(raw).toContain("[mcp_servers.other]");
    expect(raw).not.toContain("[mcp_servers.behalfid]");
    expect(await manager.hasRuntime(configPath, BEHALF_MCP_SERVER_NAME)).toBe(false);
  });

  it("backs up and restores an existing configuration", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "mcp.json");
    await writeFile(
      configPath,
      `${JSON.stringify({ mcpServers: { keep: { command: "echo" } } }, null, 2)}\n`,
      "utf8",
    );

    const manager = new FileMcpConfigManager();
    const backup = await manager.backup(configPath);
    await manager.registerRuntime(
      configPath,
      createDefaultRuntimeRegistration({ version: "1.0.0" }),
    );
    expect(await manager.hasRuntime(configPath, BEHALF_MCP_SERVER_NAME)).toBe(true);

    await manager.restore(backup);
    expect(await manager.hasRuntime(configPath, BEHALF_MCP_SERVER_NAME)).toBe(false);
    const restored = await manager.read(configPath);
    expect(restored.mcpServers).toEqual({ keep: { command: "echo" } });
  });

  it("restores a missing original by deleting a newly created file", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "new-mcp.json");
    const manager = new FileMcpConfigManager();

    const backup = await manager.backup(configPath);
    await manager.registerRuntime(
      configPath,
      createDefaultRuntimeRegistration({ version: "1.0.0" }),
    );
    expect(await manager.hasRuntime(configPath, BEHALF_MCP_SERVER_NAME)).toBe(true);

    await manager.restore(backup);
    await expect(manager.hasRuntime(configPath, BEHALF_MCP_SERVER_NAME)).resolves.toBe(false);
    const rawExists = await readFile(configPath, "utf8").then(
      () => true,
      () => false,
    );
    expect(rawExists).toBe(false);
  });

  it("rejects malformed JSON configuration", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "mcp.json");
    await writeFile(configPath, "{not-json", "utf8");
    const manager = new FileMcpConfigManager();
    await expect(manager.read(configPath)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });
});
