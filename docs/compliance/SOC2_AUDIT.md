# BehalfID — SOC 2 Internal Audit Report

**Audit type:** Internal readiness / design effectiveness  
**Audit date:** 2026-07-24  
**Auditor:** Automated internal assessment (Composer) against repository evidence  
**Period tested:** Point-in-time (not a Type II observation window)  
**Criteria in scope:** Security (CC), Processing Integrity (PI), Availability (A)  
**Out of scope:** Formal CPA attestation; Privacy (P) except where overlapping access/logging; Confidentiality tested only where secrets apply (C1 secondary)

> This is **not** a SOC 2 Type I or Type II report issued by a licensed CPA firm.

---

## 1. Opinion (internal)

Based on design review of the BehalfID codebase and documentation:

| Criterion | Design effectiveness | Opinion |
|-----------|----------------------|---------|
| Security (CC) | Partially effective | **Qualified** — strong technical access & change controls; material exceptions for MFA, admin identity, failed-auth logging, monitoring |
| Processing Integrity (PI) | Partially effective | **Qualified** — strong validation/signing; **material misstatement risk** in public retention/session disclosures |
| Availability (A) | Ineffective for Type II readiness | **Adverse for continuity evidence** — health checks and provider HA exist; backups/DR/alerting unevidenced |

**Overall internal readiness for external Type II:** Not ready. Type I kickoff possible after remediating Critical findings SOC-01 / SOC-02 and documenting minimum policies.

---

## 2. System under audit

- **Application:** BehalfID SaaS — agent permission verification, audit logs, webhooks, Site Guard, developer dashboard, admin console.
- **Infrastructure (documented):** Vercel + MongoDB Atlas + Upstash Redis + Stripe + Google OAuth.
- **Boundaries:** Customer integrations (SDK/CLI/MCP/egress) are in scope for control design where they affect integrity/availability of enforcement; customer-side fail-open choices are residual risk.

Reference: [CONTROL_MATRIX.md](./CONTROL_MATRIX.md).

---

## 3. Audit procedures

For each control objective:

1. Identify expected control from TSC mapping.
2. Inspect code/docs/CI evidence paths.
3. Rate **Pass** / **Pass with exception** / **Fail**.
4. Link finding IDs to gap analysis (G-xx) where applicable.

No production log sampling or personnel interviews were performed (Type II OE not tested).

---

## 4. Findings

| Finding ID | Result | Criterion | Title | Evidence tested | Exception / gap |
|------------|--------|-----------|-------|-----------------|-----------------|
| SOC-01 | Fail | PI1.5 / CC6.7 | Public session claims inaccurate | `app/compliance/page.tsx` vs `lib/sessionCookies.ts`, `lib/developerAuth.ts` (`sameSite: "lax"`, `SESSION_INACTIVITY_MS` = 1h) | G-01 |
| SOC-02 | Fail | PI1.5 / CC7.1 | Public retention/purge claims inaccurate | `app/compliance/page.tsx` vs `lib/plans.ts` plan `logRetentionDays`; Mongo purge not evidenced as automatic | G-02 |
| SOC-03 | Fail | CC6.1 | MFA not implemented | No TOTP/WebAuthn; privacy copy acknowledges limited 2FA | G-03 |
| SOC-04 | Pass w/ exc. | CC6.8 | Privileged console uses shared secret | `lib/adminAuth.ts` — HMAC cookie + Origin checks mitigate some risk; no per-admin identity | G-04 |
| SOC-05 | Fail | CC7.1 | Failed auth not logged | `docs/SECURITY.md` known limitation | G-05 |
| SOC-06 | Pass | CC6.2 | Workspace RBAC enforced | `lib/authority.ts`, membership checks on dashboard APIs | — |
| SOC-07 | Pass | CC6.6 / C1 | Secrets stored hashed | `lib/auth.ts`, `lib/webhooks.ts`, `lib/developerToken.ts` | Pepper deferred (G-10) noted as exception below |
| SOC-08 | Pass w/ exc. | CC6.6 | API key hash without pepper | Deterministic SHA-256 per `docs/SECURITY.md` | G-10 |
| SOC-09 | Pass | CC6.1 | Developer auth design | scrypt + Google OIDC/PKCE (`lib/developerAuth.ts`, `lib/googleOAuth.ts`) | — |
| SOC-10 | Pass w/ exc. | CC6.3 | Tenant isolation logical only | `lib/accountAccess.ts` account scoping | Acceptable for current stage if system description discloses shared tenancy |
| SOC-11 | Pass | CC7.1 | Verification audit logging | `lib/verificationLogs.ts`, `lib/verify.ts`, redaction | — |
| SOC-12 | Fail | CC7.2 / A1.1 | Insufficient monitoring/alerting | No APM/SIEM; health routes only | G-07 |
| SOC-13 | Pass | CC8.1 | CI change detection | `.github/workflows/ci.yml` | — |
| SOC-14 | Pass | CC8.1 | CLI release integrity | `cli-release.yml` provenance + checksums | — |
| SOC-15 | Pass w/ exc. | CC8.1 | App deploy change control manual | `docs/PRODUCTION.md` | G-12 |
| SOC-16 | Pass | CC9.2 | SSRF / webhook URL controls | `lib/ssrf.ts`, `lib/webhooks.ts` | — |
| SOC-17 | Pass w/ exc. | CC9.1 | Rate limiting | `lib/rateLimit.ts`, Redis required in `lib/env.ts`; runtime fallback risk | G-15 |
| SOC-18 | Pass | CC9.2 | Browser CSP / security headers | `proxy.ts`, CSP report route | — |
| SOC-19 | Pass | PI1.1 | Input validation | `lib/validation.ts` | — |
| SOC-20 | Pass | PI1.2 | Webhook & Stripe integrity | HMAC webhooks; Stripe signature + idempotency | — |
| SOC-21 | Pass w/ exc. | PI1.3 | Processing completeness | Outbox/retry/DLQ present; no Mongo transactions; at-least-once | G-13, G-14 |
| SOC-22 | Pass | PI1.4 | Origin checks on mutations | Dashboard/console Origin validation | Residual CSRF risk G-17 |
| SOC-23 | Pass w/ exc. | A1.1 | Health endpoints | `/api/health`, `/api/health/db` | No external uptime evidence |
| SOC-24 | Fail | A1.2 | Backup & restore | No tested restore evidence / RPO in-repo | G-06 |
| SOC-25 | Fail | A1.2 / A1.3 | DR/BCP | Listed in progress on `/compliance`; no runbook | G-06, G-09 |
| SOC-26 | Pass w/ exc. | A1.2 | Webhook job resilience | Cron worker + DLQ replay | Not dedicated queue (G-14) |
| SOC-27 | Pass w/ exc. | CC9.2 | Fail-closed enforcement | Core verify fail-closed when integrated; some agent hooks fail open | G-20 |

### Summary counts

| Result | Count |
|--------|-------|
| Pass | 11 |
| Pass with exception | 9 |
| Fail | 7 |

---

## 5. Criterion-level conclusions

### Security (CC)

**Effective aspects:** Authentication cryptography, RBAC, hashed secrets, verification logging, CI/release controls, SSRF/CSP/rate-limit design.

**Material weaknesses:** No MFA; shared console password; no failed-auth logging; weak continuous monitoring; dependency automation informal.

### Processing Integrity (PI)

**Effective aspects:** Field whitelists, HMAC-signed webhooks, Stripe/Slack verification, Origin checks.

**Material weaknesses:** Public compliance disclosures contradict implemented session and retention behavior — treat as **management assertion risk** before any external audit.

### Availability (A)

**Effective aspects:** Basic health checks; provider-managed HA assumptions; webhook retry/DLQ.

**Material weaknesses:** No evidenced backups, DR/BCP, RTO/RPO, or operational alerting. Status-page incidents do not constitute availability governance.

---

## 6. Management response placeholders

| Finding | Suggested owner | Target |
|---------|-----------------|--------|
| SOC-01, SOC-02 | Product / Legal | Immediate (P0) |
| SOC-03, SOC-04, SOC-05 | Engineering / Security | P1 |
| SOC-12, SOC-24, SOC-25 | Engineering / Ops | P1 |
| SOC-08, SOC-15, SOC-17, SOC-21 | Engineering | P2 |

---

## 7. Related artifacts

- [GAP_ANALYSIS.md](./GAP_ANALYSIS.md)
- [CONTROL_MATRIX.md](./CONTROL_MATRIX.md)
- Interactive findings: `canvases/soc2-internal-audit.canvas.tsx`
