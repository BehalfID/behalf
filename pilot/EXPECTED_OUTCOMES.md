# Expected outcomes (source-accurate)

This document states **what the code does today**. It is not a live evidence log. Live results belong in `EVIDENCE_TEMPLATE.md` and start as PENDING.

## Contract summary

| Surface | Deny / approval-required | Config missing | Network / API / verify timeout | Approval poll timeout |
|---|---|---|---|---|
| Claude Code `PreToolUse` (`packages/cli/src/commands/hook.ts`) | **Fail-closed** (exit `2`) | **Fail-open** (exit `0`, stderr warning) | **Fail-open** (exit `0`, stderr warning) | N/A (no approval waiter in hook) |
| Cursor `beforeShellExecution` (same hook module) | Deny / approval → permission deny JSON | **Fail-open** | **Fail-open** | N/A |
| `@behalfid/mcp-runtime` (`packages/mcp-runtime/docs/FAIL_CLOSED.md`) | **Fail-closed** (no downstream execute) | Missing key/agent → process exit(1); no implicit allow | **Fail-closed** (`verify-unavailable` / `verify-timeout`) | **Fail-closed** (`approval-denied`) |
| Advisory CLI MCP (`verify_action`) | N/A — advisory only | Tool unavailable | Tool unavailable | N/A |

**Do not** describe the Claude hook as universally fail-closed.  
**Do not** describe `@behalfid/mcp-runtime` as fail-open on verify outage.  
**Do not** treat advisory MCP tools as an enforcement boundary.

---

## Claude `PreToolUse` detail

Source: `packages/cli/src/commands/hook.ts` (`PRE_TOOL_USE_VERIFY_TIMEOUT_MS = 5000`).

| Condition | Exit / behavior | Posture |
|---|---|---|
| Policy deny | Exit `2`, block message | Fail-closed |
| Approval required | Exit `2`, approval message | Fail-closed |
| Malformed hook JSON / missing mapped command or path / oversized policy context | Exit `2` (mapped PreToolUse path) | Fail-closed |
| Missing agent ID or API key | Exit `0`, stderr: not configured — allowing (fail open) | Fail-open |
| Network error, API throw, verify timeout | Exit `0`, stderr: verification unavailable — allowing (fail open) | Fail-open |

Managed Profiles launch shim is a **separate** launch-time layer: cached `required` + outage may refuse launch; missing usable cache may fall back to unmanaged. It is not the action-time gate and is not a universal outage fail-closed guarantee. See `docs/PILOT_REHEARSAL.md` § Enforcement architecture and `docs/CAPABILITY_MATRIX.md`.

---

## `@behalfid/mcp-runtime` detail

Source: `packages/mcp-runtime/docs/FAIL_CLOSED.md`.

| Condition | Downstream executed? | Outcome |
|---|---|---|
| verify allows | Yes (if transport ok) | `allowed` |
| verify denies | **No** | `denied` |
| approval required (no grant yet) | **No** | denied / approval-required messaging |
| approval denied | **No** | `approval-denied` |
| approval poll timeout | **No** | `approval-denied` |
| malformed verify payload | **No** | `verify-malformed` |
| HTTP/network error | **No** | `verify-unavailable` |
| verify timeout | **No** | `verify-timeout` |
| missing `BEHALFID_API_KEY` / `BEHALFID_AGENT_ID` | N/A | process exit(1) |

There is **no** fail-open path that turns an unavailable verify into an implicit allow inside this interceptor.

**Publish note:** package is preview / source-only until published to npm. Keep README preview banners and this fail-closed contract both accurate.

---

## Approval identity rules (product)

- Requester must not successfully approve their own request (`You cannot approve your own request.` or UI disabled).
- Approver must be a different authorized user.
- Grant is intent-bound: changed command must not consume the prior grant.
- Grant is single-use for the successful retry path under test (at most one winner under concurrent retry).

---

## What “PASS” means for outage canaries

| Canary | PASS means |
|---|---|
| Claude hook network/timeout | Tool **did** run after fail-open warning; typically **no** verification row |
| mcp-runtime network/timeout | Tool **did not** run; client sees deny / verify-unavailable or verify-timeout |
| Confusing the two | Automatic **FAIL** of evidence quality — do not merge contracts |

If observed behavior disagrees with this document, treat it as a product bug or outdated doc and **do not** rewrite marketing claims until source and this file are reconciled.
