# BehalfID Phase 3 pilot canary package

**Status of every live step in this package: PENDING.**  
This package is a rehearsal kit and evidence scaffold. It does **not** claim that a live pilot has passed. Do not mark any canary `PASS` until a human executes it with genuine, sanitized evidence recorded in `EVIDENCE_TEMPLATE.md`.

Historical Trajectus rehearsal notes live under `docs/PILOT_*.md`. Those documents describe a prior scoped Windows Claude Code validation and must not be copied forward as proof for this Phase 3 package.

## Contents

| Path | Purpose |
|---|---|
| [CHECKLIST.md](./CHECKLIST.md) | Ordered live canaries (allow, deny, approval, identities, grant/deny, timeout, outage) |
| [EXPECTED_OUTCOMES.md](./EXPECTED_OUTCOMES.md) | Source-accurate fail-open / fail-closed contracts |
| [EVIDENCE_TEMPLATE.md](./EVIDENCE_TEMPLATE.md) | Evidence capture form (all fields start empty / PENDING) |
| [ROLLBACK.md](./ROLLBACK.md) | How to undo pilot config and permissions |
| [KILL_SWITCH.md](./KILL_SWITCH.md) | Immediate stop / disable procedures |
| [scripts/print-status.ps1](./scripts/print-status.ps1) | Prints PENDING status matrix for operator briefings |

## Surfaces covered

1. **Claude Code `PreToolUse` hook** (`behalf hook pre-tool-use`) — action-time gate for mapped shell tools. Documented outage posture: **fail-open** on missing config and network/API/timeout verify errors; **fail-closed** on deny, approval-required, malformed mapped input, missing mapped target, oversized policy context. Source: `packages/cli/src/commands/hook.ts`, `docs/CAPABILITY_MATRIX.md`.
2. **`@behalfid/mcp-runtime`** — stdio MCP interceptor PEP. Documented posture: **fail-closed** for deny, approval-required, verify network/timeout/malformed, and approval poll timeout. Source: `packages/mcp-runtime/docs/FAIL_CLOSED.md`. **Preview / not published to npm** — use workspace build or packed tarball only.
3. **Advisory CLI MCP tools** (`verify_action`, `get_permissions`) — **not** enforcement. Do not cite MCP tool availability as proof of blocking.

## Safety rules

- Harmless `echo` markers only (`behalfid-allowed`, `behalfid-canary`, `behalfid-approval-canary`, `behalfid-hook-outage`, `behalfid-mcp-outage`).
- Separate requester and approver identities (separate browser profiles or devices).
- Never print or archive API keys, developer tokens, cookies, or full config dumps.
- Record IDs (agent, permission, request, approval) and timestamps only.
- Stop immediately on: denied marker appearing as real shell/MCP tool output, grant reuse across changed commands, successful self-approval, or more than one concurrent retry consuming one grant.

## How to use

1. Read `EXPECTED_OUTCOMES.md` so expected fail-open vs fail-closed is clear before any live change.
2. Walk `CHECKLIST.md` in order. Leave each item `PENDING` until evidence exists.
3. Fill `EVIDENCE_TEMPLATE.md` as you go. Empty cells mean the step is still PENDING.
4. Keep `ROLLBACK.md` and `KILL_SWITCH.md` open during the session.
5. Do **not** update marketing pages, capability matrix “Live-validated” cells, or production claims from this package alone.

## Explicit non-claims

- No live pilot pass is asserted by this package.
- No deploy, publish, release, or production change is authorized by this package.
- Postgres parity is **out of scope** for Phase 3 (recommended next: Phase 4).
- Unpublished packages (`@behalfid/mcp-runtime`, `@behalfid/install`, `@behalfid/mcp-audit`) remain preview/source-only until published.
