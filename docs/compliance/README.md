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
| HeyCatch | Product analytics (consent-gated in the browser; server-side business events are not — see G-35) | Internal user id, email, name, plan, product-usage events |
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

### Closed in 2026-08-20 remediation pass

| ID | Status | Notes |
|----|--------|-------|
| R-P0-6 | Done | Console-session forgery (G-28): the `v2.` admin branch now refuses to validate when no signing secret is configured, instead of falling back to a constant published in this repo |
| R-P0-7 | Done | Rate-limit/IP disclosure drift (G-29): `/privacy` claimed IPs were memory-only while production sends them to Upstash; corrected on the static route and all four locales, and Upstash + Google added to the public processor table |
| R-P1-14 | Done | VIEWER could register account-scoped webhook endpoints (G-36) — `requireWorkspaceMutationActor` added to `POST /api/dashboard/webhooks` |
| R-P1-15 | Done | Unauthenticated, unthrottled public write on `POST /api/billing/enterprise-inquiry` (G-37) — `checkRateLimit` added, making the "rate limiting on all public endpoints" claim true |
| R-P2-3 | Done | Log/Sentry redaction (G-41): added the `bhf_site_` prefix and `?token=`/`code`/`state`/`secret` query-parameter redaction, so password-reset and email-verification tokens no longer reach the error tracker in request URLs |
| R-P2-4 | Done | Release-pipeline actions pinned to commit SHAs (G-42) |
| R-P2-5 | Done | Consent refusals are now recorded as `declined` rather than collapsing to `unknown` (G-43) |
| R-P2-6 | Partial | `BEHALFID_MFA_PEPPER` documented in `.env.example` (G-40); the fallback chain itself is unchanged |

### Still open

| ID | Action | Owner hint |
|----|--------|------------|
| R-P1-16 | **Webhook retention (G-30)** — public copy promises 30-day webhook delivery retention with no mechanism behind it. Extend the purge job or correct the claim | Eng |
| R-P1-17 | **Auth-event expiry on Postgres (G-31)** — `expiresAt` is written but never enforced on the production backend | Eng |
| R-P1-18 | **Console admin audit coverage (G-33)** — ~20 privileged mutating console routes write no audit row | Eng |
| R-P1-19 | **Server-side analytics vs consent copy (G-35)** — either gate server events on consent or correct the public claim; needs a legal/product decision | Legal / Product |
| R-P1-7 | Approve InfoSec policy, risk register, SoA; appoint ISMS owner | Leadership |
| R-P1-8 | Complete vendor risk assessments for subprocessors, **including HeyCatch and Supabase** (added/changed since the last assessment; DPA/SCC status not evidenced in-repo for either) | Security/Legal |
| R-P1-20 | **Slack tokens plaintext at rest (G-38)** and **webhook signing pepper unenforced (G-39)** — both need a migration/rotation plan | Eng |
| R-P2-* | Console session revocation, export audit record, API-key pepper, deploy change control, webhook queue, training, CSRF | Eng / People |

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
| 2026-08-20 | Scheduled ISO 27001/SOC 2/GDPR/CPRA/HIPAA scan across encryption, access control, audit logging, retention, PII handling and security configuration. 16 findings (G-28–G-43). Remediated in this pass: a High console-session forgery where the HMAC key fell back to a repo-published constant with no guard (G-28); a High public-disclosure drift claiming rate-limit IPs were memory-only while production sends them to Upstash, plus two undisclosed subprocessors (G-29); a VIEWER-mutation gap letting read-only members register account-scoped webhook endpoints (G-36); the one unauthenticated unthrottled public DB write (G-37); log/Sentry redaction gaps exposing reset and verification tokens in captured URLs (G-41); mutable action tags in the credential-bearing release pipeline (G-42); and consent refusals being recorded as "unknown" (G-43). Logged for follow-up: unenforced webhook and auth-event retention (G-30, G-31), console session revocation (G-32), console admin audit coverage (G-33), no audit record for data export (G-34), server-side analytics vs the consent copy (G-35 — legal decision, deliberately not silently reworded), Slack tokens plaintext at rest (G-38) and the unenforced webhook signing pepper (G-39). HIPAA re-reviewed — still not applicable (no PHI). |
| 2026-08-12 | Follow-up implementation pass: built a self-service data export (`GET /api/auth/account/export` + dashboard "Export your data" section) closing G-25/R-P1-11 — access/portability are now genuinely self-service, matching the existing public claim; closed G-26/R-P1-12 by deleting `IdentityAuditLog` rows on account deletion; added `.github/dependabot.yml` for automated dependency PRs (G-11, partial). Still open: R-P1-8 (vendor risk assessment for HeyCatch/Supabase — requires legal/security contract review, not a code fix) and R-P2-* (API-key pepper, CSRF, webhook queue, deploy change control — each needs its own design review before implementation, not attempted here) |
