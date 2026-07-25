import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileStateManager,
  createInstallationState,
  parseInstallationState,
  resolveBehalfConfigDir,
  resolveInstallationStatePath,
  INSTALLATION_STATE_SCHEMA_VERSION,
  BEHALF_MCP_SERVER_NAME,
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "behalf-install-"));
  tempDirs.push(dir);
  return dir;
}

describe("parseInstallationState", () => {
  it("accepts a valid state document", () => {
    const state = createInstallationState({
      installedVersion: "0.1.0",
      installerVersion: "0.1.0",
      configuredClients: [
        {
          clientId: "cursor",
          mcpConfigPath: "/tmp/mcp.json",
          configuredAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      registeredRuntimes: [
        {
          id: "mcp-runtime",
          packageName: "@behalfid/mcp-runtime",
          version: "0.1.0",
          serverName: BEHALF_MCP_SERVER_NAME,
          registeredAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const parsed = parseInstallationState(state);
    expect(parsed.schemaVersion).toBe(INSTALLATION_STATE_SCHEMA_VERSION);
    expect(parsed.configuredClients).toHaveLength(1);
    expect(parsed.registeredRuntimes[0]?.serverName).toBe("behalfid");
  });

  it("rejects an unsupported schema version", () => {
    expect(() =>
      parseInstallationState({
        schemaVersion: 99,
        installedVersion: "0.1.0",
        installerVersion: "0.1.0",
        installedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        configuredClients: [],
        registeredRuntimes: [],
      }),
    ).toThrow(/schemaVersion/);
  });

  it("rejects invalid client ids", () => {
    expect(() =>
      parseInstallationState({
        schemaVersion: 1,
        installedVersion: "0.1.0",
        installerVersion: "0.1.0",
        installedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        configuredClients: [
          {
            clientId: "unknown-client",
            mcpConfigPath: "/tmp/mcp.json",
            configuredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        registeredRuntimes: [],
      }),
    ).toThrow(/clientId/);
  });
});

describe("FileStateManager", () => {
  it("returns null when no state file exists", async () => {
    const dir = await createTempDir();
    const manager = new FileStateManager({
      stateFilePath: join(dir, "install-state.json"),
    });

    await expect(manager.load()).resolves.toBeNull();
    await expect(manager.exists()).resolves.toBe(false);
  });

  it("round-trips installation state with an atomic write", async () => {
    const dir = await createTempDir();
    const stateFilePath = join(dir, "install-state.json");
    const manager = new FileStateManager({ stateFilePath });

    const state = createInstallationState({
      installedVersion: "1.2.3",
      installerVersion: "0.1.0",
    });

    await manager.save(state);

    const loaded = await manager.load();
    expect(loaded).toEqual(state);

    const onDisk = await readFile(stateFilePath, "utf8");
    expect(JSON.parse(onDisk)).toMatchObject({
      schemaVersion: 1,
      installedVersion: "1.2.3",
      installerVersion: "0.1.0",
    });
  });

  it("overwrites existing state safely", async () => {
    const dir = await createTempDir();
    const manager = new FileStateManager({
      stateFilePath: join(dir, "install-state.json"),
    });

    await manager.save(
      createInstallationState({
        installedVersion: "1.0.0",
        installerVersion: "0.1.0",
      }),
    );

    await manager.save(
      createInstallationState({
        installedVersion: "2.0.0",
        installerVersion: "0.1.0",
        installedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      }),
    );

    const loaded = await manager.load();
    expect(loaded?.installedVersion).toBe("2.0.0");
  });

  it("clears persisted state", async () => {
    const dir = await createTempDir();
    const manager = new FileStateManager({
      stateFilePath: join(dir, "install-state.json"),
    });

    await manager.save(
      createInstallationState({
        installedVersion: "1.0.0",
        installerVersion: "0.1.0",
      }),
    );

    await manager.clear();
    await expect(manager.exists()).resolves.toBe(false);
    await expect(manager.load()).resolves.toBeNull();
  });
});

describe("path helpers", () => {
  it("resolves default paths under the home directory", () => {
    const home = join(tmpdir(), "behalf-home");
    expect(resolveBehalfConfigDir(home)).toBe(join(home, ".behalfid"));
    expect(resolveInstallationStatePath(home)).toBe(
      join(home, ".behalfid", "install-state.json"),
    );
  });

  it("honors BEHALF_HOME when set", () => {
    const previous = process.env.BEHALF_HOME;
    const customHome = join(tmpdir(), "custom-behalf");
    process.env.BEHALF_HOME = customHome;
    try {
      expect(resolveBehalfConfigDir(join(tmpdir(), "ignored"))).toBe(customHome);
      expect(resolveInstallationStatePath(join(tmpdir(), "ignored"))).toBe(
        join(customHome, "install-state.json"),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.BEHALF_HOME;
      } else {
        process.env.BEHALF_HOME = previous;
      }
    }
  });
});
