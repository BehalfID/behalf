# Pilot canary checklist

Every live step starts as **PENDING**. Change status only when a human records evidence in `EVIDENCE_TEMPLATE.md`. Automated unit/integration tests are **not** substitutes for these live steps.

Legend: `PENDING` | `PASS` | `FAIL` | `BLOCKED` | `SKIPPED` (with reason).

---

## 0. Preparation (PENDING)

- [ ] **PENDING** Disposable canary workspace / agent authorized for pilot use only
- [ ] **PENDING** Requester identity recorded (user/role) — must not be the same as approver
- [ ] **PENDING** Approver identity recorded (user/role) — separate browser profile or device
- [ ] **PENDING** Git commit SHA of the build under test recorded
- [ ] **PENDING** CLI version / path recorded (`behalf --version`)
- [ ] **PENDING** For Claude path: effective `PreToolUse` hook confirmed in Claude `/hooks` (settings file alone is insufficient)
- [ ] **PENDING** For MCP path: local `@behalfid/mcp-runtime` build or packed tarball (not public npm) recorded
- [ ] **PENDING** Kill-switch and rollback docs reviewed

---

## 1. Allow test (PENDING)

**Marker:** `echo behalfid-allowed` (Claude shell) **or** allowed MCP tool call through `@behalfid/mcp-runtime`.

| ID | Step | Status |
|---|---|---|
| A1 | Configure one intended allow permission for the canary agent | PENDING |
| A2 | Invoke real tool (not simulated) | PENDING |
| A3 | Observe real tool output / downstream result | PENDING |
| A4 | Correlate Activity/Logs allowed verification (request ID, permission ID, timestamp) | PENDING |

**Pass criteria:** Real invocation + matching allowed log row. Server-side `allowed` without real execution is **FAIL**.

---

## 2. Deny test (PENDING)

**Marker:** `echo behalfid-canary` (or MCP tool mapped to a denied permission).

| ID | Step | Status |
|---|---|---|
| D1 | Configure deny (e.g. `deniedCommands: [behalfid-canary]` or equivalent MCP deny) | PENDING |
| D2 | Invoke real tool attempt | PENDING |
| D3 | Prove non-execution (marker absent from shell-result / downstream never called) | PENDING |
| D4 | Correlate denied verification row | PENDING |

**Pass criteria:** Block before execution + denied log. Prose mentioning the marker is not execution proof.

---

## 3. Approval-required test (PENDING)

Approval support is implemented (permission replacement/review + Action Inbox). Live two-person Trajectus evidence remains PENDING — do not mark PASS without sanitized requester/approver captures in `EVIDENCE_TEMPLATE.md`.

Requires exactly one matching permission with `requiresApproval: true`. Do not leave a broader non-approval permission that could satisfy first.

**Marker:** `echo behalfid-approval-canary`

| ID | Step | Status |
|---|---|---|
| P1 | Replace/update permission to approval-required; record permission ID | PENDING |
| P2 | First attempt → no execution; approval-required / denied pending row; exact preview | PENDING |
| P3 | Record approval request ID + preview text | PENDING |

**Pass criteria:** No tool execution until an authorized grant exists for the exact intent.

---

## 4. Separate requester and approver identities (PENDING)

| ID | Step | Status |
|---|---|---|
| I1 | Requester session initiates the approval-required action | PENDING |
| I2 | Approver session is a different user/role in a separate profile/device | PENDING |
| I3 | Identities recorded in evidence (no cookies / tokens) | PENDING |

---

## 5. Approval grant test (PENDING)

| ID | Step | Status |
|---|---|---|
| G1 | As requester, attempt self-approval → must be disabled or API-rejected | PENDING |
| G2 | As approver, approve exact preview; record approval ID + grant expiry | PENDING |
| G3 | Retry identical command once → exactly one real execution; grant consumed | PENDING |
| G4 | Optional concurrency: two near-simultaneous identical retries → at most one winner | PENDING |
| G5 | Repeat identical command without new approval → blocked, no execution | PENDING |
| G6 | Changed command (`…-changed`) must not reuse original grant | PENDING |

---

## 6. Approval denial test (PENDING)

| ID | Step | Status |
|---|---|---|
| N1 | Trigger a fresh approval-required attempt | PENDING |
| N2 | Approver **denies** the request | PENDING |
| N3 | Retry → remains blocked; no execution | PENDING |
| N4 | Denied / approval-denied evidence recorded | PENDING |

---

## 7. Timeout test (PENDING)

| ID | Surface | Expected (see EXPECTED_OUTCOMES.md) | Status |
|---|---|---|---|
| T1 | Claude `PreToolUse` verify timeout (~5s `PRE_TOOL_USE_VERIFY_TIMEOUT_MS`) | **Fail-open** — stderr warning; tool proceeds | PENDING |
| T2 | `@behalfid/mcp-runtime` verify timeout (`BEHALFID_VERIFY_TIMEOUT_MS`, default 5s) | **Fail-closed** — tool not executed | PENDING |
| T3 | `@behalfid/mcp-runtime` approval poll timeout (`BEHALFID_APPROVAL_TIMEOUT_MS`) | **Fail-closed** — treated as approval-denied | PENDING |

Induce timeout only with harmless markers and reversible config (loopback refuse, short timeout env). Restore afterward per `ROLLBACK.md`.

---

## 8. Network / configuration outage tests (PENDING)

| ID | Scenario | Claude hook expected | mcp-runtime expected | Status |
|---|---|---|---|---|
| O1 | Missing agent ID / API key (config outage) | **Fail-open** | Process refuses to start / no allow path | PENDING |
| O2 | Unreachable base URL / network error | **Fail-open** | **Fail-closed** (`verify-unavailable`) | PENDING |
| O3 | API error / non-success verify | **Fail-open** (unavailable path) | **Fail-closed** | PENDING |
| O4 | Managed Profiles shim outage (if in scope) | See EXPECTED_OUTCOMES — not universal fail-closed | N/A | PENDING |
| O5 | Advisory MCP `verify_action` unavailable | Advisory only — not enforcement proof | N/A | PENDING |

Recommended Claude hook outage induction (do not print secrets):

```powershell
$env:BEHALFID_BASE_URL = "http://127.0.0.1:1"
# launch real (non-shim) Claude; run: echo behalfid-hook-outage
```

Recommended mcp-runtime outage induction: point `BEHALFID_VERIFY_URL` / base URL at a refused port while wrapping a harmless local MCP server; attempt a tools/call; confirm downstream never runs.

---

## 9. Evidence, rollback, kill-switch (PENDING)

- [ ] **PENDING** `EVIDENCE_TEMPLATE.md` completed for every PASS claim
- [ ] **PENDING** Secret scan of captures (`bhf_sk_`, `bhf_dev_`, `Bearer `, cookies)
- [ ] **PENDING** Rollback executed or confirmed unnecessary (`ROLLBACK.md`)
- [ ] **PENDING** Kill-switch readiness confirmed (`KILL_SWITCH.md`)

---

## Exit rule

Do **not** claim “pilot passed” until sections 1–8 that are in-scope for the chosen surface are all `PASS` with evidence. Any `FAIL` or unresolved `BLOCKED` item blocks a pass claim. Partial surface coverage must be labeled (e.g. “Claude hook allow/deny only — approval PENDING”).
