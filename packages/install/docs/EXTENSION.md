# Extension points

This document explains how to extend `@behalfid/install` with new AI clients and runtimes without modifying the installer core (`BehalfInstaller`).

## Principles

- **Detectors are read-only.** They never mutate configuration.
- **MCP changes go through `McpConfigManager`.** Backup, register, and rollback stay centralized.
- **Runtimes are catalog-driven.** New packages register via `RuntimeCatalog`, not by editing install orchestration.
- **Inject collaborators in tests and custom deployments.** Pass overrides to `BehalfInstaller` or `createDefaultInstaller({ overrides })`.

## Adding a new AI client

### 1. Define paths

Add a path helper in `src/detection/paths.ts`:

```ts
export function myClientPaths(ctx: DetectionPathContext) {
  const userConfigDir = join(ctx.homeDir, ".myclient");
  return {
    userConfigDir,
    mcpConfigPath: join(userConfigDir, "mcp.json"),
    workspaceConfigDir: join(ctx.cwd, ".myclient"),
  };
}
```

Use `DetectionPathContext` for cross-platform home, cwd, OS, and env resolution.

### 2. Implement a detector

Create `src/detection/clients/my-client.ts`:

```ts
export async function detectMyClient(input: {
  ctx: DetectionPathContext;
  pathExists: PathExistsFn;
  commandExists: CommandExistsFn;
}): Promise<DetectedClient> {
  const paths = myClientPaths(input.ctx);
  const installed = await input.pathExists(paths.mcpConfigPath);

  const configPaths: DetectedClient["configPaths"] = { userConfigDir: paths.userConfigDir };
  if (installed) {
    configPaths.mcpConfigPath = paths.mcpConfigPath;
  }

  return {
    id: "my-client",       // add to AiClientId in types/primitives.ts
    name: "My Client",
    installed,
    configPaths,
  };
}
```

Register the detector in `src/detection/clients/index.ts` inside `detectAllClients`.

### 3. Extend types and CLI parsing

- Add the client id to `AiClientId` in `src/types/primitives.ts`.
- Update `--clients` help text in `src/cli.ts` if exposed to users.
- Add path expectations to integration tests under `test/integration/`.

### 4. MCP format

If the client uses an existing shape:

| Shape | Format id | Map key |
| --- | --- | --- |
| Claude/Cursor JSON | `mcpServers-json` | `mcpServers` |
| VS Code JSON | `vscode-json` | `servers` |
| Codex TOML | `codex-toml` | `mcp_servers` |

If the client uses a new on-disk shape:

1. Add a format id to `McpConfigFormat` in `src/mcp/format.ts`.
2. Teach `detectMcpConfigFormat` / `refineMcpConfigFormat` to recognize it.
3. Extend `src/mcp/codec.ts` and `src/mcp/servers.ts` for read/write and server map access.
4. Add unit tests in `test/mcp/config-manager.test.ts`.

No changes to `BehalfInstaller` are required if detection and MCP format handling are complete.

## Adding a new runtime

### 1. Define the runtime

Create a factory similar to `createDefaultRuntimeRegistration` in `src/installer/runtime.ts`:

```ts
export function createMyRuntimeRegistration(options: {
  version: string;
  verifyEndpoint?: string;
}): RuntimeRegistrationInput {
  return {
    id: "my-runtime",
    packageName: "@behalfid/my-runtime",
    version: options.version,
    serverName: "behalfid-my",
    command: "npx",
    args: ["-y", `@behalfid/my-runtime@${options.version}`],
    env: { /* ... */ },
    metadata: { kind: "my-runtime" },
  };
}
```

### 2. Register in the catalog

```ts
import { RuntimeCatalog, mcpRuntimeDefinition } from "@behalfid/install";

const catalog = new RuntimeCatalog([mcpRuntimeDefinition]);
catalog.register({
  id: "my-runtime",
  packageName: "@behalfid/my-runtime",
  serverName: "behalfid-my",
  kind: "my-runtime",
  displayName: "My Runtime",
  createRegistration: createMyRuntimeRegistration,
});
```

Wire the catalog when constructing `BehalfInstaller`:

```ts
const installer = new BehalfInstaller({
  // ...detector, configManager, stateManager, verifier, runtimeRegistrar
  createRuntimeRegistration: (input) =>
    catalog.get("my-runtime")!.createRegistration(input),
});
```

The default CLI uses `createDefaultRuntimeCatalog()` with only `mcp-runtime`. Additional runtimes require a custom installer factory or a future CLI flag.

## Custom collaborators

### Platform detector (tests or air-gapped hosts)

```ts
const detector = new HostPlatformDetector({
  homeDir: "/tmp/home",
  cwd: "/tmp/project",
  platform: "linux",
  commandExists: async (cmd) => cmd === "npm",
});
```

### State file location

```ts
const stateManager = new FileStateManager({
  stateFilePath: "/tmp/install-state.json",
});
```

Or set `BEHALF_HOME` before running the CLI.

### Verify endpoint probe

```ts
const verifier = new InstallationVerifier({
  stateManager,
  configManager,
  fetchImpl: async () => ({ ok: true, status: 200 }),
});
```

### MCP manager wrapper

Implement `McpConfigManager` and delegate to `FileMcpConfigManager` for cross-cutting behavior (metrics, policy checks). The integration test `FailOnRegisterMcpConfigManager` shows the pattern.

## Public interfaces

| Interface | Purpose |
| --- | --- |
| `Installer` | install / upgrade / uninstall / doctor / status |
| `PlatformDetector` | OS, package managers, clients |
| `McpConfigManager` | MCP file lifecycle |
| `RuntimeRegistrar` | Track registered runtimes |
| `StateManager` | Persist installation state |
| `Verifier` | Health checks |

Implement these interfaces to replace subsystems in enterprise or embedded scenarios.

## AI agent integration

After extending clients or commands, update:

1. `spec/behalfid-install.spec.yaml` — machine-readable contract
2. `INSTALL_FOR_AI.md` — deterministic agent steps
3. `DEFAULT_INSTALLATION_SPEC` in `src/spec/defaultSpec.ts` if programmatic spec is used

Agents should continue to shell out to `npx @behalfid/install` rather than calling internal APIs directly unless they are embedding the library.

## Checklist for a new client PR

- [ ] Path helper with macOS, Linux, and Windows coverage where applicable
- [ ] Detector with read-only `pathExists` / `commandExists` signals
- [ ] `AiClientId` and CLI `--clients` list updated
- [ ] MCP format support (existing or new codec)
- [ ] Unit tests for detector and MCP read/write
- [ ] Integration fixture path in `test/integration/helpers.ts`
- [ ] Documentation table rows in README and ARCHITECTURE.md
