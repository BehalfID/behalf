# Troubleshooting

This guide helps operators and AI agents diagnose `@behalfid/install` failures. Always prefer JSON output for programmatic diagnosis:

```bash
npx @behalfid/install doctor --json
npx @behalfid/install status --json
```

## Quick diagnosis

| Symptom | First command | What to look for |
| --- | --- | --- |
| User asked to install but nothing changed | `status --json` | `installed`, `configuredClients` |
| Install reported failure | re-run with `--json` | `errors[].code`, `errors[].remediation` |
| MCP tools missing in AI client | `doctor --json` | checks with `mcp-registration:*` or `config-integrity:*` |
| After manual config edit | `doctor --json` | `healthy`, failing check messages |
| Upgrade did not change version | `status --json` | `installedVersion` vs expected |

## Installation state

Authoritative state file:

```text
~/.behalfid/install-state.json
```

Custom location: set `BEHALF_HOME` to a directory; the state file is `<BEHALF_HOME>/install-state.json`.

If state is missing but MCP configs still contain a `behalfid` server entry, run:

```bash
npx @behalfid/install install --force --json
```

If state exists but MCP entries were removed manually, run install (without `--force` if entries are simply missing) or uninstall then reinstall.

## Common scenarios

### No AI clients detected

**Symptoms:** Install fails or configures zero clients; doctor warns that BehalfID is not installed.

**Cause:** None of the supported config paths exist on the host.

**Fix:**

1. Confirm the AI client is installed and has been launched at least once (creates config dirs).
2. For VS Code, open the target workspace — detection uses `<cwd>/.vscode/mcp.json`.
3. Install a subset explicitly if only some clients are present:

```bash
npx @behalfid/install install --clients cursor,vscode --json
```

### Malformed MCP configuration

**Symptoms:** `CONFIG_INVALID` or `CONFIG_READ_FAILED`; install `success: false`.

**Cause:** An MCP config file contains invalid JSON or TOML.

**Fix:**

1. Open the path mentioned in the error message.
2. Fix syntax (validate JSON with a linter; for Codex, fix TOML structure).
3. Re-run install.

The installer does not overwrite unreadable files. Backups from a partial failed install are restored automatically.

### Partial install rolled back

**Symptoms:** `success: false`, errors mention rollback; no state file; some configs unchanged.

**Cause:** Registration failed partway through multi-client install; transaction rolled back all touched files.

**Fix:**

1. Read `errors[]` for the root cause (often `CONFIG_WRITE_FAILED` or `RUNTIME_REGISTRATION_FAILED`).
2. Fix the underlying issue for the failing client.
3. Re-run install. Use `--clients` to narrow scope while debugging.

### Doctor reports unhealthy after manual edit

**Symptoms:** `healthy: false`; `mcp-registration:<client>` or `config-integrity:<client>` fails.

**Cause:** User or another tool removed or broke the BehalfID MCP server entry.

**Fix:**

```bash
npx @behalfid/install install --force --json
```

Or reinstall only affected clients:

```bash
npx @behalfid/install install --force --clients cursor --json
```

### Verify endpoint check fails

**Symptoms:** Doctor check `verify-endpoint` status `fail`; network errors in message.

**Cause:** The verify URL is unreachable from the machine (firewall, offline, wrong `--verify-endpoint`).

**Fix:**

1. Confirm network access to the configured URL.
2. Override during install/doctor if using a custom deployment:

```bash
npx @behalfid/install doctor --verify-endpoint https://your-host/api/verify --json
```

A verify endpoint failure marks the report unhealthy but MCP registration may still be valid.

### Upgrade did not update MCP args

**Symptoms:** `installedVersion` in state updated but client still runs old package.

**Fix:**

```bash
npx @behalfid/install upgrade --json
```

Upgrade rewrites MCP registration with the new runtime version. Restart the AI client so it reloads MCP configuration.

### Uninstall left third-party servers intact

**Expected behavior.** Uninstall removes only the `behalfid` MCP server entry and clears installer state (unless `--keep-state`). Other servers in the same file are preserved.

Verify:

```bash
npx @behalfid/install uninstall --json
npx @behalfid/install status --json   # installed should be false
```

## Error codes

| Code | Typical cause | Suggested action |
| --- | --- | --- |
| `DETECTION_FAILED` | Environment detection threw or no usable clients found | Check OS support; install a supported client; see error `details` |
| `CONFIG_READ_FAILED` | Cannot read MCP file | Fix permissions or path; ensure file exists |
| `CONFIG_WRITE_FAILED` | Cannot write MCP file | Fix permissions; close apps locking the file |
| `CONFIG_INVALID` | Parse/validation error | Fix file syntax |
| `CONFIG_BACKUP_FAILED` | Could not copy config before write | Check disk space and permissions |
| `RUNTIME_REGISTRATION_FAILED` | MCP register step failed | See nested message; check config format |
| `STATE_READ_FAILED` | State file unreadable | Repair or remove corrupt `install-state.json` |
| `STATE_WRITE_FAILED` | Could not persist state | Check `~/.behalfid` permissions |
| `STATE_INVALID` | State JSON schema invalid or corrupt | Remove state and reinstall, or fix JSON manually |
| `VERIFY_FAILED` | Verification step failed (reserved) | Run `doctor --json` for details |
| `PACKAGE_INSTALL_FAILED` | Package install failed (reserved) | Check network/registry access and retry |
| `ROLLBACK_FAILED` | Restore from backup failed | Manually restore from `.behalfid-backup-*` siblings if present |
| `UNSUPPORTED_PLATFORM` | OS not macOS/Linux/Windows | Use a supported platform |
| `NOT_INSTALLED` | Operation requires prior install | Run `install` first |
| `ALREADY_INSTALLED` | Reserved; already-installed is reported via `alreadyInstalled: true` | Use `status --json` or reinstall with `--force` |
| `INTERNAL_ERROR` | Unexpected failure | Re-run with `--json`; file an issue with output |

### Warning codes

Non-fatal codes appear in `warnings[]` (human output: `! [CODE] message`):

| Code | Typical cause | Suggested action |
| --- | --- | --- |
| `CLIENT_NOT_DETECTED` | `--clients` requested a client not found on the host | Install/launch the client, or drop it from `--clients` |
| `CLIENT_NOT_INSTALLED` | Client detected but not installed | Install the client application |
| `CLIENT_MISSING_MCP_PATH` | Client installed without a known MCP config path | Launch the client once to create config dirs |
| `RUNTIME_ALREADY_REGISTERED` | BehalfID already present and `--force` not set | Use `--force` to rewrite registration |
| `SERVER_WRAP_SKIPPED` | A server could not be wrapped under `--wrap` | See `details.reason`; wrap remaining servers manually if needed |
| `NO_SERVERS_WRAPPED` | `--wrap` found no wrappable stdio servers | Register-only install proceeded; add servers then re-run with `--wrap` |
| `NOT_INSTALLED` | Uninstall with nothing installed (soft warning) | Run `install` first if configuration is expected |

JSON results include `remediation` on many errors when the installer can suggest a fix.

## Platform notes

### Windows

- Paths use `%APPDATA%`, `%LOCALAPPDATA%`, and `%USERPROFILE%` via Node's `os.homedir()` and env vars.
- Ensure MCP config files are not open in an editor that locks writes during install.

### macOS

- Claude Desktop config lives under `~/Library/Application Support/Claude/`.
- Gatekeeper or sandboxing rarely blocks the installer itself (it only edits config files), but MCP runtime execution is the client's responsibility.

### Linux

- XDG config defaults to `~/.config` when `XDG_CONFIG_HOME` is unset.
- Codex uses `~/.codex/config.toml`.

## Getting more detail

Human-readable install with warnings:

```bash
npx @behalfid/install install
```

Dry run (no writes):

```bash
npx @behalfid/install install --dry-run --json
```

Library doctor from Node:

```ts
import { createDefaultInstaller } from "@behalfid/install";

const installer = createDefaultInstaller();
const report = await installer.doctor();
console.log(JSON.stringify(report, null, 2));
```

## When to reinstall vs repair

| Situation | Recommendation |
| --- | --- |
| Corrupt state file only | Delete `install-state.json`, run `install` |
| Corrupt MCP file | Fix syntax, then `install --force` |
| Wrong clients configured | `uninstall --clients ...` then `install` |
| Stale version after upgrade | `upgrade --json`, restart AI client |
| Complete reset | `uninstall`, verify MCP files manually, `install` |
