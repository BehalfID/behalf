# Pilot evidence template

**Live pilot status: PENDING — no pass claim.**
Approval UI (permission replacement/review + Action Inbox) is available; live two-person Trajectus approval evidence remains PENDING.
Fill only sanitized fields. Leave unused rows blank. Do not paste secrets.

Branch / commit under test:  
Operator:  
Date (ISO) + timezone:  

---

## Identities

| Role | User / email (non-secret) | Role in workspace | Browser profile / device | Status |
|---|---|---|---|---|
| Requester | | | | PENDING |
| Approver | | | | PENDING |

Confirm requester ≠ approver: PENDING

---

## Environment

| Field | Value | Status |
|---|---|---|
| Git SHA | | PENDING |
| Working tree note (do not claim clean if dirty) | | PENDING |
| `behalf --version` | | PENDING |
| Resolved `behalf` path | | PENDING |
| Claude version (if tested) | | PENDING |
| Real Claude path (non-shim) | | PENDING |
| mcp-runtime artifact (path / packed tarball version) | | PENDING |
| Host OS | | PENDING |

---

## Permission setup

| Phase | Permission ID | Action / resource | requiresApproval | Constraints | Status |
|---|---|---|---|---|---|
| Allow + deny | | | false | | PENDING |
| Approval-required | | | true | | PENDING |

API key recorded? **No** (must remain No)

---

## Canary results

| Canary | Expected | Observed | Status | Request / approval IDs | Evidence ref |
|---|---|---|---|---|---|
| Allow | Real execution + allowed log | | PENDING | | |
| Deny | No execution + denied log | | PENDING | | |
| Approval first attempt | No execution + pending approval | | PENDING | | |
| Requester self-approval | Rejected / disabled | | PENDING | | |
| Approver grant | Approved; grant expiry recorded | | PENDING | | |
| Identical retry | Exactly one execution; grant consumed | | PENDING | | |
| Repeat without new approval | Blocked | | PENDING | | |
| Changed command | New pending; no grant reuse | | PENDING | | |
| Approver denial | Blocked after deny | | PENDING | | |
| Claude hook timeout / network | Fail-open per EXPECTED_OUTCOMES | | PENDING | | |
| mcp-runtime timeout / network | Fail-closed per EXPECTED_OUTCOMES | | PENDING | | |
| Config missing (hook) | Fail-open | | PENDING | | |
| Config missing (mcp-runtime) | No start / no allow | | PENDING | | |

---

## Outage detail log

### Claude hook (PENDING)

- Induction method:  
- Stderr warning text (sanitized):  
- Did real tool output appear?  
- Verification row created?  
- Status: PENDING  

### mcp-runtime (PENDING)

- Induction method:  
- Client-visible error / outcome:  
- Downstream executed? (must be no for PASS on outage)  
- Status: PENDING  

---

## Cleanup / rollback

| Action | Done? | Notes | Status |
|---|---|---|---|
| Canary permissions revoked/removed | | | PENDING |
| Outage env overrides restored | | | PENDING |
| Hook / MCP config restored if changed | | | PENDING |
| Evidence secret-scanned | | | PENDING |

---

## Sign-off

| Statement | Answer |
|---|---|
| All in-scope canaries PASS with evidence? | PENDING |
| Any FAIL / BLOCKED remaining? | PENDING |
| Authorized to update capability matrix live-validated cells? | No (default) |

Human operator signature / date: ______________________
