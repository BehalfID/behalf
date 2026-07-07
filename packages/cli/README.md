# CLI — Managed Profiles

Managed Profiles let teams put coding-agent CLIs behind a workspace policy checkpoint, install local shims, resolve policy before the real tool starts, and record safe activity for review.

- Enforce managed or required mode for protected repos
- Simulate policy before launching a tool
- Approve required-mode pause requests
- Review activity without exposing raw paths or git remotes

## What Managed Profiles do

Managed profiles intercept `claude`, `codex`, and `cursor` through local shims. When you run a tool through the shim:

1. The shim calls `behalf __shim-launch <tool> …`
2. The CLI POSTs to `/api/cli/session-policy` with repo context
3. The server returns `unmanaged`, `managed`, or `required`
4. The CLI launches the real binary with session environment variables (`BEHALF_SESSION_ID`, `BEHALF_MODE`, and related values)

If mode is `required` and credentials or policy cannot be established, the CLI **fails closed**.

## First-run quickstart

Install the CLI globally using the package name from `packages/cli/package.json` (`npm install -g @…/cli`), then run:

```bash
npm install -g @…/cli
behalf login
behalf profile install
behalf profile status --tool claude
behalf profile simulate --tool claude
claude
```

`behalf profile install` creates `~/.behalf/bin/` with shims and prints PATH instructions when needed:

```bash
export PATH="$HOME/.behalf/bin:$PATH"
```

Options:

- `--dry-run` — preview without writing files
- `--tools claude,codex,cursor` — install a subset

Install is idempotent. Non-managed files at shim paths are never overwritten.

## Dashboard setup path

Open **Managed profiles** in the dashboard (`/dashboard/managed-profiles`). The onboarding card walks through the same sequence:

1. **Install shims** — `npm install -g @…/cli`, then `behalf login` and `behalf profile install`
2. **Verify status** — `behalf profile status --tool claude`
3. **Simulate policy** — `behalf profile simulate --tool claude`
4. **Launch a managed tool** — `claude` (through the shim)

Enable managed profile policy in the dashboard before expecting enforcement. After your first shim launch, use **Managed Profile Activity** (`/dashboard/managed-profiles/activity`) to enroll protected repos without copying hashes manually.

## Policy simulation

```bash
behalf profile simulate --tool claude
behalf profile simulate --tool codex --repo 0123456789abcdef --branch main
behalf profile simulate --tool claude --json
```

Dry-runs managed profile policy resolution via `POST /api/cli/session-policy/simulate`. Does not launch a tool, grant pause leases, or write local pause mirrors.

Options:

- `--tool <tool>` — tool to simulate (default: `claude`)
- `--repo <hash>` — policy repo hash (defaults to detected repo hash)
- `--branch <branch>` — branch name (defaults to detected branch)

Human output includes mode, reason, matched rule type, and whether pause approval would be required for `required` mode.

The dashboard policy simulator (`/dashboard/managed-profiles`) uses the same API for dry-runs without a local shim launch.

## Protected repos

Protected repos are identified by **policy repo hash** — not raw git remotes or local source paths.

```bash
behalf profile status --tool claude
```

Shows shim installation, PATH ordering, repo/branch detection, and the policy repo hash used for dashboard protected repos and server policy matching. The hash is derived from the git remote URL when available, otherwise from the local repo root. Raw git remotes are never displayed in CLI or dashboard output.

Enroll protected repos from:

- **Managed profiles** → Protected repos (`/dashboard/managed-profiles`)
- **Managed Profile Activity** — enroll directly from an activity row after a shim launch

Set per-repo mode to `managed` or `required`. In `required` mode, the CLI fails closed when policy cannot be verified.

## Required-mode pause approval

Pause is policy-approved — not a bypass:

```bash
behalf pause --duration 30m --reason "personal project"
behalf pause --duration 2h --reason "offline work" --scope current_repo --tool claude
behalf pause status apr_example
behalf pause --duration 30m --reason "incident response" --wait
behalf resume
```

When workspace policy requires enforcement (`required` mode), pause is denied unless the workspace enables `pausePolicy.requireApprovalForRequiredMode`. The CLI then receives an approval request id (for example `apr_example`) and a workspace approver must approve in the dashboard before retrying.

Approver view:

- Pending requests: `/dashboard/approvals` or **Needs attention** (`/dashboard/inbox`)
- Each pause approval shows approval id, requester, tool, repo hash or all-repos scope, branch, device id (for example `devmac_example`), duration, pause reason, and policy context
- Approved grants appear under **Recently approved grants** until expiry
- Pause events also appear in **Managed profile activity**

### Manual retry vs `--wait`

- **Manual retry:** run the same `behalf pause` command again after approval
- **`behalf pause status apr_xxx`:** check whether an approval is `pending`, `approved`, `denied`, `used`, or `expired`
- **`--wait`:** poll every 5 seconds (default timeout 10 minutes) and automatically retry once when approved

Leases are scoped, require a reason, and expire (max 4 hours by default).

## Check status and doctor

```bash
behalf profile status
behalf profile status --tool claude
behalf profile doctor
```

`doctor` checks CLI version, auth, shim files, real binary resolution, PATH ordering, repo detection (including policy repo hash), and policy/pause API connectivity.

## Troubleshooting / launch checklist

| Check | Command or location |
|-------|---------------------|
| CLI installed | `npm install -g @…/cli` (see `packages/cli/package.json`) |
| Authenticated | `behalf login` → `behalf whoami` |
| Shims installed | `behalf profile install` → files in `~/.behalf/bin/` |
| PATH order | `behalf profile status` — shim path before real binary |
| Policy enabled | Managed profiles dashboard — policy not disabled |
| Simulate works | `behalf profile simulate --tool claude` |
| Activity recorded | Launch `claude` → `/dashboard/managed-profiles/activity` |
| Protected repo | Enroll repo hash from Activity or dashboard |
| Pause approval | `behalf pause …` → approve in dashboard |

If the server is unavailable:

- Unmanaged contexts may continue
- Required contexts fail closed unless a valid cached policy allows continuity

## Privacy notes

- Shims do not embed tokens
- Activity and approvals show repo hashes (for example `0123456789abcdef`), tool, branch, and device id — not raw git remotes, local source paths, home directories, or secrets
- API keys and session cookies remain in `config.json` / `session` with mode `0600`
- Pause is auditable server-side (`CliAuditLog`)
- Work-hours decisions use server UTC time, not local clock
- Required mode never silently falls back to unmanaged when policy cannot be verified

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

## Dev walkthrough

```bash
node scripts/dev/managed-profile-walkthrough.mjs
```

## Server dev overrides

| Variable | Effect |
|----------|--------|
| Server env (BEHALF+ID_CLI_POLICY_MODE) | Force `unmanaged`, `managed`, or `required` |
| Server env (BEHALF+ID_CLI_REQUIRED_ACCOUNT_IDS) | Comma-separated account IDs that always use `required` |
