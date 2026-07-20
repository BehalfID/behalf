# @behalfid/install

Universal installation framework for BehalfID.

AI coding agents (Cursor, Claude Code, Codex, VS Code, Windsurf, and future MCP clients) should install, verify, upgrade, and uninstall BehalfID by invoking this package — not by embedding BehalfID-specific installation logic.

## Status

Phases complete:

1. **Foundation** — package structure, types, interfaces, state persistence, CLI surface
2. **Installer framework** — `BehalfInstaller` orchestration with idempotent install/upgrade/uninstall, backup/rollback, and injectable collaborators
3. **Platform detection** — `HostPlatformDetector` for OS, package managers, and AI client config paths
4. **MCP configuration** — `FileMcpConfigManager` with JSON/TOML read-write, backup/restore, and idempotent runtime registration
5. **Runtime registration** — extensible `RuntimeCatalog`, default `@behalfid/mcp-runtime` definition, memory and state-backed registrars
6. **Verification** — `InstallationVerifier` / `doctor` health checks (state, runtime, MCP registration, config integrity, verify endpoint)
7. **CLI commands** — wired handlers with human-readable and `--json` output; `install` is the default command
8. **AI installation spec** — `spec/behalfid-install.spec.yaml` and `INSTALL_FOR_AI.md`
9. **Integration tests** — end-to-end lifecycle, rollback, detection, verification, and CLI tests under `test/integration/`
10. **Documentation** — architecture, troubleshooting, and extension guides in `docs/`

## Install / run

```bash
npx @behalfid/install --help
```

Binary name: `behalf-install`

## Public commands

| Command | Purpose |
| --- | --- |
| `install` | Install and configure BehalfID |
| `doctor` | Verify installation health |
| `upgrade` | Upgrade an existing installation |
| `uninstall` | Remove installer-managed configuration |
| `status` | Show current installation state |

All commands accept `--json` for machine-readable output.

```bash
npx @behalfid/install              # install (default)
npx @behalfid/install doctor --json
npx @behalfid/install status
```

## Library usage

```ts
import {
  BehalfInstaller,
  FileMcpConfigManager,
  FileStateManager,
  HostPlatformDetector,
  InstallationVerifier,
  MemoryRuntimeRegistrar,
  createDefaultRuntimeCatalog,
} from "@behalfid/install";

const detector = new HostPlatformDetector();
const configManager = new FileMcpConfigManager();
const stateManager = new FileStateManager();
const runtimeRegistrar = new MemoryRuntimeRegistrar();
const catalog = createDefaultRuntimeCatalog();
const verifier = new InstallationVerifier({ stateManager, configManager });

const installer = new BehalfInstaller({
  detector,
  configManager,
  runtimeRegistrar,
  stateManager,
  verifier,
  createRuntimeRegistration: (options) =>
    catalog.get("mcp-runtime")!.createRegistration(options),
});

const result = await installer.install();
const report = await installer.doctor();
```

## Supported client detection

| Client | Primary MCP config |
| --- | --- |
| Cursor | `~/.cursor/mcp.json` |
| Claude Code | `~/.claude.json` or project `.mcp.json` |
| Claude Desktop | OS-specific `claude_desktop_config.json` |
| Codex CLI | `~/.codex/config.toml` |
| VS Code | workspace `.vscode/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

## MCP configuration formats

| Format | Used by | Server map key |
| --- | --- | --- |
| `mcpServers-json` | Cursor, Claude, Windsurf, Claude Desktop | `mcpServers` |
| `vscode-json` | VS Code | `servers` |
| `codex-toml` | Codex CLI | `mcp_servers` |

## Runtime extension points

- `RuntimeCatalog` / `mcpRuntimeDefinition` — register additional runtimes without changing installer core
- `MemoryRuntimeRegistrar` — in-memory tracking for transactional installs
- `StateRuntimeRegistrar` — persist runtime records through `StateManager`

Default registration includes `@behalfid/mcp-runtime`, verify endpoint env (`BEHALFID_VERIFY_URL`), and runtime metadata.

## Doctor checks

`InstallationVerifier` reports:

- installer version
- installation state / runtime registration
- per-client MCP registration
- configuration integrity
- verify endpoint connectivity
- package versions

`healthy` is true when no checks have status `fail` (warnings are allowed).

## AI agent installation

Machine-readable contract:

```text
spec/behalfid-install.spec.yaml
```

Deterministic instructions for AI coding agents:

```text
INSTALL_FOR_AI.md
```

Programmatic access:

```ts
import { getDefaultInstallationSpec } from "@behalfid/install";

const spec = getDefaultInstallationSpec();
console.log(spec.commands.install.command);
```

## Installer flow

1. Detect environment and select target AI clients
2. Skip work when already configured (idempotent unless `--force`)
3. Back up each MCP config before mutation
4. Register the runtime into MCP configuration
5. Persist installation state
6. On failure, restore backups in reverse order

## Development

```bash
cd packages/install
npm install
npm run build
npm test
```

Integration tests live in `test/integration/` and exercise the full installer stack against temporary filesystem fixtures (install, upgrade, uninstall, rollback, doctor, and CLI `--json` output).

## Documentation

| Document | Description |
| --- | --- |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Component layout, install lifecycle, state, formats, doctor checks |
| [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common failures, error codes, platform notes |
| [docs/EXTENSION.md](./docs/EXTENSION.md) | Adding AI clients and runtimes |
| [INSTALL_FOR_AI.md](./INSTALL_FOR_AI.md) | Deterministic instructions for AI coding agents |
| [spec/behalfid-install.spec.yaml](./spec/behalfid-install.spec.yaml) | Machine-readable install/verify/upgrade/uninstall contract |

## Design principles

- Cross-platform and idempotent
- Preserve unrelated user configuration
- Never duplicate MCP entries
- Safe upgrades and rollback
- Strong TypeScript typing with clear extension points for new AI clients
