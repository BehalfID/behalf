# BehalfID MCP Demo

This demo shows the CLI/MCP path for local coding agents. Use it when you want Claude Code, Codex, or another MCP-compatible agent to inspect BehalfID permissions and call `verify_action` before risky actions.

## What This Proves

- SDK path: use BehalfID inside your app and call `/api/verify` before execution.
- Action Gateway path: ask BehalfID to verify and execute a supported action in one call.
- CLI/MCP path: add BehalfID permission context to a local agentic coding tool.

The MCP path does not add provider-native integrations. It gives local tools a permission context, a `get_permissions` tool, and a `verify_action` tool.

## Setup

1. Start the BehalfID app locally, or use `https://www.behalfid.com`.
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

The context tells the agent:

- call `verify_action` before risky, external, state-changing, permissioned, or sensitive actions
- denied means do not execute
- unavailable verification means fail closed
- approval-required means pause for human approval

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

If the MCP server cannot verify, the correct behavior is the same as denial for execution purposes: fail closed and do not run the action.
