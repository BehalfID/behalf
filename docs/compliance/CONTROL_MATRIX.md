# BehalfID — SOC 2 / ISO 27001 Control Matrix

**Assessment type:** Internal readiness (not a CPA SOC 2 report or accredited ISO 27001 certificate)  
**Assessment date:** 2026-07-24 (infrastructure facts refreshed 2026-08-12 — see note below)  
**System:** BehalfID hosted SaaS (Next.js on Vercel + Supabase/Postgres)  
**Trust criteria in scope:** Security (CC), Processing Integrity (PI), Availability (A)  
**ISO scope:** ISO/IEC 27001:2022 Annex A controls relevant to SaaS + ISMS clause readiness (4–10)

> This matrix maps SaaS features to controls and evidence paths. Status values are refined in [GAP_ANALYSIS.md](./GAP_ANALYSIS.md) and tested in the internal audits.
>
> **2026-08-12 note:** the datastore migrated from MongoDB Atlas to Supabase/Postgres (Drizzle) after the 2026-07-24 assessment date; this page's infrastructure references have been updated in place to match current reality, and the migration also means the app now uses real multi-statement `db.transaction()` on the primary write paths (see PI1.3 below) rather than the Mongo-era "no multi-doc transactions" caveat. Control *findings* below otherwise reflect the 2026-07-24 review; see [GAP_ANALYSIS.md](./GAP_ANALYSIS.md) for newer dated findings.

## 1. System description

BehalfID is agent permission infrastructure: it verifies AI-agent actions against scoped permission “passports,” fail-closes on deny (when integrated), and writes an audit trail with stable `requestId` values. Customers are developers and security teams integrating via dashboard, API, SDK, CLI/MCP, Site Guard, and Action Gateway.

**Hosting assumptions (ops):** Vercel (app), Supabase/Postgres (primary datastore), Upstash Redis (rate limits), Stripe (billing), Google OAuth (identity), optional email for verify/reset.

**Product posture:** Engineering docs still describe the product as a prototype suitable for constrained deployments (`docs/SECURITY.md`, `/security`). Public `/compliance` states SOC 2 / ISO certification in progress — not completed.

---

## 2. SaaS feature inventory (customer data)

| ID | Feature | Customer data processed | Primary code / routes |
|----|---------|-------------------------|------------------------|
| F01 | Developer accounts & auth | Email, password hash / Google `sub`, sessions, DOB (COPPA), verify/reset tokens | `app/api/auth/*`, `lib/developerAuth.ts`, `models/DeveloperUser.ts` |
| F02 | Workspaces & memberships | Memberships, invites, roles, SSO domain config | `lib/membershipManagement.ts`, `lib/workspaceSso.ts`, `app/api/dashboard/members/*` |
| F03 | Agents & permissions | Agent metadata, scopes, API key hashes | `app/api/agents/*`, `app/api/permissions/*`, `lib/auth.ts` |
| F04 | Verification API | Action, vendor/resource, amount, optional metadata, decisions | `app/api/verify/route.ts`, `lib/verify.ts` |
| F05 | Audit / verification logs | Decision trail; CSV export (plan retention window) | `lib/verificationLogs.ts`, `app/api/dashboard/logs/route.ts` |
| F06 | Approvals inbox | Pending approval requests / decisions | `app/dashboard/approvals`, `app/dashboard/inbox` |
| F07 | Developer API tokens | Token hashes, last-used metadata | `lib/developerToken.ts`, `app/api/dashboard/tokens/*` |
| F08 | Webhooks | Endpoint URLs, signing secret hashes, payloads, delivery status | `lib/webhooks.ts`, `lib/ssrf.ts`, `app/dashboard/webhooks/*` |
| F09 | Site Guard | Sites, rules, site keys, access logs (path/UA) | `app/api/site-guard/check/route.ts`, `docs/SITE_GUARD.md` |
| F10 | Managed profiles / CLI | Repo policies, device auth, CLI activity | `lib/cliAuditActivity.ts`, `app/api/auth/device/*` |
| F11 | Billing | Stripe customer/subscription state, plan entitlements | `app/api/billing/*`, `lib/stripe.ts`, `lib/plans.ts` |
| F12 | Public passport links | Agent scopes via `bhf_pass_` token | Passport routes; scoped token (not an API key) |
| F13 | Slack collaboration | Integration bindings; Slack signatures | `lib/integrations/collaboration/slack/` |
| F14 | Admin console | Cross-account ops (shared admin password) | `app/console/*`, `lib/adminAuth.ts` |
| F15 | Status / incidents | Operator-managed status components/incidents | `app/api/status/route.ts`, `app/api/console/status/*` |
| F16 | SDK / CLI / MCP / Gateway | Keys in client env; verify decisions at edge of agent tooling | `packages/sdk`, `packages/cli`, `packages/mcp-*`, `packages/egress-proxy`, `app/api/egress/*`, `app/api/actions/*` |

---

## 3. Control matrix

Status legend used in audits: **I** = Implemented, **P** = Partial, **M** = Missing, **N/A** = Not applicable.

### 3.1 Security — Logical access (SOC 2 CC6 / ISO A.8.2–A.8.5)

| Control ID | Requirement summary | Features | Evidence | Status |
|------------|---------------------|----------|----------|--------|
| CC6.1 / A.8.5 | Authenticate users and agents | F01–F04, F07, F09, F14 | `lib/developerAuth.ts` (scrypt, sessions), `lib/auth.ts` (API keys + `timingSafeEqual`), `lib/googleOAuth.ts` (OIDC+PKCE), `lib/adminAuth.ts`, `lib/developerToken.ts` | P |
| CC6.1 / A.8.5 | MFA for privileged access | F01, F14 | Privacy copy references phone 2FA not used; no TOTP/WebAuthn in code | M |
| CC6.2 / A.8.3 | Restrict access by role | F02, F05–F08 | `lib/authority.ts`, `lib/delegatedAuth.ts`, `lib/membershipManagement.ts`, `lib/accountAccess.ts` | I |
| CC6.3 / A.8.2 | Tenant isolation | F02–F11 | `accountId` scoping in dashboard APIs; logical multi-tenant (not DB-per-tenant) | P |
| CC6.6 / A.8.24 | Cryptographic controls for secrets | F03, F07–F09, F12 | Hashed API keys/sessions/webhook secrets/site keys; no plaintext storage after issuance (`docs/SECURITY.md`) | P |
| CC6.7 / A.8.5 | Session management | F01 | HTTP-only cookies, `sameSite: "lax"`, 1h inactivity + 14d absolute TTL (`lib/sessionCookies.ts`, `lib/developerAuth.ts`) | P |
| CC6.8 / A.8.9 | Privileged admin access | F14 | Shared `BEHALFID_ADMIN_PASSWORD`; HMAC cookie; Origin checks (`lib/adminAuth.ts`) | P |

### 3.2 Security — System operations (SOC 2 CC7 / ISO A.8.15–A.8.16)

| Control ID | Requirement summary | Features | Evidence | Status |
|------------|---------------------|----------|----------|--------|
| CC7.1 / A.8.15 | Security event logging | F04–F05, F09–F10 | Verification logs with `requestId`; Site Guard access logs; CLI audit; structured `lib/logger.ts` + `lib/secretRedaction.ts` | P |
| CC7.1 / A.8.15 | Failed authentication logging | F01, F14 | Explicitly absent (`docs/SECURITY.md`) | M |
| CC7.2 / A.8.16 | Monitoring / anomaly detection | Platform | Health endpoints only; no Sentry/Datadog/APM/SIEM in-repo | M |
| CC7.3 | Evaluate security events | F15 | Status incident CRUD ≠ formal IR runbook | P |
| CC7.4 | Vulnerability management | CI | Informal `SECURITY_AUDIT_TODO.txt` + `npm audit`; no Dependabot/CodeQL workflow | P |

### 3.3 Security — Change management (SOC 2 CC8 / ISO A.8.32)

| Control ID | Requirement summary | Features | Evidence | Status |
|------------|---------------------|----------|----------|--------|
| CC8.1 / A.8.32 | Controlled change / CI | App + packages | `.github/workflows/ci.yml` (typecheck, build, tests, security-focused tests, postgres schema job) | I |
| CC8.1 / A.8.32 | Release integrity | CLI | `.github/workflows/cli-release.yml` (tag-on-main, npm provenance, SHA256SUMS) | I |
| CC8.1 | Production deploy change control | App | Manual Vercel deploy per `docs/PRODUCTION.md`; no deploy workflow / CODEOWNERS / branch-protection-as-code | P |

### 3.4 Security — Risk mitigation (SOC 2 CC9 / ISO A.8.20–A.8.22)

| Control ID | Requirement summary | Features | Evidence | Status |
|------------|---------------------|----------|----------|--------|
| CC9.1 | Rate limiting / abuse | Public APIs | `lib/rateLimit.ts`; Redis required in prod env (`lib/env.ts`); memory fallback weak on serverless | P |
| CC9.2 / A.8.22 | Network / SSRF controls | F08, F16 | `lib/ssrf.ts`, webhook HTTPS-in-prod, egress authorize (`lib/egressAuthorize.ts`, `packages/egress-proxy`) | I |
| CC9.2 | Fail-closed enforcement | F04, F16 | Design fail-closed on verify when integrated; Claude Code hook path can fail open (compatibility docs); Site Guard UA spoofable | P |
| CC9.2 | Browser hardening | Web UI | CSP nonce + `strict-dynamic`, HSTS, frame deny (`proxy.ts`, `next.config.ts`, `app/api/csp-report`) | I |

### 3.5 Processing integrity (SOC 2 PI1 / ISO A.8.26–A.8.28)

| Control ID | Requirement summary | Features | Evidence | Status |
|------------|---------------------|----------|----------|--------|
| PI1.1 / A.8.26 | Input validation | Public/console APIs | `lib/validation.ts` (`rejectUnknownFields`) | I |
| PI1.2 | Integrity of outbound events | F08 | HMAC-SHA256 webhook signing (`lib/webhooks.ts`); optional signing pepper | I |
| PI1.2 | Provider webhook integrity | F11, F13 | Stripe signature + idempotency; Slack request signature verify | I |
| PI1.3 | Complete / accurate processing | F04, F08 | Verification writes audit log; webhook outbox + retry/DLQ; Postgres now uses real `db.transaction()` for several write paths (account deletion, agent/webhook writes) — an improvement over the Mongo era — but webhook delivery itself remains at-least-once, not transactional | P |
| PI1.4 | Origin checks on mutations | F01, F14 | Origin header checks on dashboard/console mutations | P |
| PI1.5 | Claim accuracy (public disclosures) | Marketing | `/compliance` session/retention claims diverge from code | M |

### 3.6 Availability (SOC 2 A1 / ISO A.5.29–A.5.30, A.8.13–A.8.14)

| Control ID | Requirement summary | Features | Evidence | Status |
|------------|---------------------|----------|----------|--------|
| A1.1 | Capacity / health monitoring | Platform | `GET /api/health`, auth’d `GET /api/health/db`; no external uptime monitor config | P |
| A1.2 / A.8.13 | Backup | Data store | Supabase (Postgres) point-in-time recovery / backup capability assumed per provider plan; no tested restore evidence in-repo — see [ops/BACKUP_RESTORE.md](./ops/BACKUP_RESTORE.md) | M |
| A1.2 / A.5.30 | DR / BCP / RTO-RPO | Platform | Runbook exists ([ops/BCP_DR.md](./ops/BCP_DR.md)); no drill evidence in-repo | M |
| A1.3 | Environmental protections | Hosting | Relies on Vercel + Supabase provider controls | P |
| A1.2 | Recovery of async jobs | F08 | Webhook cron worker + DLQ replay; not a dedicated queue | P |
| A1.1 | Status communication | F15 | Public status + console incidents | P |

### 3.7 Confidentiality (secondary — SOC 2 C1 / ISO A.8.11, A.8.24)

| Control ID | Requirement summary | Features | Evidence | Status |
|------------|---------------------|----------|----------|--------|
| C1.1 | Protect secrets at rest | F03, F07–F09 | Hashes only for keys/secrets; app-level field encryption not implemented (host encryption) | P |
| C1.1 | TLS in transit | All | Prod `NEXT_PUBLIC_APP_URL` must be https (`lib/env.ts`) | I |
| C1.1 | Log / error redaction | Logging | `lib/secretRedaction.ts`, `lib/logger.ts` | I |

### 3.8 ISO organizational / ISMS (clauses 4–10 + A.5)

| Control ID | Requirement summary | Evidence in repo | Status |
|------------|---------------------|------------------|--------|
| A.5.1 Policies | InfoSec policy hierarchy | Acceptable use in ToS; no formal ISMS policy set | M |
| A.5.9 Asset inventory | Asset register | Privacy categories; no formal asset register | P |
| A.5.19–A.5.22 Supplier | Vendor risk | Subprocessors listed on compliance/privacy; no assessment artifacts | M |
| A.5.24–A.5.28 Incident | IR process | Status page incidents only | M |
| A.5.15 Access control policy | Formal access reviews | RBAC in product; no documented access-review cadence for prod infra | M |
| Clauses 4–10 | ISMS operation | No SoA (until this pack), risk register, internal audit cadence, management review | M |

---

## 4. Crosswalk summary (feature → primary criteria)

| Feature | CC | PI | A | ISO highlights |
|---------|----|----|---|---------------|
| F01 Auth | CC6, CC7 | PI1.4 | — | A.8.5 |
| F02 Workspaces | CC6 | — | — | A.5.15, A.8.3 |
| F03 Agents/keys | CC6, C1 | — | — | A.8.24 |
| F04 Verify | CC7, CC9 | PI1.3 | A1 | A.8.15, A.8.26 |
| F05 Logs | CC7 | PI1.5 | — | A.8.10, A.8.15 |
| F08 Webhooks | CC9, C1 | PI1.2–1.3 | A1 | A.8.14, A.8.24 |
| F09 Site Guard | CC6, CC7 | — | — | A.8.5, A.8.16 |
| F11 Billing | CC6 | PI1.2 | — | A.5.19 |
| F14 Console | CC6, CC7 | PI1.4 | — | A.8.2, A.8.5 |
| F16 Enforcement clients | CC9 | PI1 | A1 | A.8.20–22 |
| Platform CI/CD | CC8 | — | — | A.8.32 |
| Platform hosting | — | — | A1 | A.5.23, A.8.13–14 |

---

## 5. Evidence index (quick paths)

| Area | Paths |
|------|-------|
| Security notes | `docs/SECURITY.md`, `app/security/page.tsx`, `app/compliance/page.tsx` |
| Production ops | `docs/PRODUCTION.md`, `lib/env.ts` |
| Auth | `lib/auth.ts`, `lib/developerAuth.ts`, `lib/sessionCookies.ts`, `lib/adminAuth.ts`, `lib/googleOAuth.ts` |
| RBAC / tenancy | `lib/authority.ts`, `lib/accountAccess.ts`, `lib/membershipManagement.ts` |
| Verify / logs | `lib/verify.ts`, `lib/verificationLogs.ts`, `lib/plans.ts` |
| Webhooks / SSRF | `lib/webhooks.ts`, `lib/ssrf.ts` |
| Rate limit | `lib/rateLimit.ts` |
| Validation | `lib/validation.ts` |
| Logging / redaction | `lib/logger.ts`, `lib/secretRedaction.ts` |
| Health | `app/api/health/route.ts`, `app/api/health/db/route.ts` |
| CI / release | `.github/workflows/ci.yml`, `.github/workflows/cli-release.yml` |
| Dep audit log | `SECURITY_AUDIT_TODO.txt` |
| Egress / MCP | `packages/egress-proxy`, `packages/mcp-audit`, `packages/mcp-runtime`, `lib/egressAuthorize.ts` |

---

## 6. Related artifacts

- [GAP_ANALYSIS.md](./GAP_ANALYSIS.md)
- [SOC2_AUDIT.md](./SOC2_AUDIT.md)
- [ISO27001_AUDIT.md](./ISO27001_AUDIT.md)
- [SOA_DRAFT.md](./SOA_DRAFT.md)
- [README.md](./README.md) (evidence pack + remediation backlog)
