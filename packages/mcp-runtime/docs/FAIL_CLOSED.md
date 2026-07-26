# Fail-closed behavior — `@behalfid/mcp-runtime`

**Status:** Implemented behavior of the stdio MCP interceptor and `McpRuntime` PEP.
**Not advisory.** This document describes the true enforcement boundary.

> If verification cannot positively allow a tool call, the tool is **not** executed.

---

## Enforcement boundary

```
AI client ──stdio JSON-RPC──▶ @behalfid/mcp-runtime ──verify()──▶ BehalfID platform
                                      │
                                      ├── ALLOW  → proxy tools/call to downstream MCP
                                      └── anything else → return MCP error; never proxy
```

| Layer | Package | Role |
|-------|---------|------|
| Read-only audit | `@behalfid/mcp-audit` | Analyzes MCP config; never executes tools |
| Advisory MCP tools | `@behalfid/cli` `verify_action` | Agent *should* call before acting; can be skipped |
| **Fail-closed interceptor** | **`@behalfid/mcp-runtime`** | **Tool dispatch cannot reach the downstream server without an allow** |

Installing the advisory CLI MCP server does **not** make enforcement unavoidable.
Only routing stdio MCP traffic through `@behalfid/mcp-runtime` (directly or via
`@behalfid/install install --wrap`) places tool calls behind this PEP.

---

## Outcome matrix

| Scenario | `RuntimeOutcome` | Downstream executed? | Client-visible result |
|----------|------------------|----------------------|------------------------|
| verify allows | `allowed` | Yes (if transport succeeds) | Tool result (or downstream error) |
| verify denies | `denied` | **No** | `DENIED — tool was not executed.` |
| approval required, no waiter / poll disabled | `denied` | **No** | `APPROVAL REQUIRED — …` + dashboard URL |
| approval granted (re-verify allows) | `allowed` | Yes | Tool result |
| approval denied (human or waiter) | `approval-denied` | **No** | `DENIED` with outcome `approval-denied` |
| approval poll timeout | `approval-denied` | **No** | Same as approval denied |
| malformed verify payload | `verify-malformed` | **No** | `DENIED` / `verify-malformed` |
| verify HTTP/network error | `verify-unavailable` | **No** | `DENIED` / `verify-unavailable` |
| verify exceeds `BEHALFID_VERIFY_TIMEOUT_MS` | `verify-timeout` | **No** | `DENIED` / `verify-timeout` |
| missing `BEHALFID_API_KEY` / `BEHALFID_AGENT_ID` | process exit(1) | N/A | Interceptor does not start |
| no downstream configured | n/a | **No** | `tools/list` → `[]`; `tools/call` → error |
| unknown / malformed tool name | n/a | **No** | MCP tool error; verify not called |
| duplicate / replayed request | re-verified every time | Only if newly allowed | No decision cache |
| downstream crash after allow | `allowed` + `execution.ok=false` | Attempted | Downstream error text (`isError: true`) |

There is **no** fail-open path: a missing, slow, malformed, or unreachable
BehalfID decision never becomes an implicit allow.

---

## Approval polling defaults

| Env | Default | Behavior |
|-----|---------|----------|
| `BEHALFID_APPROVAL_POLL` | on | Poll `verify()` until allowed, denied, or timeout |
| `BEHALFID_APPROVAL_POLL_MS` | `2000` | Poll interval |
| `BEHALFID_APPROVAL_TIMEOUT_MS` | `300000` | Timeout → treated as **denied** (fail-closed) |
| `BEHALFID_APPROVAL_POLL=0` | — | No waiter; returns approval-required denial immediately |
| `BEHALFID_VERIFY_TIMEOUT_MS` | `5000` | Per-verify deadline; timeout → **not** executed |

Transient verify failures *while polling for an existing approval* are retried
until the approval timeout; the tool still never executes until an explicit allow.

---

## What this does **not** cover

- Agents that bypass MCP and call tools / APIs directly
- MCP config rewrites that remove the interceptor (Tier 3 limitation)
- Claude Code PreToolUse / hook paths outside this package
- The advisory `@behalfid/cli` MCP tools (`verify_action`, `get_permissions`)

Those surfaces are intentionally out of scope for this PEP. Do not describe them
as unavoidable enforcement.

---

## Automated coverage

See `packages/mcp-runtime/test/`:

- `McpRuntime.test.ts` — allow / deny / approval / malformed / outage / timeout / replay
- `interceptor.protocol.test.ts` — JSON-RPC framing, unknown tools, malformed lines
- `downstream.crash.test.ts` — real child-process crash behaviour
- `approvalWaiter.test.ts` — poll grant / deny / timeout

Manual real-client canaries: [`MANUAL_CLIENT_CANARIES.md`](./MANUAL_CLIENT_CANARIES.md).
