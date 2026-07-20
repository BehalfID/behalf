# @behalfid/install

Universal installation framework for BehalfID.

AI coding agents (Cursor, Claude Code, Codex, VS Code, Windsurf, and future MCP clients) should install, verify, upgrade, and uninstall BehalfID by invoking this package — not by embedding BehalfID-specific installation logic.

## Status

Phases complete:

1. **Foundation** — package structure, types, interfaces, state persistence, CLI surface
2. **Installer framework** — `BehalfInstaller` orchestration with idempotent install/upgrade/uninstall, backup/rollback, and injectable collaborators

Still ahead: platform detection, MCP config manager, runtime registration defaults wiring, verification, CLI handlers, AI install spec, integration tests, and docs.

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

All commands accept `--json` for machine-readable output (wired when command handlers land).

## Library usage

```ts
import {
  BehalfInstaller,
  FileStateManager,
  createDefaultRuntimeRegistration,
} from "@behalfid/install";

const installer = new BehalfInstaller({
  detector,
  configManager,
  runtimeRegistrar,
  stateManager: new FileStateManager(),
  verifier,
});

const result = await installer.install();
```

`BehalfInstaller` depends on injected collaborators (`PlatformDetector`, `McpConfigManager`, `RuntimeRegistrar`, `StateManager`, `Verifier`). Concrete detectors and config managers arrive in later phases; until then, supply your own implementations or test doubles.

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

## Design principles

- Cross-platform and idempotent
- Preserve unrelated user configuration
- Never duplicate MCP entries
- Safe upgrades and rollback
- Strong TypeScript typing with clear extension points for new AI clients
