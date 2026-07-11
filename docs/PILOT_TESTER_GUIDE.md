# Trajectus Pilot — Tester Guide

Short guide for an invited Trajectus engineer. Follow this without live assistance when possible. Operator runbook: [PILOT_REHEARSAL.md](PILOT_REHEARSAL.md). Results: [PILOT_RESULTS_TEMPLATE.md](PILOT_RESULTS_TEMPLATE.md).

---

## What BehalfID does in this pilot

BehalfID checks whether your Claude Code agent is allowed to perform certain actions (shell commands, file writes/reads, and other mapped tools) against permissions your workspace defines. When a permission requires approval, the action pauses until a **different** workspace user approves it in the Action Inbox.

> Claude Code tool calls routed through the installed BehalfID PreToolUse hook are checked against BehalfID permissions before execution.

## What it does not do

- It does **not** intercept every possible Claude Code behavior — only tools the hook maps and receives.
- It does **not** enforce Claude Desktop.
- It does **not** secure tools that are not routed through the hook (for example Glob, Grep, TodoWrite, and Monitor without a shell command — see [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md)).
- It does **not** stop someone who intentionally removes or bypasses the local hook. That is outside the current hard security boundary and should be governed with organizational device controls in a production deployment.
- It does **not** guarantee that every possible secret in a command string is redacted from approval previews — known key formats are best-effort.

---

## Supported enforcement boundary

| In scope | Out of scope |
|---|---|
| PreToolUse hook → `behalf hook pre-tool-use` → `POST /api/verify` | Direct Claude binary use with hook removed |
| Mapped tools (Write/Edit/Bash/PowerShell/Read/…; Monitor **with** `command`) | Unmapped tools; Claude Desktop |
| Server-side allow/deny/approval decisions | Tamper-resistant endpoint security on the laptop |

Network or missing local config causes the hook to **fail open** (allow with a stderr warning) so a BehalfID outage does not brick Claude. Treat that as a known boundary, not a silent “all clear.”

---

## Installation

Pick one method. Tell the operator which you used. For the Trajectus pilot, require **0.2.9 or newer**. If the version is older, **stop and contact the operator**.

```bash
# npm — supported on Windows (and macOS / Linux)
npm install -g @behalfid/cli

# install.sh — macOS / Linux only (optional pin)
# BEHALF_VERSION=v0.2.9 curl -fsSL https://behalfid.com/install.sh | sh
curl -fsSL https://behalfid.com/install.sh | sh

# Homebrew — macOS only
brew install BehalfID/tap/behalf
```

Verify (required):

```bash
behalf --version
```

Record the **installation channel** and the exact version string in your results. If the operator gives you a locally packed CLI tarball instead, install that and record the version string.

More detail: [CLI docs](/docs/cli).

---

## Authentication and agent config

```bash
behalf login
behalf whoami
```

Then configure **your** dedicated agent (values from the operator — never share the API key):

```bash
behalf config set base-url https://behalfid.com
behalf config set agent-id agent_test
behalf config set api-key bhf_sk_REDACTED
```

Use the real base URL for the pilot deploy if it is not production. Do not commit config or keys.

Optional project MCP context (complementary; the PreToolUse hook is the hard gate for this pilot):

```bash
behalf mcp init
```

---

## Hook installation

```bash
behalf claude
```

This launches Claude Code and installs the BehalfID PreToolUse hook into `~/.claude/settings.json` if needed (`behalf hook pre-tool-use`).

Confirm:

```bash
behalf doctor
```

Doctor should report the Claude PreToolUse hook as installed.

---

## How approval requests appear

1. You ask Claude to run a mapped action that needs approval (for example a shell command or a write under `pilot-sandbox/`).
2. The hook blocks the tool (Claude sees a denial / approval-required message). CLI stderr may say to visit the Action Inbox.
3. Your **approver** (separate user, separate browser profile) opens **Action Inbox** (`/dashboard/inbox`) or **Approvals** (`/dashboard/approvals`) in the correct workspace.
4. They review the preview and approve or deny.

You cannot approve your own requests.

---

## How to retry after approval

After the approver approves, ask Claude to **retry the same action** (same command text or same file path). A different command or file path requires a new approval.

Each successful use of an approval grant is **single-use** and **time-limited** (default 30 minutes). A second retry of the same action needs a new approval.

---

## What appears in the approval preview

Approvers see:

- Action and resource (for example `execute_command` / `shell`)
- A **bounded** preview of the command or file path
- Best-effort redaction of known secret patterns (BehalfID keys, Bearer tokens, etc.)

They should **not** see raw API keys from your config, full file contents from Write/Edit, or a raw `policyContext` dump.

---

## How to report a blocked action

Send the operator:

1. Approximate time (with timezone)
2. What you asked Claude to do (no real secrets)
3. Whether Claude/hook said blocked vs approval required
4. `requestId` if shown
5. Screenshot of the error or Inbox row (redact keys)
6. OS + `behalf --version` + Claude Code version

---

## Support contact

- Pilot operator: (name/channel provided in the invite)
- Product support: [support@behalfid.com](mailto:support@behalfid.com)

---

## Uninstall or disable the pilot integration

To stop local enforcement:

1. Remove or disable the BehalfID PreToolUse hook entry in `~/.claude/settings.json` (or ask the operator for a verified snippet).
2. Clear agent credentials if you will not continue testing:

   ```bash
   behalf logout
   ```

   Also remove `api-key` / `agent-id` from `~/.behalf/config.json` if still present.

3. Optionally uninstall the CLI (`npm uninstall -g @behalfid/cli`, or remove the binary from your install method).

4. If you installed Managed Profile shims for other testing, `behalf profile uninstall` removes those shims — that is separate from the Claude PreToolUse hook.

Removing the hook disables BehalfID checks for Claude Code on that machine. Organizational policy may still require the hook to remain installed.
