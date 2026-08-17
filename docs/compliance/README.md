# BehalfID Compliance Evidence Pack

**Pack date:** 2026-07-24  
**Assessment:** Internal SOC 2 (Security, Processing Integrity, Availability) + ISO 27001:2022 readiness  
**Certification status:** **Not certified.** This pack does not constitute a SOC 2 Type I/II report or an ISO 27001 certificate.

Contacts published by the product: `legal@behalfid.com`, `security@behalfid.com`.

---

## 1. Purpose

Provide auditors, customers, and internal owners with:

1. A system description and SaaS feature inventory  
2. Control mapping with evidence paths  
3. Gap analysis  
4. Internal SOC 2 and ISO 27001 audit results  
5. A draft Statement of Applicability  
6. A prioritized remediation backlog  

Interactive summaries (Cursor canvases — open beside chat):

- `soc2-iso27001-gap-analysis.canvas.tsx` — gap analysis scorecard
- `soc2-internal-audit.canvas.tsx` — SOC 2 findings register
- `iso27001-internal-audit.canvas.tsx` — ISO 27001 clause + Annex findings

---

## 2. Document index

| Document | Description |
|----------|-------------|
| [CONTROL_MATRIX.md](./CONTROL_MATRIX.md) | Feature inventory + SOC 2 / ISO control → evidence map |
| [GAP_ANALYSIS.md](./GAP_ANALYSIS.md) | Implemented / Partial / Missing with severity |
| [SOC2_AUDIT.md](./SOC2_AUDIT.md) | Internal SOC 2 design-effectiveness audit (27 tests) |
| [ISO27001_AUDIT.md](./ISO27001_AUDIT.md) | Internal ISO 27001 clause + Annex A audit |
| [SOA_DRAFT.md](./SOA_DRAFT.md) | Draft Statement of Applicability (ISO 27001:2022 Annex A) |
| This README | Scope, subprocessors, remediation backlog |

Related engineering sources (not replaced by this pack):

- [`docs/SECURITY.md`](../SECURITY.md)
- [`docs/PRODUCTION.md`](../PRODUCTION.md)
- [`app/compliance/page.tsx`](../../app/compliance/page.tsx)
- [`SECURITY_AUDIT_TODO.txt`](../../SECURITY_AUDIT_TODO.txt)

---

## 3. System description (auditor kickoff)

**Service:** BehalfID verifies AI-agent actions against scoped permissions, writes an audit trail, and supports enforcement integrations (SDK, CLI/MCP, Site Guard, egress proxy, Action Gateway).

**In-scope components:**

- Developer portal (auth, workspaces, agents, permissions, logs, webhooks, billing UI)
- Public/API surfaces (`/api/verify`, Site Guard, health, auth, dashboard APIs)
- Admin console
- Supporting packages used at customer edge (SDK, CLI, MCP, egress-proxy)

**Hosting model:** Next.js application on **Vercel**; primary datastore **Supabase (Postgres)** (migrated from MongoDB Atlas on 2026-07-31); rate limiting **Upstash Redis**; billing **Stripe**; identity federation **Google OAuth** (optional workspace SSO).

**Trust services requested for future SOC 2:** Security, Availability, Processing Integrity (Confidentiality secondary).

**Important honesty statement:** Engineering documentation still describes the product as a **prototype** suitable for constrained deployments. Multi-tenant hard isolation, MFA, formal IR/BCP, and ISMS processes are incomplete. Do not represent this pack as completed certification.

---

## 4. Subprocessors / critical suppliers

Derived from privacy disclosures and production docs (validate contracts separately):

| Supplier | Role | Typical data |
|----------|------|----------------|
| Supabase (Postgres) | Primary database | Account, agent, permission, verification log, webhook outbox data |
| Vercel | Application hosting / edge | Request handling, logs/telemetry as configured |
| Stripe | Payments | Customer ID, subscription status; card data held by Stripe |
| Upstash | Redis rate limiting | IP / rate-limit keys (not intended as account PII store) |
| Google | OAuth / OIDC SSO | Email, `sub`, profile claims used for sign-in |
| Email provider (if configured) | Verify / reset mail | Email address + tokens (confirm exact vendor in prod env) |

**Gap:** Formal vendor risk assessments, DPA/BAA inventory, and annual review cadence are **not** evidenced (ISO A.5.19–22 / SOC CC9 supplier aspects).

---

## 5. Audit verdicts (summary)

| Framework | Verdict |
|-----------|---------|
| SOC 2 Type I readiness | **Near** — after fixing Critical claim drift (SOC-01/02) and documenting minimum policies |
| SOC 2 Type II readiness | **Not ready** — need operating-period evidence (access reviews, IR drills, backup restores, monitoring, change tickets) |
| ISO 27001 certification | **Not ready** — ISMS clauses 4–7 and 9–10 fail; Annex A org/people/continuity weak |

**SOC 2 internal test tally:** 11 Pass · 9 Pass with exception · 7 Fail  
**ISO Annex sample tally:** 4 Pass · 6 Pass with exception · 8 Fail  

---

## 6. Prioritized remediation backlog

### Closed in 2026-07-24 remediation pass

| ID | Status | Notes |
|----|--------|-------|
| R-P0-1 | Done | Compliance EN + locale copy aligned to SameSite=Lax / 1h / 14d |
| R-P0-2 | Done | Plan-based retention disclosed; `GET /api/cron/purge-logs` physical purge |
| R-P0-3 | Done | SOC badge/language softened vs prototype honesty |
| R-P1-1 | Done | Developer TOTP MFA enroll + login challenge |
| R-P1-2 | Done | ConsoleAdmin identities + admin audit log; shared password bootstrap/legacy |
| R-P1-3 | Done | AuthEvent failed-auth logging |
| R-P1-4 | Done | `docs/compliance/ops/BACKUP_RESTORE.md` (restore drill still required) |
| R-P1-5 | Done | Sentry instrumentation + `MONITORING.md` |
| R-P1-6 | Done | `INCIDENT_RESPONSE.md` + `BCP_DR.md` |

### Closed in 2026-08-12 remediation pass

| ID | Status | Notes |
|----|--------|-------|
| R-P0-4 | Done | `app/privacy/page.tsx`, `app/compliance/page.tsx`, `app/security/page.tsx`, and the compliance evidence pack's live infra references corrected from MongoDB Atlas to Supabase (Postgres), matching the 2026-07-31 datastore cutover (see `docs/PRODUCTION.md`) |
| R-P0-5 | Done | `app/privacy/page.tsx` (English static route) analytics/cookie disclosure corrected — it previously stated "no third-party analytics" while HeyCatch (consent-gated) is live; the `/[locale]/privacy` route's `messages/*.json` copy was already accurate and unaffected |
| R-P1-9 | Done | Mongo-backend account deletion (`lib/repositories/mongo/accountDeletion.ts`) now also deletes `ExternalIdentity` and `PasskeyCredential` rows on request (GDPR Art. 17). The Postgres backend was already safe via `ON DELETE CASCADE` foreign keys on `developer_users` |
| R-P1-10 | Done | `developer_token` auth surface now records failed attempts via `recordAuthFailure` (`lib/developerToken.ts`), closing a gap where invalid `x-developer-token` attempts went unlogged while every other auth surface was covered |
| — | Done | Corrected stale code comments/docstrings claiming MFA columns and the Postgres runtime were not yet wired up (`app/api/auth/login/route.ts`, `app/api/auth/mfa/verify/route.ts`, `lib/db/postgres/index.ts`) — both have worked since the 2026-07-31 cutover |
| R-P1-13 | Done | Rewrote `docs/compliance/ops/BACKUP_RESTORE.md`, `BCP_DR.md`, and `INCIDENT_RESPONSE.md` for Supabase/Postgres — they previously described Atlas-specific restore steps that a real incident would have followed against the wrong datastore |
| R-P1-11 | Done | Added `GET /api/auth/account/export` + a dashboard "Export your data" section — access/portability are now genuinely self-service, matching the existing public claim |
| R-P1-12 | Done | `IdentityAuditLog` rows are now deleted on account deletion (both backends) |
| R-P2-2 | Done | Added `.github/dependabot.yml` for npm dependency update PRs across the workspace (closes part of G-11) |

### Still open

| ID | Action | Owner hint |
|----|--------|------------|
| R-P1-7 | Approve InfoSec policy, risk register, SoA; appoint ISMS owner | Leadership |
| R-P1-8 | Complete vendor risk assessments for subprocessors, **including HeyCatch and Supabase** (added/changed since the last assessment; DPA/SCC status not evidenced in-repo for either) | Security/Legal |
| R-P2-* | Pepper, deploy change control, webhook queue, training, CSRF | Eng / People |

Ops runbooks: [ops/BACKUP_RESTORE.md](./ops/BACKUP_RESTORE.md), [ops/BCP_DR.md](./ops/BCP_DR.md), [ops/INCIDENT_RESPONSE.md](./ops/INCIDENT_RESPONSE.md), [ops/MONITORING.md](./ops/MONITORING.md).

Engage a licensed CPA for SOC 2 and an accredited certification body for ISO 27001 when Stage 0 exits are met. This product is **not** certified solely by this pack.

---

## 7. Suggested next 30 / 60 / 90 days

| Window | Focus |
|--------|-------|
| 30 days | P0 claim fixes; appoint ISMS owner; draft IR + backup procedure; enable monitoring MVP |
| 60 days | MFA plan in production; admin identity model; vendor assessments; first management review |
| 90 days | Internal audit #2 against CAPA; begin Type II observation period / Stage 1 document freeze |

---

## 8. Revision history

| Date | Change |
|------|--------|
| 2026-07-24 | Initial evidence pack from internal readiness assessment |
| 2026-07-24 | Remediation pass: disclosures, purge cron, AuthEvents, MFA, ConsoleAdmin, Sentry, ops runbooks |
| 2026-08-12 | Scheduled ISO 27001/SOC 2/GDPR/CPRA scan: corrected stale MongoDB Atlas → Supabase (Postgres) references (public pages, pack, ops runbooks) left over from the 2026-07-31 datastore cutover; fixed a real privacy-policy/analytics disclosure mismatch on the static `/privacy` route; closed a GDPR Art. 17 gap where Mongo-backend account deletion didn't remove `ExternalIdentity`/`PasskeyCredential` rows; closed a failed-auth logging gap on the `developer_token` surface; corrected stale MFA/Postgres code comments. HIPAA reviewed — confirmed not applicable (no PHI processing). |
| 2026-08-12 | Follow-up implementation pass: built a self-service data export (`GET /api/auth/account/export` + dashboard "Export your data" section) closing G-25/R-P1-11 — access/portability are now genuinely self-service, matching the existing public claim; closed G-26/R-P1-12 by deleting `IdentityAuditLog` rows on account deletion; added `.github/dependabot.yml` for automated dependency PRs (G-11, partial). Still open: R-P1-8 (vendor risk assessment for HeyCatch/Supabase — requires legal/security contract review, not a code fix) and R-P2-* (API-key pepper, CSRF, webhook queue, deploy change control — each needs its own design review before implementation, not attempted here) |
| 2026-08-17 | Scheduled ISO 27001/SOC 2/HIPAA/GDPR/CPRA scan: reviewed all commits since the 2026-08-12 pass. Only in-scope change was the HeyCatch acquisition-funnel work (`c81e776`), which added `lib/analytics/funnel.ts` + `components/analytics/DashboardReachedBeacon.tsx` — verified the new events stay behind the existing consent gate (`lib/analytics/consent.ts`) and never carry typed input or credentials (the `field` param on `trackAuthFormStarted` is a fixed label like `"email"`/`"password"`/`"date_of_birth"`, not the value; `trackAuthFailed`'s `reason` is server-authored copy, capped at 200 chars). Re-verified `BEHALFID_ALLOW_SHARED_ADMIN` and `lib/logPurge.ts` still match their control-matrix descriptions. No new violations found; no code changes required. R-P1-7, R-P1-8, and R-P2-* remain open (non-code: leadership/legal sign-off and design review). |
