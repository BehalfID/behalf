# CLI — Managed Profiles

Managed profiles intercept `claude`, `codex`, and `cursor` through local shims, resolve workspace policy from the server, and inject session environment variables before launching the real tool.

## Install once

```bash
behalf profile install
```

This creates `~/.behalf/bin/` with shims for `claude`, `codex`, and `cursor`, records the real binary paths, and prints PATH instructions when needed:

```bash
export PATH="$HOME/.behalf/bin:$PATH"
```

Options:

- `--dry-run` — preview without writing files
- `--tools claude,codex,cursor` — install a subset

Install is idempotent. Non-managed files at shim paths are never overwritten.

## How shims work

When you run `claude` (through the shim):

1. The shim calls `behalf __shim-launch claude …`
2. The CLI POSTs to `/api/cli/session-policy` with repo context
3. The server returns `unmanaged`, `managed`, or `required`
4. The CLI launches the real binary with:

   - `BEHALF_SESSION_ID`
   - `BEHALF_PROFILE_ID` (when applicable)
   - `BEHALF_MODE`
   - `BEHALF_WORKSPACE_ID` (when available)
   - `BEHALF_API_URL`

If mode is `required` and credentials or policy cannot be established, the CLI **fails closed**.

If the server is unavailable:

- Unmanaged contexts may continue
- Required contexts fail closed unless a valid cached policy allows continuity

## Check status

```bash
behalf profile status
behalf profile status --tool claude
```

Shows shim installation, PATH ordering, repo/branch detection, and the **policy repo hash** used for dashboard protected repos and server policy matching.

The policy repo hash is derived from the git remote URL when available, otherwise from the local repo root. Raw git remotes are never displayed.

## Doctor

```bash
behalf profile doctor
```

Checks CLI version, auth, shim files, real binary resolution, PATH ordering, repo detection (including policy repo hash), and policy/pause API connectivity.

## Pause (policy-approved, not a bypass)

```bash
behalf pause --duration 30m --reason "personal project"
behalf pause --duration 2h --reason "offline work" --scope current_repo --tool claude
behalf resume
```

Pause requests a **server-approved lease**. It is denied when workspace policy requires enforcement (`required` mode). Leases are scoped, require a reason, and expire (max 4 hours by default).

## Uninstall

```bash
behalf profile uninstall
behalf profile uninstall --purge
```

Removes only managed profile shims. With `--purge`, also clears shim metadata from `~/.behalf/config.json`.

## Local files

| Path | Purpose |
|------|---------|
| `~/.behalf/config.json` | API URL, device ID, workspace ID, real binary paths |
| `~/.behalf/bin/` | Shim binaries |
| `~/.behalf/shims.json` | Installed shim metadata |
| `~/.behalf/policy-cache.json` | Cached session policy responses |
| `~/.behalf/pause-lease.json` | Local mirror of the last granted pause lease (display only — not authoritative for policy) |

API keys and session cookies remain in `config.json` / `session` with mode `0600`.

## Dev walkthrough

```bash
node scripts/dev/managed-profile-walkthrough.mjs
```

## Server dev overrides

| Variable | Effect |
|----------|--------|
| Server env (BEHALF+ID_CLI_POLICY_MODE) | Force `unmanaged`, `managed`, or `required` |
| Server env (BEHALF+ID_CLI_REQUIRED_ACCOUNT_IDS) | Comma-separated account IDs that always use `required` |

## Security notes

- Shims do not embed tokens
- Pause is auditable server-side (`CliAuditLog`)
- Work-hours decisions use server UTC time, not local clock
- Required mode never silently falls back to unmanaged when policy cannot be verified
