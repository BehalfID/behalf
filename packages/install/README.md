# @behalfid/install

Universal installation framework for BehalfID.

AI coding agents (Cursor, Claude Code, Codex, VS Code, Windsurf, and future MCP clients) should install, verify, upgrade, and uninstall BehalfID by invoking this package — not by embedding BehalfID-specific installation logic.

## Status

Phase 1 foundation is in place:

- TypeScript package structure and strict compiler settings
- Public types and installer interfaces
- Installation state persistence (`FileStateManager`)
- CLI entrypoint with the public command surface

Installer behavior (detection, MCP configuration, runtime registration, verification) lands in later phases.

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
  FileStateManager,
  createInstallationState,
  createCliProgram,
} from "@behalfid/install";

const stateManager = new FileStateManager();
const existing = await stateManager.load();
```

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
