# Pilot rollback instructions

Use after a canary session, after a FAIL, or when aborting mid-flight. Prefer the least destructive step that restores the pre-pilot posture.

**Status of live rollback execution: PENDING** until an operator checks off items below with timestamps.

## Principles

- Roll back **pilot-only** artifacts (canary permissions, temporary env overrides, temporary MCP wrap entries).
- Do **not** rotate production keys, delete non-canary agents, or change billing unless separately authorized.
- Do not print secrets while verifying restoration.

---

## 1. Environment overrides (PENDING)

```powershell
# Confirm whether a process override is set (boolean only)
Test-Path Env:BEHALFID_BASE_URL
Test-Path Env:BEHALFID_VERIFY_URL
Test-Path Env:BEHALFID_VERIFY_TIMEOUT_MS
Test-Path Env:BEHALFID_APPROVAL_TIMEOUT_MS
Test-Path Env:BEHALFID_APPROVAL_POLL
```

- [ ] **PENDING** Remove temporary `BEHALFID_BASE_URL` / verify URL pointing at loopback refuse ports
- [ ] **PENDING** Restore timeout / poll env vars to pre-test values (or unset)
- [ ] **PENDING** Close Claude / MCP client sessions started under outage induction

---

## 2. Canary permissions (PENDING)

- [ ] **PENDING** List permissions for the canary agent (`behalf --json permissions list <agentId>`)
- [ ] **PENDING** Revoke or remove only the temporary canary permission IDs created for this pilot
- [ ] **PENDING** Confirm no leftover `requiresApproval` canary that could surprise later sessions
- [ ] **PENDING** Record permission IDs and revoke results in `EVIDENCE_TEMPLATE.md`

---

## 3. Hook / Managed Profiles (PENDING)

Only if the pilot changed local hook or shim state:

- [ ] **PENDING** Confirm `behalf hook pre-tool-use` entry is the intended long-lived config (not a temporary outage hack)
- [ ] **PENDING** If Managed Profiles was toggled for the pilot, restore prior mode (`behalf profile status --tool claude`)
- [ ] **PENDING** Re-check Claude `/hooks` effective load after restore

Do not paste full `~/.claude/settings.json` or `~/.behalf/config.json` into evidence.

---

## 4. MCP runtime wrap (PENDING)

Only if `@behalfid/install --wrap` or manual mcp-runtime registration was applied for the pilot:

- [ ] **PENDING** Restore prior MCP server command/args from backup taken before wrap
- [ ] **PENDING** Or re-run the installer’s documented restore/rollback path if one was used
- [ ] **PENDING** Confirm advisory `.mcp.json` / tracked repo MCP config unchanged unless authorized

Preview packages were never published — removing a local tarball install is sufficient; no npm unpublish.

---

## 5. Pending approvals (PENDING)

Action Inbox and permission replacement/review UI are the supported cleanup surfaces (approval product support is implemented; live Trajectus evidence may still be PENDING).

- [ ] **PENDING** Deny or leave-to-expire any leftover canary approval requests in Action Inbox
- [ ] **PENDING** Confirm no open grant that could allow a later identical retry unintentionally

---

## 6. Evidence hygiene (PENDING)

- [ ] **PENDING** Secret-scan captures before archiving
- [ ] **PENDING** Delete or redact any accidental key/cookie dumps
- [ ] **PENDING** Leave checklist statuses honest (`PENDING` / `FAIL` / `PASS`) — never invent PASS

---

## Abort mid-session

1. Execute `KILL_SWITCH.md` first if enforcement is misbehaving or a deny marker executed.
2. Then run sections 1–5 here.
3. File a blocker note in `EVIDENCE_TEMPLATE.md` rather than claiming partial success as a full pilot pass.
