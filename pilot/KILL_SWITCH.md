# Pilot kill-switch instructions

Immediate stop procedures when a canary is unsafe, a deny marker executes, self-approval succeeds, or grant reuse is observed.

**Live kill-switch drills: PENDING** until explicitly rehearsed. Reading this file is not a completed drill.

## Severity guide

| Signal | Action |
|---|---|
| Denied marker appears as real shell / MCP downstream output | **Stop all canaries** → disable hook / unwrap runtime → revoke canary permissions |
| Self-approval succeeds | **Stop approval tests** → preserve evidence → escalate as security defect |
| One grant allows multiple concurrent executions | **Stop approval tests** → preserve evidence → escalate |
| Unexpected fail-open on mcp-runtime path | **Stop MCP canaries** → kill interceptor processes → unwrap |
| Unexpected fail-closed blocking all developer work outside canary scope | Disable local hook / shim for non-canary work; do not “fix” by weakening production policy |

---

## Fast actions (order matters)

### 1. Stop generating new tool calls (PENDING)

- [ ] **PENDING** Stop Claude / agent sessions under test
- [ ] **PENDING** Do not retry the failing command “to see if it works now”

### 2. Disable action-time Claude hook (PENDING)

Temporary local disable only on the pilot machine (operator choice; pick one authorized method):

- Remove or comment the pilot `PreToolUse` command entry that runs `behalf hook pre-tool-use`, **or**
- Move `behalf` out of PATH for that shell and relaunch Claude without the hook, **or**
- Use an authorized enterprise managed-hooks control if that is the pilot’s admin path

Re-enable only after root cause is understood. Confirm via Claude `/hooks`.

### 3. Stop mcp-runtime enforcement path (PENDING)

- [ ] **PENDING** Terminate the `@behalfid/mcp-runtime` stdio interceptor process(es) for the canary client
- [ ] **PENDING** Restore MCP config to launch the downstream server **without** the interceptor (from pre-wrap backup)
- [ ] **PENDING** Restart the MCP client so it picks up restored config

### 4. Revoke canary authorization (PENDING)

Use Action Inbox / permission replacement UI where available (approval support is implemented; live Trajectus evidence may still be PENDING).

- [ ] **PENDING** Revoke canary agent API key **only if** authorized and the key may have leaked into evidence
- [ ] **PENDING** Otherwise disable or remove canary permissions so further verifies deny
- [ ] **PENDING** Deny outstanding canary approval requests in Action Inbox

### 5. Preserve evidence, then clean secrets (PENDING)

- [ ] **PENDING** Save sanitized screenshots / request IDs / timestamps
- [ ] **PENDING** Redact secrets before sharing
- [ ] **PENDING** Continue with `ROLLBACK.md` for full restoration

---

## What is not a kill-switch

- Deleting the production workspace
- Force-pushing git
- Publishing or unpublishing npm packages
- Claiming the pilot passed after an emergency stop

## After kill-switch

Record in `EVIDENCE_TEMPLATE.md`:

- Trigger signal
- Actions taken (with times)
- Whether deny-marker non-execution was restored
- Remaining PENDING / FAIL items

Do not clear FAIL markers to hide an incident.
