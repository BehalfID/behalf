# Trajectus Claude Code live-validation results

Complete from [PILOT_REHEARSAL.md](PILOT_REHEARSAL.md). Store only sanitized evidence.

## Current checkpoint

- Allowed canary: **passed** on Windows Claude Code 2.1.209 after rebuild/relink. Claude invoked the real shell tool for `echo behalfid-allowed`, real shell output appeared, BehalfID recorded an allowed decision (`req_8MLJRFhKUgTVeYpj`), and there was no hook error or libuv assertion.
- Denied canary: **passed**. Claude attempted the real shell tool for `echo behalfid-canary`, the hook reported `BehalfID: blocked by policy.`, no shell-result output contained the marker, and BehalfID recorded a denied `command_blocked` decision (`req_qkBkxJ1tCPtkZ-WU`) with no hook crash.
- Approval-required canary: **paused / not run**. The current agent-detail dashboard does not provide a clear, safe permission replacement/editing workflow. Do not claim this canary passed. (Tracked in [#129](https://github.com/BehalfID/behalf/issues/129).)
- Follow-up scope: dashboard information architecture and permission-management UX will be handled in a separate PR.

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
| Allowed + denied | | `execute_command` / `shell` | false | `behalfid-canary` | |
| Approval | | `execute_command` / `shell` | true | `behalfid-canary` | |

Do not record an API key.

## Canary results

| Canary | Expected | Observed | Pass/Fail | Request ID(s) | Timestamp(s) | Evidence reference |
|---|---|---|---|---|---|---|
| Allowed `echo behalfid-allowed` | Real shell invocation, output appears, allowed `execute_command` / `shell` row | Real shell invoked and output appeared; allowed decision; no hook error/assertion | Pass | `req_8MLJRFhKUgTVeYpj` | | Live Claude and Activity evidence |
| Denied `echo behalfid-canary` | Real shell attempted, hook blocks, no shell output, denied row | Real shell attempted; generic policy block; no marker in shell-result output; `command_blocked`; no crash | Pass | `req_qkBkxJ1tCPtkZ-WU` | | Live Claude and Activity evidence |
| Approval first attempt | No shell output, exact preview, approval required | Not attempted; safe permission replacement/editing workflow unavailable | Paused | | | Dashboard UX blocker |
| Requester self-approval | Disabled or rejected | Not run | Paused | | | Separate-PR dependency |
| Second-user approval | Correct preview approved by authorized different user | Not run | Paused | | | Separate-PR dependency |
| Identical retry | Exactly one shell execution; grant marked used/consumed | Not run | Paused | | | Separate-PR dependency |
| Second identical retry | Blocked; new approval required; no shell output | Not run | Paused | | | Separate-PR dependency |
| Changed command retry | Original grant not reused; separate pending request | Not run | Paused | | | Separate-PR dependency |

## Approval evidence

Not collected. Approval-required validation is paused pending a separate dashboard information-architecture and permission-management UX PR.

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
