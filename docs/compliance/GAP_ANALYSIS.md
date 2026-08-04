# BehalfID — SOC 2 / ISO 27001 Gap Analysis

**Assessment date:** 2026-07-24  
**Basis:** [CONTROL_MATRIX.md](./CONTROL_MATRIX.md) + code/docs review  
**Scope:** Security, Processing Integrity, Availability (SOC 2) + ISO 27001:2022 Annex A / ISMS readiness  
**Method:** Design effectiveness review against repository evidence (not Type II operating-period sampling)

> Interactive view: open the gap analysis canvas beside chat (see evidence pack README).

Remaining open gaps (G-06–G-19) are tracked at https://github.com/BehalfID/behalf/issues/157

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
