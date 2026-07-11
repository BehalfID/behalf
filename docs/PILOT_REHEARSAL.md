# Trajectus Pilot Rehearsal Runbook

Internal operator runbook for a **two-user** Trajectus-style Claude Code pilot rehearsal.

This document prepares and orchestrates a **manual** rehearsal. It does not replace the rehearsal with mocked tests. Passing documentation builds or unit tests does **not** mean the rehearsal passed.

Related docs (do not duplicate here):

- [API.md](API.md) — `/api/verify`, approvals, path/command constraints, `policyContext`
- [TESTING.md](TESTING.md) — automated regression coverage (including approval-grant atomicity)
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md) — Claude Code PreToolUse hook scope and limits
- [CLI docs](/docs/cli) (`app/docs/cli/page.tsx`) — install, auth, `behalf claude`, doctor
- [README.md](../README.md) — product overview and CLI/MCP quickstart

---

## Roles

| Role | Who | Responsibilities |
|---|---|---|
| **Operator** | BehalfID internal | Workspace setup, plan assignment, permission matrix, evidence collection, go/no-go |
| **Engineer / requester** | Trajectus engineer (workspace member) | Install CLI + hook, run Claude Code scenarios, retry after approval, capture request IDs |
| **Engineering lead / approver** | Separate Trajectus user (workspace member with sufficient authority) | Review Action Inbox, approve/deny, never share the requester’s agent API key |

**Hard rules**

- Engineer and approver must be **separate workspace users**.
- Use **separate browser profiles or devices** (no shared session cookies).
- No shared agent API keys between testers.
- Do not edit Mongo documents manually. Use the dashboard, public APIs, CLI, or documented admin scripts only.

---

## Environment

| Requirement | Notes |
|---|---|
| Latest deployed `main` (or the agreed pilot deploy) | Record the exact commit SHA in [PILOT_RESULTS_TEMPLATE.md](PILOT_RESULTS_TEMPLATE.md) |
| Dedicated test workspace | Not a production customer workspace |
| Enterprise plan | Assign with the existing account plan script (below) |
| Disposable repository | Empty or throwaway git repo for Claude Code sessions |
| Dedicated agent credentials for the engineer | One agent, one key, engineer machine only |
| Claude Code | Current stable install on the engineer’s machine |
| BehalfID CLI | Current published npm package **or** locally packed build — state which in results |

### Placeholders (never real secrets)

```txt
acct_test
agent_test
bhf_sk_REDACTED
```

Use real IDs only in private operator notes; sanitize before filing evidence.

### Deploy prerequisite

The deployed pilot environment must use a `main` commit that includes the
approval-grant integrity work merged in PR #111.

Before starting scenarios 3–9 and 15–16, record the deployed commit in
`PILOT_RESULTS_TEMPLATE.md` and confirm that the Action Inbox displays bounded
command/file-path previews.

Source code support is present on current `main`; this check exists to prevent
testing against an older production deployment.

Hard path/command denials, self-approval, authority checks, and hook fail-open
behavior can still be exercised when validating other scenarios, but substitution
and exact-intent scenarios require the deployed commit above.

---

## Setup sequence

Exact supported path (no Mongo hand-edits):

1. **Create or select the dedicated workspace** in the developer dashboard (operator or workspace owner account).
2. **Invite the approver** as a separate workspace member with authority at least **Engineering Lead** (`ENGINEERING_LEAD`, authority 80) so they can approve typical coding-agent permissions. Confirm the requester is a distinct member (e.g. Engineer).
3. **Assign the enterprise plan** using the existing script (from a safe non-production operator environment with `ALLOW_ACCOUNT_PLAN_OVERRIDE` configured per script docs):

   ```bash
   npm run account:set-plan -- --account-id acct_test --plan enterprise --dry-run
   npm run account:set-plan -- --account-id acct_test --plan enterprise --confirm
   ```

   See `scripts/set-account-plan.ts`. Do not force Stripe-linked accounts without understanding webhook overwrite risk (`--force` only when intentional).

4. **Create a dedicated Claude Code agent** in the dashboard (or `behalf agents create --name "Trajectus Pilot" --save` after login). Record `agent_test`. Store `bhf_sk_REDACTED` only on the engineer’s machine; show-once key is never pasted into shared docs.
5. **Install and authenticate the CLI** on the engineer machine (see [Supported installation commands](#supported-installation-commands)).
6. **Install the Claude PreToolUse hook** via the supported launcher:

   ```bash
   behalf claude
   ```

   This merges `behalf hook pre-tool-use` into `~/.claude/settings.json` (idempotent). See [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md).

7. **Run doctor checks:**

   ```bash
   behalf doctor
   ```

8. **Confirm hook presence** in Claude settings (`~/.claude/settings.json` → `hooks.PreToolUse` includes `behalf hook pre-tool-use`). Doctor should report the hook as installed.
9. **Configure command and file permissions** using the dashboard and/or CLI (`behalf permissions create …`) — see [Test permission matrix](#test-permission-matrix). Prefer dashboard for visibility during the pilot.
10. **Confirm both users** can open the correct workspace, Action Inbox (`/dashboard/inbox`), Approvals (`/dashboard/approvals`), and Logs (`/dashboard/logs`).

Optional local helper (no approvals, no Mongo writes):

```bash
npx tsx scripts/pilot-rehearsal-prep.ts --check
npx tsx scripts/pilot-rehearsal-prep.ts --sandbox
npx tsx scripts/pilot-rehearsal-prep.ts --collect path/to/capture.txt
```

---

## Supported installation commands

Document the **exact source under test** in the results template.

For the Trajectus pilot, the installed CLI must report **0.2.9 or newer**. If `behalf --version` is older than `0.2.9`, **stop and contact the operator** — do not continue the rehearsal on a stale build.

| Method | Command | Notes |
|---|---|---|
| npm (supported on Windows) | `npm install -g @behalfid/cli` | Preferred Windows path |
| curl / `install.sh` (macOS / Linux only) | `curl -fsSL https://behalfid.com/install.sh \| sh` | Optional pin (assign to `sh`, not `curl`): `curl -fsSL https://behalfid.com/install.sh \| BEHALF_VERSION=v0.2.9 sh` |
| Homebrew (macOS only) | `brew install BehalfID/tap/behalf` | Not for Windows/Linux |
| Local pack (dev) | From repo: `npm run build` in `packages/cli`, then `npm pack` / `npm install -g ./behalfid-cli-*.tgz` — record tarball version | |
| Verify (required) | `behalf --version` | Must be `0.2.9` or newer |
| Auth | `behalf login` then `behalf whoami` | |
| Agent config | `behalf config set base-url https://behalfid.com` (or deploy URL); `behalf config set agent-id agent_test`; `behalf config set api-key bhf_sk_REDACTED` | |
| Hook + launch | `behalf claude` | |
| Doctor | `behalf doctor` | |
| Optional MCP context | `behalf mcp init` (MCP is complementary; PreToolUse hook is the hard gate for this pilot) | |

Record **installation channel** and **exact version string** in the results template.

Full CLI walkthrough: [/docs/cli](/docs/cli).

---

## Test permission matrix

**Pilot examples only** — not a universal recommended enterprise policy.

Create these on `agent_test` via dashboard or CLI. Adjust paths for the disposable repo root.

### Command approval

```txt
action: execute_command
resource: shell
requiresApproval: true
deniedCommands:
  - rm -rf
  - curl
```

CLI sketch:

```bash
behalf permissions create agent_test \
  --action execute_command \
  --resource shell \
  --requires-approval \
  --denied-commands "rm -rf,curl"
```

**Safe rehearsal commands** (cross-platform where possible):

| Intent | Windows (PowerShell / cmd) | macOS / Linux |
|---|---|---|
| Benign allow-after-approval | `echo pilot-ok` | `echo pilot-ok` |
| Denied literal (must not execute) | `echo blocked-rm-rf-token` containing substring — use a string that includes `rm -rf` as text, e.g. `echo "pilot denies rm -rf"` so denial fires on substring without deleting files | same |
| Denied `curl` literal | `echo "pilot denies curl"` | same |

Do **not** run genuinely destructive commands. For denied-command tests, use a harmless command string that **contains** the blocked literal; expect `command_blocked` before any shell execution.

### File-write approval

```txt
action: write_file
resource: filesystem
requiresApproval: true
allowedPaths:
  - pilot-sandbox/**
deniedPaths:
  - "**/.env"
  - "~/.ssh/**"
```

```bash
behalf permissions create agent_test \
  --action write_file \
  --resource filesystem \
  --requires-approval \
  --allowed-paths "pilot-sandbox/**" \
  --denied-paths "**/.env,~/.ssh/**"
```

Create the sandbox with `npx tsx scripts/pilot-rehearsal-prep.ts --sandbox` (writes only under the disposable repo).

### File-read coverage

Add a `read_file` permission when you need to exercise protected-path denials without blocking normal Claude navigation of the disposable repo:

```txt
action: read_file
resource: filesystem
requiresApproval: false
# Optional: deniedPaths for **/.env and ~/.ssh/** only
# Avoid broad requiresApproval on read_file unless scenario 7–9 need it
```

Keep read rules narrow so Claude can still list/read ordinary project files.

---

## Required scenarios

For each scenario, fill pass/fail and notes in [PILOT_RESULTS_TEMPLATE.md](PILOT_RESULTS_TEMPLATE.md).

Shared evidence hygiene: capture request IDs, approval IDs, timestamps, screenshots of Action Inbox (redacted), and CLI stderr. Never paste raw `bhf_sk_`, passwords, or full `.env` contents.

### 1. Clean CLI installation

| Field | Content |
|---|---|
| Preconditions | Fresh machine or clean PATH; no stale `behalf` binary preferred |
| Requester action | Install via chosen method; run `behalf --version` |
| Expected Action Inbox | N/A |
| Approver action | N/A |
| Retry action | N/A |
| Expected verification result | CLI runs; version is **0.2.9 or newer**; record channel + version |
| Evidence | Version string + install method (npm / install.sh / Homebrew / local pack) |
| Pass/Fail | |
| Notes | If version &lt; 0.2.9, stop and contact the operator |

### 2. Hook installation and doctor verification

| Field | Content |
|---|---|
| Preconditions | CLI authenticated; agent configured |
| Requester action | `behalf claude` (or confirm hook already installed); `behalf doctor` |
| Expected Action Inbox | N/A |
| Approver action | N/A |
| Retry action | N/A |
| Expected verification result | Doctor reports PreToolUse hook installed; settings contain `behalf hook pre-tool-use` |
| Evidence | Doctor output (sanitized); settings snippet without secrets |
| Pass/Fail | |
| Notes | |

### 3. Exact command approval

| Field | Content |
|---|---|
| Preconditions | Pilot deployment containing PR #111; execute_command permission with `requiresApproval` |
| Requester action | Ask Claude to run `echo pilot-ok` (Bash/PowerShell as appropriate) |
| Expected Action Inbox | Pending approval with command preview `echo pilot-ok` |
| Approver action | Approve as non-requester with sufficient authority |
| Retry action | Requester retries the **same** command |
| Expected verification result | Allowed once; command may execute |
| Evidence | requestId, approvalId, preview screenshot |
| Pass/Fail | |
| Notes | |

### 4. Command substitution rejection

| Field | Content |
|---|---|
| Preconditions | Fresh grant from scenario 3 **not** reused; or new approval for command A only |
| Requester action | Obtain approval for `echo pilot-ok`; then retry with a **different** command sharing the same action/resource (e.g. `echo pilot-substituted`) |
| Expected Action Inbox | Original grant consumed or not applicable to substituted command; new pending approval for substituted command |
| Approver action | Do not approve the substituted command for this scenario |
| Retry action | Substituted command retry |
| Expected verification result | **Denied** / new `approvalRequired` — substitution must not consume the prior grant |
| Evidence | Both requestIds; outcomes |
| Pass/Fail | |
| Notes | Substitution success is a **P0** — stop the pilot |

### 5. Single-use grant rejection on second retry

| Field | Content |
|---|---|
| Preconditions | Approved exact command; first retry already succeeded |
| Requester action | Retry the **same** command a second time without a new approval |
| Expected Action Inbox | No reusable approved grant |
| Approver action | N/A (unless new pending appears) |
| Retry action | Second retry |
| Expected verification result | Denied with `approvalRequired` (or equivalent); grant not reusable |
| Evidence | requestIds for first allow + second deny |
| Pass/Fail | |
| Notes | |

### 6. Concurrent retry behavior

See [Concurrent consumption test](#concurrent-consumption-test).

| Field | Content |
|---|---|
| Preconditions | One approved, unused grant for an exact command on the current pilot deployment |
| Requester action | Fire multiple near-simultaneous retries of the **same** approved command |
| Expected Action Inbox | Grant moves to used at most once |
| Approver action | N/A |
| Retry action | Parallel retries |
| Expected verification result | **At most one** request allowed by the approved single-use grant |
| Evidence | Every requestId + outcome |
| Pass/Fail | |
| Notes | Operational supplement to Mongo integration tests — not a proof of atomicity by itself |

### 7. Exact file-path approval

| Field | Content |
|---|---|
| Preconditions | write_file permission; path under `pilot-sandbox/` |
| Requester action | Ask Claude to write a small file e.g. `pilot-sandbox/note.txt` |
| Expected Action Inbox | Pending with path preview |
| Approver action | Approve |
| Retry action | Same path write |
| Expected verification result | Allowed once |
| Evidence | requestId, approvalId, path preview |
| Pass/Fail | |
| Notes | |

### 8. File-path substitution rejection

| Field | Content |
|---|---|
| Preconditions | Approval for `pilot-sandbox/note.txt` only |
| Requester action | Retry write to a different allowed path e.g. `pilot-sandbox/other.txt` |
| Expected Action Inbox | New pending for new path; prior grant not applicable |
| Approver action | Do not approve for this scenario |
| Retry action | Substituted path |
| Expected verification result | Denied / new `approvalRequired` |
| Evidence | Both requestIds |
| Pass/Fail | |
| Notes | Substitution success is a **P0** — stop the pilot |

### 9. Canonically equivalent path retry

| Field | Content |
|---|---|
| Preconditions | Current pilot deployment; lexical canonicalization enabled |
| Requester action | Approve write to `pilot-sandbox/note.txt`; retry with an equivalent form (e.g. `pilot-sandbox/./note.txt` or OS-separator variant) that canonicalizes to the same path |
| Expected Action Inbox | Same intent / consumable grant |
| Approver action | Approve once |
| Retry action | Canonically equivalent path |
| Expected verification result | Allowed (same canonical path); grant consumed |
| Evidence | Paths used + requestIds |
| Pass/Fail | |
| Notes | Document OS; do not require filesystem existence |

### 10. Denied-command precedence

| Field | Content |
|---|---|
| Preconditions | `deniedCommands` includes `rm -rf` |
| Requester action | Ask Claude to run a **harmless** string containing `rm -rf` (e.g. `echo "pilot denies rm -rf"`) |
| Expected Action Inbox | No approval that overrides the hard deny |
| Approver action | If a pending appears, deny or leave; hard constraint must still win on verify |
| Retry action | Same command after any mistaken approval |
| Expected verification result | `command_blocked` (or equivalent deny); command not executed |
| Evidence | stderr / log reason |
| Pass/Fail | |
| Notes | |

### 11. Denied-path precedence

| Field | Content |
|---|---|
| Preconditions | `deniedPaths` includes `**/.env` |
| Requester action | Attempt write (or constrained read) targeting a `.env` path |
| Expected Action Inbox | Hard deny; approval must not override |
| Approver action | N/A / confirm cannot bypass |
| Retry action | Same path |
| Expected verification result | `path_not_permitted` |
| Evidence | requestId + reason |
| Pass/Fail | |
| Notes | Prefer a disposable `.env` stub inside the repo, not real secrets |

### 12. Self-approval rejection

| Field | Content |
|---|---|
| Preconditions | Pending approval created by requester’s agent activity |
| Requester action | Requester opens Approvals and attempts to approve own request |
| Expected Action Inbox | Pending remains |
| Approver action | N/A (requester is acting) |
| Retry action | N/A |
| Expected verification result | UI/API rejects with self-approval error (`You cannot approve your own request.`) |
| Evidence | Error message screenshot |
| Pass/Fail | |
| Notes | Even OWNER requester must be blocked |

### 13. Insufficient-authority rejection

| Field | Content |
|---|---|
| Preconditions | Pending approval requiring Engineering Lead (or higher); a member with lower authority available |
| Requester action | Trigger approval-required action |
| Expected Action Inbox | Pending with required authority visible |
| Approver action | Lower-authority user attempts approve |
| Retry action | N/A |
| Expected verification result | Rejected for insufficient authority |
| Evidence | Error + roles |
| Pass/Fail | |
| Notes | Then approve successfully with Engineering Lead |

### 14. Approval expiry

| Field | Content |
|---|---|
| Preconditions | Approved grant; default TTL **30 minutes** (`APPROVAL_GRANT_TTL_MS`) |
| Requester action | Wait until after `grantExpiresAt` (or operator-assisted clock policy for rehearsal — do not hack production clocks) |
| Expected Action Inbox | Grant no longer consumable |
| Approver action | N/A |
| Retry action | Same command/path after expiry |
| Expected verification result | Denied / new `approvalRequired` |
| Evidence | grantExpiresAt + requestIds |
| Pass/Fail | |
| Notes | For time-boxed rehearsals, schedule this near the end or use a documented shorter test-only TTL if one exists on the deploy — do not invent one |

### 15. Secret-redacted command preview

| Field | Content |
|---|---|
| Preconditions | Current pilot deployment with bounded Action Inbox previews |
| Requester action | Trigger approval for a command that embeds a fake key pattern, e.g. `echo bhf_sk_REDACTED_FAKE` |
| Expected Action Inbox | Preview shows redacted key material for known formats |
| Approver action | Inspect preview only |
| Retry action | N/A |
| Expected verification result | Preview redacts `bhf_sk_` / Bearer-style patterns; raw secret not stored on approval doc |
| Evidence | Inbox screenshot |
| Pass/Fail | |
| Notes | Not every possible secret is detectable — see tester guide |

### 16. Truncated command preview

| Field | Content |
|---|---|
| Preconditions | Current pilot deployment; preview max length 500 characters |
| Requester action | Trigger approval with a command string longer than the preview limit (harmless `echo` of long padding) |
| Expected Action Inbox | Truncated preview; truncation indicator if provided |
| Approver action | Inspect |
| Retry action | N/A |
| Expected verification result | Preview bounded; full raw `policyContext` not persisted on approval |
| Evidence | Preview length / UI |
| Pass/Fail | |
| Notes | |

### 17. Verification-log inspection

| Field | Content |
|---|---|
| Preconditions | Several allow/deny/approval decisions already generated |
| Requester action | Open `/dashboard/logs` and/or `behalf logs agent_test` |
| Expected Action Inbox | N/A |
| Approver action | Confirm same workspace scope |
| Retry action | N/A |
| Expected verification result | Entries show requestId, decision, safe fields; no raw API keys; no raw `policyContext` blob |
| Evidence | Sanitized log export or screenshot |
| Pass/Fail | |
| Notes | |

### 18. Workspace tenant-isolation check

| Field | Content |
|---|---|
| Preconditions | Second workspace or foreign approval/log IDs |
| Requester action | Attempt to open another workspace’s approval/log URLs while authenticated to the test workspace |
| Expected Action Inbox | Only own-workspace items |
| Approver action | Same check |
| Retry action | N/A |
| Expected verification result | Foreign resources not visible / not actionable |
| Evidence | HTTP status or empty/denied UI |
| Pass/Fail | |
| Notes | **P0** if cross-tenant access succeeds |

### 19. Missing local configuration behavior

| Field | Content |
|---|---|
| Preconditions | Temporarily clear agent id or API key from CLI config (backup first) |
| Requester action | Invoke a mapped tool via Claude |
| Expected Action Inbox | No new verify from this machine |
| Approver action | N/A |
| Retry action | N/A |
| Expected verification result | Hook **fails open** with stderr that config is missing; tool may proceed — document as understood boundary |
| Evidence | stderr line |
| Pass/Fail | |
| Notes | Restore config immediately after |

### 20. API/service-unavailability behavior

| Field | Content |
|---|---|
| Preconditions | Point `base-url` at an unreachable host **or** block network briefly |
| Requester action | Mapped tool call |
| Expected Action Inbox | N/A |
| Approver action | N/A |
| Retry action | N/A |
| Expected verification result | Hook **fails open** on verification unavailable; restore URL after |
| Evidence | stderr |
| Pass/Fail | |
| Notes | Local fail-open is intentional for coding-agent UX; govern devices in production |

### 21. Unmapped-tool observation

| Field | Content |
|---|---|
| Preconditions | Hook installed |
| Requester action | Use an intentionally unmapped tool (e.g. Glob, Grep, TodoWrite per compatibility matrix) |
| Expected Action Inbox | No BehalfID gate for that tool |
| Approver action | N/A |
| Retry action | N/A |
| Expected verification result | Tool runs without BehalfID verify; record observation |
| Evidence | Tool name + note “unmapped” |
| Pass/Fail | |
| Notes | Not a bypass of mapped tools — expected scope limit |

### 22. Actual `Monitor` usage observation

| Field | Content |
|---|---|
| Preconditions | Hook installed; execute_command permission as needed |
| Requester action | Cause Claude Code to use **Monitor** with a shell `command` if the build supports it; also note Monitor without `command` if observed |
| Expected Action Inbox | Command-backed Monitor → treated as `execute_command` (approval/deny per policy); Monitor without command → unmapped / allow-through |
| Approver action | As needed for command-backed case |
| Retry action | As needed |
| Expected verification result | Matches [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md) mapping |
| Evidence | Tool observation row in results template |
| Pass/Fail | |
| Notes | Do not force unsafe monitor commands |

---

## Concurrent consumption test

**Goal:** Operational confirmation that at most one near-simultaneous retry consumes a single-use grant.

**Safe method (no destructive commands):**

1. Approve a pending request for a benign exact command, e.g. `echo pilot-concurrent`.
2. Do **not** retry yet.
3. From the engineer machine, prepare two (or more) near-simultaneous retries of the **same** command via Claude retries **or** parallel `behalf verify` / hook invocations that present the **same** canonical command — prefer the same path the pilot uses in production (Claude retry) and optionally supplement with scripted verify calls that include identical `policyContext.toolInput.command`.
4. Record **every** `requestId` and `allowed` / `approvalRequired` outcome.

**Expected result:**

```txt
At most one request is allowed by the approved single-use grant.
```

Client-side timing alone does **not** prove database atomicity. This rehearsal supplements the existing Mongo atomic integration test on current `main` (see [TESTING.md](TESTING.md) / `test/integration`).

---

## Failure classification

| Severity | Meaning |
|---|---|
| **P0** | Authorization bypass, cross-tenant access, approval substitution, self-approval success, or destructive unsafe execution |
| **P1** | Supported pilot workflow blocked or materially misleading |
| **P2** | Usability issue with a documented workaround |
| **P3** | Cosmetic or post-pilot improvement |

**Any P0 → immediate pilot stop.** Preserve evidence; revoke agent key; notify Operator.

---

## Cleanup

1. Revoke or rotate the test agent API key in the dashboard.
2. Revoke temporary pilot permissions (`behalf permissions revoke …` or dashboard).
3. Remove or archive the disposable repository.
4. Remove test workspace members when appropriate.
5. Preserve **sanitized** evidence (results template, redacted screenshots).
6. Confirm no raw credentials were recorded in chat logs, tickets, or git.
7. Optionally remove the PreToolUse hook entry from `~/.claude/settings.json` on the engineer machine (or leave installed if the engineer continues testing — document choice).
8. `behalf logout` on shared operator machines if used.

---

## Go / no-go

| Decision | When |
|---|---|
| **Proceed** | No P0; P1s have owners and workarounds; scenarios 1–22 recorded |
| **Proceed with conditions** | No P0; named P1s accepted with dates |
| **Stop** | Any P0, or the **deployed environment** lacks approval-grant integrity (PR #111) when substitution scenarios are in scope — production may lag source `main` |

Record the decision in [PILOT_RESULTS_TEMPLATE.md](PILOT_RESULTS_TEMPLATE.md).
