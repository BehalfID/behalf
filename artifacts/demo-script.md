# BehalfID product demo — narration script

**Runtime target:** 2–4 minutes  
**Recording:** `artifacts/demo.mp4` (silent; use this script for voiceover)

---

## 0:00 — Homepage

BehalfID is agent permission infrastructure. Before an AI agent executes an action, we evaluate it against a scoped permission passport — allow, deny, or require approval — and every decision is audited.

## 0:15 — Create an account

A new operator signs up with email and password. In local demos without SMTP, the verification code is captured to `.behalf/dev-email.log` so activation still works.

## 0:35 — Verify email

Enter the verification code. Agent creation and developer credentials unlock only after the email is confirmed.

## 0:50 — Account setup

Choose a team workspace, name the operator, and select the agent surfaces and control areas that matter on day one — production deploys and secrets. Route the first destination to registering a coding agent.

## 1:10 — Create an agent

Pick the Cursor surface, name the agent **Release Copilot**, and apply a balanced control profile with a production-deploy approval gate. BehalfID issues a one-time API key and active permissions for staging deploys plus gated production.

## 1:30 — Agent detail & permissions

Open the agent identity, then review permissions: staging `deploy` is auto-allowed; `deploy_production` requires approval.

## 1:45 — Browser CLI

Open the in-dashboard terminal. This is not a system shell — OS binaries are rejected. It runs the real BehalfID CLI surface.

Run:

```text
behalf --help
behalf doctor
behalf agents list
behalf permissions list <agentId>
```

## 2:05 — Allowed action

```text
behalf verify <agentId> --action deploy --vendor staging
```

Decision: **ALLOWED** — active permission, low risk, request ID recorded.

## 2:20 — Denied action

```text
behalf verify <agentId> --action purchase --vendor evil.com --amount 9999
```

Decision: **DENIED** — no active permission. Fail closed.

## 2:35 — Approval-required action

```text
behalf verify <agentId> --action deploy_production --vendor production
```

Decision: **DENIED** with `approvalRequired` — a pending approval is created for an Engineering Lead.

## 2:50 — Approve the request

Owners cannot self-approve. An Engineering Lead reviews the Approvals queue and approves. The grant is bound to the original action tuple and can be consumed once.

## 3:05 — Retry after approval

```text
behalf verify <agentId> --action deploy_production --vendor production
```

Decision: **ALLOWED** by the approved grant.

## 3:20 — Audit trail & activity

Open **Audit logs** for workspace-wide verification decisions, then the agent **Activity** tab for the same trail scoped to Release Copilot. Every allow, deny, and approval leaves a stable request ID.

## 3:40 — Close

BehalfID keeps agents inside policy: allow what you scoped, deny the rest, and require a human when the stake is production.

---

## Notes for the editor

- Prefer dark theme; dismiss the cookie banner before the first title card.
- Hold 2–3 seconds on ALLOWED / DENIED / approval-required CLI outputs.
- If cutting to the lead persona, keep a short slate: “Engineering Lead approves.”
- Do not show API keys in full; the UI already redacts after first view.
