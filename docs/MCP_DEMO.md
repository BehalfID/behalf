# BehalfID MCP Demo

This demo shows the **advisory** CLI/MCP path for local coding agents. Use it when you want Claude Code, Codex, or another MCP-compatible agent to inspect BehalfID permissions and call `verify_action` before risky actions.

**Important:** The MCP server is **not** an interception/enforcement boundary. It exposes tools and writes model instructions. Shell/file enforcement for Claude Code requires the installed `PreToolUse` hook (see `docs/CAPABILITY_MATRIX.md` and `docs/PILOT_TESTER_GUIDE.md`). Do not cite an MCP denial or unavailable MCP tool as proof that a command was blocked.

## What This Proves

- SDK path: use BehalfID inside your app and call `/api/verify` before execution.
- Action Gateway path: ask BehalfID to verify and execute a supported action in one call.
- CLI/MCP path: add BehalfID permission **context** and advisory tools to a local agentic coding tool.
- Action-time hooks (separate): Claude `PreToolUse` can block mapped tools — with documented fail-open outage behavior.

The MCP path does not add provider-native integrations. It gives local tools a permission context, a `get_permissions` tool, and a `verify_action` tool.

## Setup

1. Start the BehalfID app locally, or use `https://behalfid.com`.
2. Create an agent in `/dashboard/agents`, `/dashboard/onboarding`, or `/console/agents`.
3. Add a coding-agent-style permission. Example:

```txt
action: browse_web
resource: web
allowedActions: read public documentation, inspect package metadata
blockedActions: submit forms, make purchases, change production settings
requiresApproval: false
```

Add a denied or approval-required case too:

```txt
action: deploy_production
resource: vercel
allowedActions: inspect deployment status
blockedActions: promote production, change environment variables
requiresApproval: true
```

4. Configure the CLI with the one-time agent API key:

```bash
behalf config set base-url http://localhost:3000
behalf config set agent-id agent_xxx
behalf config set api-key bhf_sk_xxx
```

## Initialize MCP In A Project

Run this from the repository where the coding agent will work:

```bash
behalf mcp init
```

The command writes or updates:

```txt
.behalf/context.md
.mcp.json
```

Existing `.mcp.json` entries are preserved and BehalfID is merged under `mcpServers.behalfid`. To preview without writing:

```bash
behalf mcp init --dry-run
```

Inspect the context file:

```bash
sed -n '1,160p' .behalf/context.md
```

The context tells the agent (advisory instructions — not a host interceptor):

- call `verify_action` before risky, external, state-changing, permissioned, or sensitive actions
- denied means do not execute
- unavailable verification should be treated as “do not execute” **by the model instructions**
- approval-required means pause for human approval

These instructions are best-effort. For Claude Code, the structural gate is the `PreToolUse` hook, which fails **open** on missing config and network/timeout verify errors, and fails **closed** on deny, approval-required, malformed/missing-target, and oversized policy input.

## Diagnose Setup

```bash
behalf doctor
behalf mcp status
```

`doctor` checks local config, API key presence, agent ID presence, base URL health, `.mcp.json`, `.behalf/context.md`, and the BehalfID MCP server entry.

## Run A Coding Agent

Claude Code:

```bash
behalf claude
```

Codex:

```bash
behalf codex
```

The launcher refreshes local permission context, confirms the agent and base URL it will use, and then starts the underlying tool. It does not print API keys.

## Expected Agent Behavior

Allowed example:

```txt
User: Read the public docs page for the package.
Agent: calls verify_action({ action: "browse_web", vendor: "web" })
BehalfID: allowed: true
Agent: proceeds with the read.
```

Denied example:

```txt
User: Submit this production settings form.
Agent: calls verify_action({ action: "submit_form", vendor: "vercel" })
BehalfID: allowed: false
Agent: does not submit the form and reports the denial reason.
```

Approval-required example:

```txt
User: Promote this deployment to production.
Agent: calls verify_action({ action: "deploy_production", vendor: "vercel" })
BehalfID: allowed: false, reason includes approval required
Agent: pauses for human approval and does not execute automatically.
```

If the advisory MCP server cannot verify, model instructions say not to run the action. That is not the same as a host-level block. For Claude Code shell/file tools, rely on the PreToolUse hook and its documented outage semantics — do not treat MCP unavailability as enforcement proof.
