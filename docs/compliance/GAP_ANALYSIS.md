# BehalfID — SOC 2 / ISO 27001 Gap Analysis

**Assessment date:** 2026-07-24  
**Basis:** [CONTROL_MATRIX.md](./CONTROL_MATRIX.md) + code/docs review  
**Scope:** Security, Processing Integrity, Availability (SOC 2) + ISO 27001:2022 Annex A / ISMS readiness  
**Method:** Design effectiveness review against repository evidence (not Type II operating-period sampling)

> Interactive view: open the gap analysis canvas beside chat (see evidence pack README).

---

## 1. Executive summary

BehalfID has a **solid technical control foundation** for a permission-verification SaaS (hashed secrets, RBAC, validation, HMAC webhooks, SSRF guards, CI, structured audit logs). Readiness for SOC 2 Type II and ISO 27001 is blocked primarily by:

1. **Organizational / ISMS gaps** (policies, risk register, IR/BCP, vendor assessments, access reviews, management review).
2. **Availability / continuity gaps** (no documented/tested backups, RTO/RPO, APM/alerting).
3. **Access & monitoring gaps** (no MFA, shared console admin password, no failed-auth logging).
4. **Public claim drift** on `/compliance` vs actual session and retention behavior.

| Score dimension | Implemented | Partial | Missing | N/A |
|-----------------|-------------|---------|---------|-----|
| Security (CC) | 5 | 10 | 3 | 0 |
| Processing Integrity (PI) | 3 | 2 | 1 | 0 |
| Availability (A) | 0 | 4 | 2 | 0 |
| ISO org / ISMS | 0 | 1 | 6 | 0 |

*Counts are control-row aggregates from §3; see matrix for detail.*

---

## 2. Critical and high gaps (priority order)

| Gap ID | Severity | Area | Finding | Criteria | Recommended remediation |
|--------|----------|------|---------|----------|-------------------------|
| G-01 | Critical | Integrity / Trust | REMEDIATED 2026-07-24: compliance copy matches SameSite=Lax + 1h/14d | PI1.5, CC6.7, A.8.5 | Keep copy in sync with session code |
| G-02 | Critical | Integrity / Trust | REMEDIATED 2026-07-24: plan-based retention disclosed; Mongo purge cron added | PI1.5, CC7.1, A.8.10 | Schedule `/api/cron/purge-logs` in prod |
| G-03 | High | Security | REMEDIATED 2026-07-24: developer TOTP MFA | CC6.1, A.8.5 | Encourage OWNER enroll; optional console MFA later |
| G-04 | High | Security | REMEDIATED 2026-07-24: ConsoleAdmin + audit log; shared password bootstrap/legacy | CC6.8, A.8.2 | Set `BEHALFID_ALLOW_SHARED_ADMIN=false` after bootstrap |
| G-05 | High | Security | REMEDIATED 2026-07-24: AuthEvent failed-auth logging | CC7.1, A.8.15 | Monitor AuthEvent spikes |
| G-06 | High | Availability | PARTIAL: backup/restore runbook published; restore drill still required | A1.2, A.5.30, A.8.13 | Complete quarterly restore drill |
| G-07 | High | Availability | PARTIAL: Sentry + MONITORING.md; external uptime still recommended | CC7.2, A1.1, A.8.16 | Configure SENTRY_DSN + uptime checks |
| G-08 | High | ISMS | No formal ISMS leadership approval yet | Clauses 4–10, A.5.1 | Approve policies / SoA / risk register |
| G-09 | High | ISMS | REMEDIATED 2026-07-24: IR + BCP runbooks | CC7.3, A.5.24–28 | Staff on-call roster outside repo |
| G-10 | Medium | Security | API key hashes deterministic SHA-256 without pepper | CC6.6, A.8.24 | HMAC pepper or key-id + HMAC design per `docs/SECURITY.md` |
| G-11 | Medium | Security | No Dependabot/Renovate/CodeQL; vuln mgmt is informal npm audit log | CC7.4, A.8.8 | Automate dependency PRs + track remediation SLA |
| G-12 | Medium | Change | App production deploy not gated by in-repo change-control workflow | CC8.1, A.8.32 | Deploy approvals, env separation, deploy audit trail |
| G-13 | Medium | Integrity | API actions + webhook outbox not in Mongo transactions | PI1.3 | Use transactions or dual-write compensation |
| G-14 | Medium | Availability | Webhook worker is cron API route, not dedicated queue | A1.2, A.8.14 | Queue service or hardened worker with observability |
| G-15 | Medium | Security | Rate-limit memory fallback weak if Redis unreachable at runtime | CC9.1 | Fail closed / degrade safely; alert on Redis loss |
| G-16 | Medium | ISMS | No documented vendor risk assessments for subprocessors | A.5.19–22 | Annual vendor reviews; track BAAs/DPAs |
| G-17 | Low | Security | No CSRF tokens beyond SameSite + Origin | CC6.1 | Document residual risk or add CSRF tokens for cookie auth |
| G-18 | Low | Security | Product still self-describes as prototype unsuitable for open multi-tenant without hardening | CC / marketing | Either harden multi-tenant posture or keep scope constrained in auditor system description |
| G-19 | Low | Integrity | Verify `metadata` can hold sensitive fields when enabled | PI1.1, C1 | Default metadata off in prod; customer guidance |
| G-20 | Low | Enforcement | Some agent paths fail open (e.g. Claude Code hook outage); Site Guard UA spoofable | CC9.2 | Document as residual risk; prefer fail-closed integrations |

---

## 2b. 2026-08-12 supplementary review (ISO 27001 / SOC 2 / HIPAA / GDPR / CPRA scan)

Targeted scan of encryption, access control, audit logging, data retention, PII handling, and
security configuration against ISO27001, SOC2, HIPAA, GDPR, and CPRA. Supersedes the G-04
"REMEDIATED" note above where noted: the 2026-07-24 pass added the admin audit log table and
wired it to console login, but no mutating console route ever wrote to it — this pass closes
that gap. Items below are additive to §2; IDs continue the existing sequence.

| Gap ID | Severity | Area | Finding | Criteria | Status |
|--------|----------|------|---------|----------|--------|
| G-21 | High | Privacy | GDPR/CPRA erasure was incomplete: `deleteDeveloperUserCredentials` deleted sessions/tokens/the user record but left `PasskeyCredential` (public keys) and `ExternalIdentity` (linked-provider email/username) orphaned after a verified deletion request, contradicting the 30-day deletion promise in the privacy policy | GDPR Art. 17, CPRA §1798.105 | **FIXED** — both Mongo and Postgres `deleteDeveloperUserCredentials` now cascade these two tables (`lib/repositories/mongo/accountDeletion.ts`, `lib/repositories/postgres/accountDeletion.ts`) |
| G-22 | High | Security / Audit | Admin audit log (added 2026-07-24) was only written on console login; every privileged mutation — disabling a customer's agent, rotating their webhook secret, replaying a webhook event, editing Site Guard rules, editing status incidents — left no record of which admin acted or when | SOC2 CC7.2, ISO27001 A.12.4, HIPAA §164.312(b) | **FIXED** — `recordAdminAudit` now called from all 19 console mutation routes (agents, permissions, webhooks, sites/rules, webhook-event replay, status components/incidents, enterprise inquiries, status seed); see route diffs |
| G-23 | Medium | Privacy | Privacy policy claimed rate-limit IPs are "stored in memory only; not persisted to disk," but `lib/rateLimit.ts` switches to Upstash Redis in production when `UPSTASH_REDIS_REST_URL`/`KV_REST_API_URL` are set, storing raw IPs as keys for the rate-limit window; Upstash was also missing from the subprocessor table | GDPR Art. 13 (accurate disclosure) | **FIXED** — `messages/{en,de,es,fr}.json` s6.item5 corrected; Upstash added as subprocessor row in privacy page + all locales |
| G-24 | Medium | Privacy | Privacy policy promises 30-day retention for webhook delivery records, but no purge job existed for `WebhookDelivery`/`webhookDeliveries` — records accumulated indefinitely | GDPR Art. 5(1)(e) storage limitation | **FIXED** — `lib/logPurge.ts` now purges webhook deliveries past a 30-day + grace-period cutoff; wired into the existing `/api/cron/purge-logs` job |
| G-25 | Low | Security | `X-Powered-By` header exposed Next.js framework/version fingerprint on every response | ISO27001 A.8.9 | **FIXED** — `poweredByHeader: false` in `next.config.ts` |
| G-26 | High | Security | `consoleAdmins.role` (`"owner" \| "operator"`) is persisted at admin-creation time but never read by any authorization check — every authenticated admin, including shared-password sessions, has identical unrestricted access to every console route | SOC2 CC6.1/CC6.3, ISO27001 A.9.2.3 (least privilege) | **OPEN — not auto-fixed.** Enforcing this changes who can do what; rolling it out blind risks locking out admins whose `role` was never meaningfully set. Needs: (1) audit current `consoleAdmins` rows and assign real roles, (2) decide which routes require `owner`, (3) add the check, (4) migrate/communicate before enforcing. |
| G-27 | High | Security / Audit | Admin/verification audit logs are mutable — `verificationLogs.updateLogs`/`deleteLogs` accept arbitrary filters, and `revokePermission` overwrites `status`/`updatedBy` in place rather than appending an event — so a DB-level compromise or bug can rewrite history undetected | SOC2 CC7.2, ISO27001 A.12.4.3 | **OPEN — not auto-fixed.** Tamper-evidence (append-only ledger, hash chaining, or WORM storage) is a schema/infra decision, not a safe blind patch. |
| G-28 | Medium | Security | (a) `lib/mfa.ts` derives the AES-256-GCM key that protects TOTP secrets by falling back `BEHALFID_MFA_PEPPER → BEHALFID_SETUP_TOKEN → BEHALFID_ADMIN_PASSWORD → "dev-only-mfa-pepper"`, risking key reuse across unrelated secrets when the dedicated pepper isn't set (it's optional today). (b) The Postgres client (`lib/db/postgres/index.ts`) sets no `ssl` option; harmless while this path is explicitly not wired to the app runtime, but a live gap once the Postgres cutover (see `docs/DATABASE_MIGRATION.md`) completes | ISO27001 A.8.24, HIPAA §164.312(e)(1) | **OPEN — not auto-fixed.** (a) Changing key derivation without a migration path would make existing users' stored MFA secrets undecryptable — needs a designed key-rotation plan, not a blind change. (b) Add `ssl: "require"` (prod only) before Postgres becomes authoritative. |
| G-29 | Medium | Privacy / ISMS | Billing plan/subscription changes (`app/api/billing/webhook/route.ts`) are sent to product analytics only, with no durable internal audit trail of "account X moved plan Y→Z at time T because of event E" outside Stripe's own dashboard. Separately, `IdentityAuditLog`/`CliAuditLog`/`AdminAuditLog` are durable-by-design (no TTL, intentionally — they're the product's own security history) but aren't listed in the privacy policy's retention table, and `EnterpriseInquiry` (marketing lead PII: name/email/company/message) has no retention window or deletion path at all | SOC2 CC7.2 (financial controls), GDPR Art. 5(1)(e) | **OPEN — not auto-fixed.** These are business/legal decisions, not code bugs: audit-log retention has to balance GDPR minimization against SOC2/HIPAA's own audit-trail-integrity requirements (the right answer is usually pseudonymize-on-deletion + a disclosed retention window, not delete), and EnterpriseInquiry needs an owner-defined retention policy before code can enforce it. |

**Note on G-21/G-29 tension:** `IdentityAuditLog` and `CliAuditLog` were deliberately *not* added to the account-deletion cascade in G-21's fix, even though they contain `userId`-linked history, because their own code comments state they exist specifically to survive account changes as durable security history (the same property SOC2/ISO27001 audit-trail controls require). Deleting them on account deletion would trade a GDPR erasure improvement for an audit-integrity regression. This needs a deliberate policy (see G-29), not a mechanical fix.

---

## 3. Control-by-control status

### Security

| Control | Status | Severity if gap | Notes |
|---------|--------|-----------------|-------|
| Authn (passwords, OIDC, API keys) | Partial | High | Strong hashing/compare; no MFA |
| RBAC / membership | Implemented | — | OWNER→VIEWER authority model |
| Tenant isolation | Partial | Medium | Logical `accountId` only |
| Secret storage (hashes) | Partial | Medium | Good hashing; no pepper; host encryption for DB |
| Session management | Partial | Critical* | Works; **public claims wrong** |
| Privileged console | Partial | High | Shared password |
| Security logging (verify) | Partial | High | Strong decision logs; missing failed-auth |
| Monitoring / APM | Missing | High | Health only |
| Vuln management | Partial | Medium | Manual npm audit history |
| CI change control | Implemented | — | Strong CI |
| Release provenance (CLI) | Implemented | — | Provenance + checksums |
| Deploy change control (app) | Partial | Medium | Manual Vercel |
| Rate limiting | Partial | Medium | Redis required in env; fallback risk |
| SSRF / egress | Implemented | — | Strong product controls |
| Fail-closed design | Partial | Low–Med | Integration-dependent |
| CSP / browser headers | Implemented | — | Nonce CSP + reports |

\*Severity elevated because inaccurate public disclosures create auditor / customer trust failure (PI1.5), not because sessions are insecure by design.

### Processing integrity

| Control | Status | Severity if gap | Notes |
|---------|--------|-----------------|-------|
| Input validation | Implemented | — | Field whitelists |
| Webhook / Stripe / Slack integrity | Implemented | — | HMAC / signatures / idempotency |
| End-to-end processing consistency | Partial | Medium | No transactions; at-least-once webhooks |
| Origin checks | Partial | Low | SameSite+Origin, no CSRF token |
| Public disclosure accuracy | Missing | Critical | Compliance page drift |

### Availability

| Control | Status | Severity if gap | Notes |
|---------|--------|-----------------|-------|
| Health checks | Partial | Medium | Present; no external monitor |
| Backups | Missing | High | Provider capability ≠ evidenced control |
| DR/BCP | Missing | High | Listed in progress on site |
| Provider HA | Partial | Medium | Relies on Vercel/Atlas |
| Async job resilience | Partial | Medium | Outbox/retry/DLQ exists |
| Status page | Partial | Medium | Comms aid, not IR |

### ISO organizational

| Control | Status | Severity if gap | Notes |
|---------|--------|-----------------|-------|
| Policies / ISMS | Missing | High | Required for certification |
| Asset register | Partial | Medium | Privacy categories only |
| Supplier security | Missing | High | No assessment pack |
| Incident management | Missing | High | Status ≠ IR |
| Access review cadence | Missing | Medium | Product RBAC ≠ infra reviews |
| Performance evaluation (internal audit / mgmt review) | Missing | High | This engagement is first structured internal audit |

---

## 4. Strengths to preserve

- One-way hashed API keys, sessions, webhook secrets, site keys; timing-safe compares.
- scrypt passwords; Google OIDC with PKCE; workspace Google SSO domain enforcement.
- Workspace RBAC and account-scoped dashboard APIs.
- Verification audit trail with stable `requestId` and secret redaction.
- HMAC-signed webhooks, SSRF URL validation, Stripe/Slack signature verification.
- Field-whitelist validation; CSP with reporting endpoint.
- CI with tests + CLI release provenance.
- Egress proxy / MCP audit tooling for enforcement-at-boundary use cases.

---

## 5. Readiness verdict

| Framework | Ready for external audit kickoff? | Blocking themes |
|-----------|-----------------------------------|-----------------|
| SOC 2 Type I (design) | **Near** — after fixing claim drift + documenting system description & control owners | G-01, G-02, G-04, G-05, G-08 (minimum policies) |
| SOC 2 Type II (operating effectiveness) | **Not ready** — need observation period evidence: access reviews, IR drills, backup restores, monitoring, change tickets | G-06, G-07, G-09, G-12 + operating evidence |
| ISO 27001 certification | **Not ready** — ISMS must operate (SoA, risk treatment, internal audits, management review) before Stage 1/2 | G-08, G-09, G-16 + clauses 4–10 |

---

## 6. Related artifacts

- [CONTROL_MATRIX.md](./CONTROL_MATRIX.md)
- [SOC2_AUDIT.md](./SOC2_AUDIT.md)
- [ISO27001_AUDIT.md](./ISO27001_AUDIT.md)
- [SOA_DRAFT.md](./SOA_DRAFT.md)
- [README.md](./README.md)
