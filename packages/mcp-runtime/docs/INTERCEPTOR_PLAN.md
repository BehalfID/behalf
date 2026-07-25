# MCP Interceptor Plan

**Goal:** A complete Policy Enforcement Point that sits between AI agents and real MCP servers so every `tools/call` is authorized by BehalfID `verify()` before execution.

**Non-goals:** Second policy engine; static auditing (`@behalfid/mcp-audit` stays separate).

---

## Current state

| Piece | Status |
|-------|--------|
| `McpRuntime` PEP library | Done |
| Stdio interceptor (`bin`) | Done (Phases 1–3) |
| Host wrap via `@behalfid/install --wrap` | Done (Phase 4) |
| CLI `behalf mcp start` | Advisory `verify_action` only |

---

## Phases

### Phase 1 — Runnable stdio bootstrap ✅
- `bin` entry that speaks MCP JSON-RPC over stdio
- HTTP verify client from `BEHALFID_*` env
- Fail closed on missing credentials / verify errors

### Phase 2 — Downstream transport ✅
- Spawn a configured child MCP server
- Implement `McpTransport` via JSON-RPC `tools/call`
- `tools/list` from the child, exposed through the interceptor

### Phase 3 — Enforce every tool call ✅
- Route every `tools/call` through `McpRuntime.execute`
- Deny / approval-required → MCP error (or poll) before execution
- Execution receipts via EventBus

### Phase 4 — Host integration ✅
- `wrapServersInConfig` / `behalf-install install --wrap`
- Inject `BEHALFID_AGENT_ID` / `BEHALFID_API_KEY` (+ downstream env)
- Store original server snapshots; uninstall restores them
- Optional verify-polling approval waiter (`BEHALFID_APPROVAL_POLL`, default on)

---

## Env contract

| Variable | Required | Purpose |
|----------|----------|---------|
| `BEHALFID_API_KEY` | yes | Agent API key for verify |
| `BEHALFID_AGENT_ID` | yes | Agent id |
| `BEHALFID_BASE_URL` | no | Default `https://behalfid.com` |
| `BEHALFID_VERIFY_URL` | no | Default `{BASE}/api/verify` |
| `BEHALFID_VERIFY_TIMEOUT_MS` | no | Default `5000` |
| `BEHALFID_DOWNSTREAM_COMMAND` | yes* | Child MCP command |
| `BEHALFID_DOWNSTREAM_ARGS` | no | JSON array of args |
| `BEHALFID_DOWNSTREAM_ENV` | no | JSON object forwarded to child |
| `BEHALFID_DOWNSTREAM_SERVER` | no | Logical server name (default `downstream`) |
| `BEHALFID_PROVIDER` | no | Provider label (default `mcp-interceptor`) |
| `BEHALFID_APPROVAL_POLL` | no | Set `0` to disable polling waiter |
| `BEHALFID_APPROVAL_POLL_MS` | no | Default `2000` |
| `BEHALFID_APPROVAL_TIMEOUT_MS` | no | Default `300000` |

\*Required for proxying real tools. Without it, the process still starts but exposes no tools (fail-safe).

---

## Install wrap usage

```bash
npx @behalfid/install install \
  --wrap \
  --agent-id agent_xxx \
  --api-key bhf_sk_xxx \
  --clients cursor
```

Rewrites each wrappable stdio MCP server **in place** to:

```json
{
  "command": "npx",
  "args": ["-y", "@behalfid/mcp-runtime@<version>"],
  "env": {
    "BEHALFID_AGENT_ID": "...",
    "BEHALFID_API_KEY": "...",
    "BEHALFID_DOWNSTREAM_COMMAND": "<original>",
    "BEHALFID_DOWNSTREAM_ARGS": "[...]",
    "BEHALFID_DOWNSTREAM_SERVER": "<name>"
  }
}
```

---

## Threat note

Agents can still bypass by editing MCP config (Tier 3 limitation in `docs/ENFORCEMENT_ARCHITECTURE.md`). Hard enforcement requires the host to only load wrapped servers.
