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

When BehalfID successfully returns a `required` policy, the managed launch path enforces required-mode prerequisites (agent credentials and a valid profile or session) before starting the tool.

Managed Profiles govern the BehalfID-managed launch path. Directly invoking the underlying binary, changing PATH precedence, deleting the shim, or otherwise intentionally bypassing the local integration is not prevented by the current implementation. Server-side policy evaluations, approval decisions, and authorization results are authoritative when requests reach BehalfID. Local shim enforcement is best-effort and is not a tamper-resistant endpoint security control.

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

| Check | Pass | Fail | How to verify |
|-------|------|------|---------------|
| CLI installed | ☐ | ☐ | `npm install -g @…/cli` (see `packages/cli/package.json`) |
| Authenticated | ☐ | ☐ | `behalf login` → `behalf whoami` |
| Shims installed | ☐ | ☐ | `behalf profile install` → files in `~/.behalf/bin/` |
| PATH order | ☐ | ☐ | `behalf profile status` — shim path before real binary |
| Status detects tool/repo/branch | ☐ | ☐ | `behalf profile status --tool claude` |
| Simulate returns mode/reason | ☐ | ☐ | `behalf profile simulate --tool claude` |
| Launch records activity | ☐ | ☐ | Launch `claude` → `/dashboard/managed-profiles/activity` |
| Activity shows repo hash only | ☐ | ☐ | No raw paths or git remotes in activity rows |
| Protected repo enrollment | ☐ | ☐ | Enroll hash from Activity or dashboard |
| Required-mode behavior clear | ☐ | ☐ | Simulate shows `required` + reason; launch enforces credentials when server returns required |
| Pause approval works | ☐ | ☐ | `behalf pause …` → approve in dashboard → retry or `behalf pause status` |
| Doctor output actionable | ☐ | ☐ | `behalf profile doctor` — each warn/error includes a `fix:` line |

### Common first-run failures

**`~/.behalf/bin` not first in PATH** — Managed tools resolve the real binary instead of the shim. Add `export PATH="$HOME/.behalf/bin:$PATH"` to your shell config, restart the terminal, and confirm PATH ordering is `ok` in `behalf profile status`.

**Real `claude`/`codex`/`cursor` binary not found** — Install the tool first. `behalf profile install` skips tools whose binaries are missing. Doctor shows which real binary could not be resolved.

**Unauthenticated CLI** — Run `behalf login`. Status and simulate need a session; when the server returns `required`, launches refuse to start without agent credentials.

**Server unavailable** — Behavior depends on the local policy cache. A fresh cached `required` policy causes the managed launch path to fail closed so a previously required context is not silently downgraded. If no usable cached required policy exists (missing or expired cache), the CLI may fall back to unmanaged operation so a BehalfID outage does not indefinitely block developer work. Check `behalf config get base-url` and network access.

**Required mode prerequisites** — When mode is `required` and the server response is available, missing agent credentials or an incomplete profile/session cause the shim to refuse launch. That is separate from the outage fallback: server-down with no usable required cache may continue unmanaged; server-down with a fresh cached required policy fails closed.

**Protected repo hash not appearing** — Run from inside a git repo. Status shows `policy repo hash`; if `(none)`, confirm git remote or local root detection. Enroll only after a shim launch records activity.

**Activity not appearing after launch** — Confirm PATH order (shim, not real binary), authentication, and that Managed Profiles policy is enabled in the dashboard. Refresh Activity after a few seconds.

If the server is unavailable:

- A fresh cached `required` policy fails closed
- Missing or expired cache may fall back to unmanaged so developer work is not blocked indefinitely
- Fresh cached non-required policies may continue with the cached decision

## Privacy notes

- Shims do not embed tokens
- Activity and approvals show repo hashes (for example `0123456789abcdef`), tool, branch, and device id — not raw git remotes, local source paths, home directories, or secrets
- API keys and session cookies remain in `config.json` / `session` with mode `0600`
- Pause is auditable server-side (`CliAuditLog`)
- Work-hours decisions use server UTC time, not local clock
- Local shim enforcement is best-effort; server-side decisions remain authoritative when requests reach BehalfID

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
