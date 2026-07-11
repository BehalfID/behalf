# Trajectus Pilot — Results Template

Copy this file (or duplicate the sections) for each rehearsal run. Sanitize before sharing outside the operator channel.

Related: [PILOT_REHEARSAL.md](PILOT_REHEARSAL.md) · [PILOT_TESTER_GUIDE.md](PILOT_TESTER_GUIDE.md)

---

## Metadata

| Field | Value |
|---|---|
| Rehearsal date | |
| Deployed commit | |
| CLI version / source | (e.g. `@behalfid/cli@x.y.z` from npm / local pack path) |
| Operating system | |
| Claude Code version | |
| Requester | |
| Approver | |
| Workspace | `acct_test` (replace with real id in private notes only) |
| Disposable repository | |
| Start time | |
| End time | |

---

## Summary

| Field | Value |
|---|---|
| Overall pass/fail | |
| P0 findings | (count + short titles) |
| P1 findings | |
| Recommendation | proceed / proceed with conditions / stop |

Narrative (2–4 sentences):

```txt

```

---

## Scenario table

| ID | Scenario | Expected | Observed | Pass/Fail | Request ID | Approval ID | Latency | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Clean CLI installation | | | | | | | | |
| 2 | Hook installation and doctor verification | | | | | | | | |
| 3 | Exact command approval | | | | | | | | |
| 4 | Command substitution rejection | | | | | | | | |
| 5 | Single-use grant rejection on second retry | | | | | | | | |
| 6 | Concurrent retry behavior | At most one allow | | | | | | | |
| 7 | Exact file-path approval | | | | | | | | |
| 8 | File-path substitution rejection | | | | | | | | |
| 9 | Canonically equivalent path retry | | | | | | | | |
| 10 | Denied-command precedence | | | | | | | | |
| 11 | Denied-path precedence | | | | | | | | |
| 12 | Self-approval rejection | | | | | | | | |
| 13 | Insufficient-authority rejection | | | | | | | | |
| 14 | Approval expiry | | | | | | | | |
| 15 | Secret-redacted command preview | | | | | | | | |
| 16 | Truncated command preview | | | | | | | | |
| 17 | Verification-log inspection | | | | | | | | |
| 18 | Workspace tenant-isolation check | | | | | | | | |
| 19 | Missing local configuration behavior | Fail open understood | | | | | | | |
| 20 | API/service-unavailability behavior | Fail open understood | | | | | | | |
| 21 | Unmapped-tool observation | | | | | | | | |
| 22 | Actual Monitor usage observation | | | | | | | | |

---

## Timing metrics

| Metric | Value |
|---|---|
| Setup duration | |
| Median Action Inbox visibility latency | (request blocked → visible to approver) |
| Median approval-to-retry latency | (approve → successful retry) |
| Total retries | |
| Failed retries | |
| Unexpected bypasses | (mapped tool executed without expected deny/approval) |

---

## Tool observations

List every Claude tool observed during the rehearsal.

| Tool name | Mapped action | Verified | Expected behavior | Actual behavior | Pilot relevance |
|---|---|---|---|---|---|
| | | yes/no | | | |
| Monitor | execute_command if `command` set; else unmapped | | | | Dedicated row — fill even if not seen |

Add rows as needed (Bash, PowerShell, Write, Edit, Read, Agent, Task, WebFetch, WebSearch, mcp__*, Glob, Grep, …).

---

## Security review

Explicit yes/no (use “n/a” only if scenario not run; explain in notes):

| Question | Yes/No |
|---|---|
| Requester self-approval blocked | |
| Command substitution blocked | |
| File substitution blocked | |
| Grants single-use | |
| Grants time-limited | |
| Hard constraints precede approvals | |
| Tenant isolation maintained | |
| Secrets absent from stored evidence | |
| Raw policyContext absent from logs | |
| Local fail-open boundaries understood | |

---

## Follow-up decision

One block per finding:

### Finding: _(title)_

| Field | Value |
|---|---|
| Severity | P0 / P1 / P2 / P3 |
| Owner | |
| Required before pilot? | yes / no |
| Workaround | |
| Target date | |

### Finding: _(title)_

| Field | Value |
|---|---|
| Severity | |
| Owner | |
| Required before pilot? | |
| Workaround | |
| Target date | |

---

## Sign-off

| Role | Name | Date | Signature / ack |
|---|---|---|---|
| Operator | | | |
| Requester | | | |
| Approver | | | |
