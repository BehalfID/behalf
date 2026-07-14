# Trajectus Claude Code live-validation results

Complete from [PILOT_REHEARSAL.md](PILOT_REHEARSAL.md). Store only sanitized evidence.

## Environment

| Field | Result |
|---|---|
| Date/time + timezone | |
| Operator | |
| Requester user/role | |
| Approver user/role | |
| Workspace/account ID | |
| Canary agent ID | |
| Git branch | |
| Git commit SHA | |
| Working tree clean | yes / no |
| Windows version | |
| PowerShell version | |
| BehalfID CLI version | |
| Resolved `behalf` path(s) | |
| Claude Code version | |
| Resolved real Claude path | |
| Managed Profiles shim present/first in PATH | |
| Claude `/hooks` shows BehalfID `PreToolUse` | yes / no |
| CLI install channel | npm / local pack / other |

## Permission states

| Phase | Permission ID | Action/resource | `requiresApproval` | `deniedCommands` | Other matching permission absent? |
|---|---|---|---|---|---|
| Allowed + denied | | `execute_command` / `shell` | false | `behalfid-denied-canary` | |
| Approval | | `execute_command` / `shell` | true | `behalfid-denied-canary` | |

Do not record an API key.

## Canary results

| Canary | Expected | Observed | Pass/Fail | Request ID(s) | Timestamp(s) | Evidence reference |
|---|---|---|---|---|---|---|
| Allowed `echo behalfid-allowed` | Real shell invocation, output appears, allowed `execute_command` / `shell` row | | | | | |
| Denied `echo behalfid-denied-canary` | Real shell attempted, hook blocks, no shell output, denied row | | | | | |
| Approval first attempt | No shell output, exact preview, approval required | | | | | |
| Requester self-approval | Disabled or rejected | | | | | |
| Second-user approval | Correct preview approved by authorized different user | | | | | |
| Identical retry | Exactly one shell execution; grant marked used/consumed | | | | | |
| Second identical retry | Blocked; new approval required; no shell output | | | | | |
| Changed command retry | Original grant not reused; separate pending request | | | | | |

## Approval evidence

| Field | Result |
|---|---|
| Approval ID | |
| Original request ID | |
| Exact preview | |
| Preview screenshot reference | |
| Requester rejection evidence | |
| Approver + role | |
| Approved at | |
| Grant expires at | |
| Used/consumed at | |
| Allowed retry request ID | |
| Blocked repeat request ID | |
| Changed-command request/approval ID | |
| Concurrent retry: number allowed | |

## Outage observations

| Layer | State tested | Expected contract | Observed | Pass/Fail | Evidence |
|---|---|---|---|---|---|
| Action-time `PreToolUse` hook | `/api/verify` refused/timed out | Generic warning, bounded fail-open, harmless command executes, no verification row | | | |
| Managed Profiles shim | Record live/cache state | Fresh cached `required` refuses; fresh non-required reuses; no usable cache falls back unmanaged | | | |
| Advisory MCP server | Availability only | MCP failure is advisory and is not shell non-execution proof | | | |

Do not fill a Managed Profiles result unless that exact state was tested. Do not infer one layer's result from another.

## Evidence checklist

- [ ] Versions and resolved binary paths
- [ ] ISO timestamps and timezone
- [ ] Agent and permission IDs; no API key
- [ ] Request IDs and allowed/denied/approval-required decisions
- [ ] Action `execute_command` and resource/vendor `shell`
- [ ] Claude tool-call and shell-result captures
- [ ] Proof the denied marker was not shell output
- [ ] Action Inbox exact preview
- [ ] Requester self-approval rejection
- [ ] Second-user approval and grant consumption
- [ ] Exactly one allowed retry plus blocked identical/changed retries
- [ ] Cleanup results
- [ ] Evidence scanned for keys, tokens, cookies, and complete config dumps

## Cleanup

| Item | Result |
|---|---|
| Canary permission IDs revoked/removed as authorized | |
| Temporary agent disposition (only if explicitly authorized) | |
| Base URL/process environment restored | |
| Hook configuration restored/retained | |
| Tracked `.mcp.json` unchanged | |
| Sanitized evidence preserved | |
| Secret-bearing output absent | |

## Friction and defects

### Finding: _title_

| Field | Detail |
|---|---|
| Severity | P0 / P1 / P2 / P3 |
| Step | |
| Expected | |
| Observed | |
| Request/approval IDs | |
| Evidence | |
| Workaround | |
| Owner / follow-up | |

Duplicate the finding block as needed.

## Decision

| Field | Result |
|---|---|
| Go / conditional go / stop | |
| Unverified claims | |
| Conditions and owners | |
| Operator sign-off | |
| Requester sign-off | |
| Approver sign-off | |
