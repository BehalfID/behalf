# Trajectus Claude Code pilot tester guide

This is the short path for a Trajectus engineer testing BehalfID with enterprise Claude Code on Windows PowerShell. The operator owns permission transitions and evidence review. Deep operator detail is in [PILOT_REHEARSAL.md](PILOT_REHEARSAL.md); record results in [PILOT_RESULTS_TEMPLATE.md](PILOT_RESULTS_TEMPLATE.md).

## Current checkpoint

Windows Claude Code 2.1.209 has now passed the allowed and denied shell canaries after the graceful-shutdown fix was rebuilt and relinked. The allowed command produced real shell output and request `req_8MLJRFhKUgTVeYpj` was allowed with no hook error. The denied command was blocked before shell-result output, request `req_qkBkxJ1tCPtkZ-WU` was denied with `command_blocked`, and the hook did not crash.

The approval-required canary is **paused**, not passed. The current agent-detail dashboard does not provide a clear, safe permission replacement/editing workflow. Do not change the canary permission to continue this step. Dashboard information architecture and permission-management UX will be handled in a separate PR.

## What is being tested

The Claude Code `PreToolUse` hook is the action-time gate. It runs `behalf hook pre-tool-use` before supported Claude tools and blocks a denied or approval-required call with exit code `2`.

Managed Profiles is a separate, optional launch-time shim. The BehalfID MCP server is advisory context and is not enforcement. An MCP response or a server-side denied row does not by itself prove that a shell command was prevented from running.

Known boundary: if BehalfID agent config or `/api/verify` is unavailable, the action-time hook warns and fails open after a bounded timeout. Do not describe this pilot path as universally fail-closed.

## 1. Install or verify the CLI

The supported Windows install is npm:

```powershell
npm install -g @behalfid/cli
Get-Command behalf -All | Select-Object CommandType, Name, Source, Version
behalf --version
Get-Command claude -All | Select-Object CommandType, Name, Source, Version
claude --version
```

Use the operator-approved CLI build/version. Record the exact versions and resolved paths.

## 2. Configure the dedicated pilot agent

Use only the canary agent and base URL supplied through the secure pilot channel:

```powershell
behalf login
behalf whoami
behalf config set base-url <operator-approved-url>
behalf config set agent-id <canary-agent-id>
behalf config set api-key <canary-agent-key-from-secure-channel>
```

Do not paste the key into chat, screenshots, tickets, shell history captures, or this repository. Never run `behalf config list`, `behalf config get api-key`, `Get-ChildItem Env:`, or print the complete config/settings files during evidence collection.

## 3. Confirm the Claude Code hook

Launch once through BehalfID, then run doctor:

```powershell
behalf claude
behalf doctor
```

Doctor must find `behalf hook pre-tool-use` in `~/.claude/settings.json`. In Claude, open `/hooks` and confirm the `PreToolUse` hook is actually loaded. Enterprise policy can reject user-level hooks even when the file entry exists, so both checks are required.

## 4. Run one allowed action

After the operator confirms the canary permission is in non-approval mode, ask Claude:

```text
Use the real shell tool to run exactly this harmless command. Do not simulate it:
echo behalfid-allowed
```

Pass criteria: Claude invokes the real shell tool, the shell result contains `behalfid-allowed`, and BehalfID Activity/Logs shows an allowed `execute_command` on `shell` with a request ID and matching timestamp.

## 5. Run one denied action

Ask Claude:

```text
Use the real shell tool to attempt exactly this harmless command. Do not claim it ran unless a shell result exists:
echo behalfid-canary
```

Pass criteria: the real shell tool is attempted, the hook blocks it, Activity/Logs shows a denied `execute_command` on `shell`, and the marker does not appear in the shell-result area. The command can appear in Claude's proposed tool call or prose; label that separately. A denied log row without non-execution proof is not enough.

## 6. Request one approval-gated action — paused

Do not execute this step until the operator confirms that a clear, safe dashboard permission replacement/editing workflow is available and explicitly unpauses the canary. That dashboard information-architecture and permission-management UX work belongs to a separate PR. The criteria below describe the future validation; they do not indicate a pass.

Wait for the operator to confirm the earlier non-approval permission is no longer active and the intended `execute_command` / `shell` permission now requires approval.

Ask Claude to run exactly:

```text
echo behalfid-approval-canary
```

Then:

1. Confirm the first attempt is blocked with approval required and no shell output.
2. Open Action Inbox and check the exact preview `echo behalfid-approval-canary`.
3. Attempt approval as the requester. It must be disabled or rejected.
4. Have the authorized second user approve from a separate browser profile/device.
5. Retry the identical command. It may execute once.
6. Retry it again without a new approval. It must be blocked.
7. Try `echo behalfid-approval-canary-changed`. It must create/require a different approval and must not reuse the original grant.

Capture request ID, approval ID, permission ID, timestamps, the consumed/used state, and proof that only one retry produced shell output.

## 7. Review Activity and Action Inbox

Use the workspace dashboard:

- Activity/Logs: correlate allowed, denied, and approval-required decisions by request ID and timestamp.
- Action Inbox/Approvals: confirm the exact command preview, requester self-approval block, second-user resolution, and used/consumed state.

Optional sanitized CLI view:

```powershell
behalf --json logs list <canary-agent-id> --action execute_command --limit 20
```

Do not save complete config, environment, cookies, or any secret-bearing output.

## 8. Report friction or defects

For each issue, send the operator:

- ISO timestamp and timezone
- Windows, PowerShell, BehalfID CLI, and Claude Code versions
- resolved CLI/Claude paths and whether a Managed Profiles shim was first in PATH
- canary step and observed behavior
- request/approval/permission IDs, but no API key
- sanitized terminal capture or screenshot
- whether the marker appeared in a proposed tool call, agent prose, or actual shell output

Stop the pilot immediately for actual execution of a denied command, self-approval success, approval reuse by changed command text, cross-workspace evidence, or more than one consumer of a single grant.

## Troubleshooting

### Doctor finds the hook but Claude `/hooks` does not

Enterprise Claude policy may set `allowManagedHooksOnly`. Send the sanitized doctor result and `/hooks` capture to the Trajectus Claude administrator. Do not edit managed policy yourself.

### No verification row appears

Confirm the tool was a real supported shell call, the hook appears in `/hooks`, the canary agent ID is correct, and the test did not run through an unmapped tool. Glob, Grep, and TodoWrite are not shell enforcement canaries.

### The hook says verification unavailable

The action-time hook fails open in this state. Stop the enforcement canary, restore the operator-approved base URL/network, and rerun. Record the outage separately; do not count it as an allow/deny pass.

### Approval preview differs

Do not approve it. Approval is bound to the exact complete command. Capture the preview and request ID, then report the mismatch.

### Cleanup

Follow the operator's cleanup authorization. Revoke/remove only named canary permissions; do not create or rotate keys, delete the agent, change members, or alter billing unless separately authorized. Preserve sanitized evidence and confirm it contains no API keys, cookies, tokens, or full config files.
