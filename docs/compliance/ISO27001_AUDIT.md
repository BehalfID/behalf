# BehalfID — ISO 27001:2022 Internal Audit Report

**Audit type:** Internal ISMS readiness / control design review  
**Audit date:** 2026-07-24  
**Standard:** ISO/IEC 27001:2022 (clauses 4–10) + Annex A (via draft SoA)  
**Scope:** Proposed ISMS scope = BehalfID hosted SaaS and supporting cloud operations as described in [CONTROL_MATRIX.md](./CONTROL_MATRIX.md)  
**Limitation:** No accredited certification body engagement; people/HR/physical controls largely outside repository evidence

> This is **not** an ISO 27001 certificate and does not satisfy Stage 1/Stage 2 CB requirements by itself.

---

## 1. Opinion (internal)

| Area | Readiness | Opinion |
|------|-----------|---------|
| Annex A technological (A.8) | Partial | **Qualified** — application security controls are meaningful; monitoring, backup, MFA gaps remain |
| Annex A organizational (A.5) | Weak | **Not ready** — policies, IR, BCP, supplier mgmt largely missing |
| Annex A people (A.6) | Weak | **Not ready** — training/screening outside repo / not evidenced |
| ISMS clauses 4–10 | Weak | **Not ready** — ISMS not established as a managed system |

**Overall:** BehalfID is **not ready** for ISO 27001 certification. The draft SoA and this audit can seed Stage 0 readiness work.

---

## 2. ISMS clause assessment (4–10)

| Clause | Title | Result | Notes |
|--------|-------|--------|-------|
| 4 | Context of the organization | Fail | No documented ISMS scope, interested parties register, or internal/external issues analysis (system description in this pack is a start) |
| 5 | Leadership | Fail | No InfoSec policy approved by leadership; roles not formally assigned |
| 6 | Planning | Fail | No risk assessment methodology, risk register, or risk treatment plan |
| 7 | Support | Fail | Awareness training missing; competence records missing; documented information incomplete |
| 8 | Operation | Pass w/ exc. | Technical operations exist (`docs/PRODUCTION.md`, CI); supplier/IR/BCP operations missing |
| 9 | Performance evaluation | Fail | No monitoring metrics, internal audit program (this is ad hoc), no management review |
| 10 | Improvement | Fail | No formal nonconformity / CAPA process (remediation backlog in this pack is informal start) |

---

## 3. Annex A findings (sample tested)

| Finding ID | Result | Annex A | Title | Evidence / gap |
|------------|--------|---------|-------|----------------|
| ISO-01 | Fail | A.5.1 | No InfoSec policy hierarchy | `/compliance` lists as in progress |
| ISO-02 | Fail | A.5.19–22 | Supplier security not assessed | Subprocessors named; no assessment artifacts |
| ISO-03 | Fail | A.5.24–28 | Incident management incomplete | Status incidents UI only |
| ISO-04 | Fail | A.5.30 / A.8.13 | No BCP / backup evidence | Atlas assumed; no restore drill |
| ISO-05 | Fail | A.6.3 | No security awareness program | Listed in progress on site |
| ISO-06 | Pass | A.5.14 | Information transfer protected | TLS + HMAC webhooks |
| ISO-07 | Pass | A.8.3 | Access restriction in app | RBAC + account scoping |
| ISO-08 | Pass w/ exc. | A.8.5 | Secure authentication | scrypt/OIDC/keys strong; no MFA; claim drift |
| ISO-09 | Pass | A.8.11 | Data masking / redaction | `lib/secretRedaction.ts` |
| ISO-10 | Pass w/ exc. | A.8.15 | Logging | Verify logs strong; failed-auth missing |
| ISO-11 | Fail | A.8.16 | Monitoring activities | No APM/SIEM |
| ISO-12 | Pass w/ exc. | A.8.24 | Cryptography | TLS + hashing; no pepper / field encryption |
| ISO-13 | Pass | A.8.26 | Application security requirements | Validation, authn/z, Origin |
| ISO-14 | Pass w/ exc. | A.8.32 | Change management | CI/CLI strong; app deploy manual |
| ISO-15 | Pass w/ exc. | A.8.8 | Vulnerability management | Manual npm audit log only |
| ISO-16 | Fail | A.5.31 | Legal/regulatory disclosures accuracy | `/compliance` vs code mismatches (G-01, G-02) |
| ISO-17 | Pass w/ exc. | A.8.20–22 | Network security | SSRF/egress good; tenancy logical |
| ISO-18 | Fail | A.5.35 | Independent review cadence | First structured internal audit; no schedule |

### Summary counts (tested sample)

| Result | Count |
|--------|-------|
| Pass | 4 |
| Pass with exception | 6 |
| Fail | 8 |

---

## 4. Nonconformities (major / minor)

### Major (certification blockers)

1. **ISMS not established** (clauses 4–7, 9–10) — no policy, risk process, management review.
2. **Incident & continuity** (A.5.24–30, A.8.13) — no IR/BCP/backup evidence.
3. **Supplier security** (A.5.19–22) — cloud dependency without due diligence records.
4. **Monitoring** (A.8.16) — insufficient detection capability.
5. **Disclosure integrity** (A.5.31) — public compliance claims contradict implementation.

### Minor (should correct before Stage 2)

1. MFA / privileged identity model (A.8.2, A.8.5).
2. Failed-auth logging (A.8.15).
3. Automated vulnerability management (A.8.8).
4. App deploy change control (A.8.32).
5. API key pepper / crypto roadmap (A.8.24).

---

## 5. Stage readiness roadmap

| Stage | Exit criteria |
|-------|---------------|
| Stage 0 (now) | Approve draft SoA; fix claim drift; appoint ISMS owner |
| Pre-Stage 1 | Policies, risk register, IR/BCP, vendor assessments, MFA plan, monitoring |
| Stage 1 (CB) | Documented ISMS complete; SoA approved; internal audit + management review done once |
| Stage 2 (CB) | Operating evidence over period; CAPA closed for majors |

---

## 6. Related artifacts

- [SOA_DRAFT.md](./SOA_DRAFT.md)
- [GAP_ANALYSIS.md](./GAP_ANALYSIS.md)
- [SOC2_AUDIT.md](./SOC2_AUDIT.md)
- Interactive findings: `canvases/iso27001-internal-audit.canvas.tsx`
