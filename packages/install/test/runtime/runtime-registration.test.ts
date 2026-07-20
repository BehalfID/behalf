import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultRuntimeCatalog,
  createMemoryRuntimeRegistrar,
  createStateRuntimeRegistrar,
  mcpRuntimeDefinition,
  resolveRuntimeRegistration,
  RuntimeCatalog,
} from "../../src/runtime/index.js";
import { createDefaultRuntimeRegistration, DEFAULT_RUNTIME_ID } from "../../src/installer/runtime.js";
import { FileStateManager } from "../../src/state/FileStateManager.js";
import { BEHALF_MCP_SERVER_NAME } from "../../src/types/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("RuntimeCatalog", () => {
  it("includes the default mcp-runtime definition", () => {
    const catalog = createDefaultRuntimeCatalog();
    expect(catalog.has(DEFAULT_RUNTIME_ID)).toBe(true);
    expect(catalog.get(DEFAULT_RUNTIME_ID)).toMatchObject({
      packageName: "@behalfid/mcp-runtime",
      serverName: BEHALF_MCP_SERVER_NAME,
      kind: "mcp-runtime",
    });
  });

  it("allows additional runtime definitions without replacing the default", () => {
    const catalog = createDefaultRuntimeCatalog();
    catalog.register({
      id: "future-runtime",
      packageName: "@behalfid/future-runtime",
      serverName: "behalfid-future",
      kind: "future",
      displayName: "Future Runtime",
      createRegistration: (options) =>
        createDefaultRuntimeRegistration({
          ...options,
          id: "future-runtime",
          packageName: "@behalfid/future-runtime",
          serverName: "behalfid-future",
        }),
    });

    expect(catalog.list().map((entry) => entry.id).sort()).toEqual([
      "future-runtime",
      "mcp-runtime",
    ]);
  });

  it("resolves registration payloads through the catalog", () => {
    const catalog = new RuntimeCatalog([mcpRuntimeDefinition]);
    const registration = resolveRuntimeRegistration(catalog, DEFAULT_RUNTIME_ID, {
      version: "9.9.9",
      verifyEndpoint: "https://example.test/api/verify",
    });

    expect(registration).toMatchObject({
      id: DEFAULT_RUNTIME_ID,
      version: "9.9.9",
      command: "npx",
      env: {
        BEHALFID_VERIFY_URL: "https://example.test/api/verify",
      },
      metadata: {
        kind: "mcp-runtime",
        verifyEndpoint: "https://example.test/api/verify",
      },
    });
  });

  it("throws for unknown runtime ids", () => {
    const catalog = createDefaultRuntimeCatalog();
    expect(() =>
      resolveRuntimeRegistration(catalog, "missing", { version: "1.0.0" }),
    ).toThrow(/Unknown runtime id/);
  });
});

describe("MemoryRuntimeRegistrar", () => {
  it("registers, lists, gets, and unregisters runtimes", async () => {
    const registrar = createMemoryRuntimeRegistrar();
    const input = createDefaultRuntimeRegistration({ version: "1.0.0" });

    const registered = await registrar.register(input);
    expect(registered.id).toBe(DEFAULT_RUNTIME_ID);
    expect(registered.metadata).toMatchObject({ kind: "mcp-runtime" });

    await expect(registrar.list()).resolves.toHaveLength(1);
    await expect(registrar.get(DEFAULT_RUNTIME_ID)).resolves.toMatchObject({
      version: "1.0.0",
      serverName: BEHALF_MCP_SERVER_NAME,
    });

    await registrar.register(createDefaultRuntimeRegistration({ version: "2.0.0" }));
    const listed = await registrar.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.version).toBe("2.0.0");

    await registrar.unregister(DEFAULT_RUNTIME_ID);
    await expect(registrar.list()).resolves.toEqual([]);
    await expect(registrar.get(DEFAULT_RUNTIME_ID)).resolves.toBeNull();
  });

  it("hydrates from existing records", async () => {
    const registrar = createMemoryRuntimeRegistrar([
      {
        id: "mcp-runtime",
        packageName: "@behalfid/mcp-runtime",
        version: "1.0.0",
        serverName: BEHALF_MCP_SERVER_NAME,
        registeredAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    await expect(registrar.list()).resolves.toHaveLength(1);
  });
});

describe("StateRuntimeRegistrar", () => {
  it("persists registered runtimes through the state manager", async () => {
    const dir = await mkdtemp(join(tmpdir(), "behalf-runtime-"));
    tempDirs.push(dir);
    const stateManager = new FileStateManager({
      stateFilePath: join(dir, "install-state.json"),
    });
    const registrar = createStateRuntimeRegistrar(stateManager, {
      installerVersion: "0.1.0",
    });

    await registrar.register(createDefaultRuntimeRegistration({ version: "3.1.0" }));
    await expect(registrar.list()).resolves.toHaveLength(1);

    const state = await stateManager.load();
    expect(state?.registeredRuntimes[0]).toMatchObject({
      id: DEFAULT_RUNTIME_ID,
      version: "3.1.0",
      packageName: "@behalfid/mcp-runtime",
    });
    expect(state?.installedVersion).toBe("3.1.0");
    expect(state?.installerVersion).toBe("0.1.0");

    await registrar.unregister(DEFAULT_RUNTIME_ID);
    await expect(registrar.list()).resolves.toEqual([]);
    const after = await stateManager.load();
    expect(after?.registeredRuntimes).toEqual([]);
  });
});
