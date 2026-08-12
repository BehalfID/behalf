# BehalfID — ISO 27001:2022 Statement of Applicability (Draft)

**Document status:** Draft for internal readiness — **not** an approved SoA under a certified ISMS  
**Date:** 2026-07-24 (infrastructure references updated 2026-08-12 to match the 2026-07-31 Supabase/Postgres cutover)  
**Scope (proposed):** BehalfID hosted SaaS (developer dashboard, verify API, audit logs, webhooks, Site Guard, admin console, billing integrations) operated on Vercel + Supabase (Postgres)  
**Exclusions (proposed):** Physical office security (fully remote / cloud); customer-side agent runtimes outside BehalfID control

**Legend:**  
- **Applicability:** Applicable / Not applicable  
- **Implementation:** Implemented / Partial / Not implemented  
- **Justification:** Why included/excluded or residual risk

---

## Annex A — Organizational controls (A.5)

| ID | Control | Applicable | Implementation | Justification / notes |
|----|---------|------------|----------------|----------------------|
| A.5.1 | Policies for information security | Y | Not implemented | ToS/acceptable use only; need InfoSec policy hierarchy |
| A.5.2 | Information security roles | Y | Partial | Engineering ownership implicit; no RACI / CISO charter in-repo |
| A.5.3 | Segregation of duties | Y | Partial | Workspace RBAC; shared console admin weakens SoD |
| A.5.4 | Management responsibilities | Y | Not implemented | No management review records |
| A.5.5 | Contact with authorities | Y | Not implemented | Process not documented |
| A.5.6 | Contact with special interest groups | Y | Not implemented | Optional; track when ISMS starts |
| A.5.7 | Threat intelligence | Y | Not implemented | No formal TI process |
| A.5.8 | Information security in project management | Y | Partial | Security tests in CI; no secure-SDLC policy |
| A.5.9 | Inventory of information and other associated assets | Y | Partial | Privacy categories; no formal asset register |
| A.5.10 | Acceptable use of information and other associated assets | Y | Partial | Embedded in Terms of Service |
| A.5.11 | Return of assets | Y | Partial | Account deletion (`lib/accountDeletion.ts`); employee laptop process N/A in-repo |
| A.5.12 | Classification of information | Y | Partial | Implicit via retention/plans; no formal scheme |
| A.5.13 | Labelling of information | Y | Not implemented | |
| A.5.14 | Information transfer | Y | Implemented | TLS required in prod; HMAC webhooks; hashed secrets |
| A.5.15 | Access control | Y | Partial | Product RBAC strong; infra access reviews missing |
| A.5.16 | Identity management | Y | Partial | Developer identities + Google SSO; console shared password |
| A.5.17 | Authentication information | Y | Partial | scrypt, hashed tokens; no MFA |
| A.5.18 | Access rights | Y | Partial | Membership roles; no periodic access review cadence |
| A.5.19 | Information security in supplier relationships | Y | Not implemented | Subprocessors listed; no assessments |
| A.5.20 | Addressing information security within supplier agreements | Y | Partial | Stripe/Google/Vercel/Supabase/HeyCatch contractual reliance undocumented in pack |
| A.5.21 | Managing information security in the ICT supply chain | Y | Not implemented | |
| A.5.22 | Monitoring, review and change management of supplier services | Y | Not implemented | |
| A.5.23 | Information security for use of cloud services | Y | Partial | Production checklist; no cloud security standard |
| A.5.24 | Information security incident management planning and preparation | Y | Not implemented | Status page ≠ IR plan |
| A.5.25 | Assessment and decision on information security events | Y | Not implemented | |
| A.5.26 | Response to information security incidents | Y | Not implemented | |
| A.5.27 | Learning from information security incidents | Y | Not implemented | |
| A.5.28 | Collection of evidence | Y | Partial | Verification logs exist; forensic playbook missing |
| A.5.29 | Information security during disruption | Y | Partial | Rate limits / fail-closed; no BCP |
| A.5.30 | ICT readiness for business continuity | Y | Not implemented | No RTO/RPO / restore drills |
| A.5.31 | Legal, statutory, regulatory and contractual requirements | Y | Partial | Privacy/compliance pages; claim drift weakens this |
| A.5.32 | Intellectual property rights | Y | Partial | License/ToS |
| A.5.33 | Protection of records | Y | Partial | Audit logs + plan retention windows |
| A.5.34 | Privacy and protection of PII | Y | Partial | GDPR/CCPA claims; erasure path exists |
| A.5.35 | Independent review of information security | Y | Partial | This internal audit; no external review yet |
| A.5.36 | Compliance with policies, rules and standards for information security | Y | Not implemented | No policy set to comply with |
| A.5.37 | Documented operating procedures | Y | Partial | `docs/PRODUCTION.md`, release notes in workflows |

---

## Annex A — People controls (A.6)

| ID | Control | Applicable | Implementation | Justification / notes |
|----|---------|------------|----------------|----------------------|
| A.6.1 | Screening | Y | Not implemented | HR process outside repo |
| A.6.2 | Terms and conditions of employment | Y | Not implemented | Outside repo |
| A.6.3 | Information security awareness, education and training | Y | Not implemented | Listed in progress on `/compliance` |
| A.6.4 | Disciplinary process | Y | Not implemented | Outside repo |
| A.6.5 | Responsibilities after termination or change of employment | Y | Not implemented | Outside repo |
| A.6.6 | Confidentiality or non-disclosure agreements | Y | Partial | Customer ToS/privacy; employee NDA outside repo |
| A.6.7 | Remote working | Y | Partial | Assumed remote; no remote-work security standard |
| A.6.8 | Information security event reporting | Y | Partial | `security@behalfid.com` published; no internal reporting SOP |

---

## Annex A — Physical controls (A.7)

| ID | Control | Applicable | Implementation | Justification / notes |
|----|---------|------------|----------------|----------------------|
| A.7.1–A.7.14 | Physical / environmental | Mostly N/A | N/A | No company data center; rely on Vercel/Supabase physical controls via supplier due diligence (to be evidenced) |

---

## Annex A — Technological controls (A.8)

| ID | Control | Applicable | Implementation | Justification / notes |
|----|---------|------------|----------------|----------------------|
| A.8.1 | User endpoint devices | Y | Not implemented | MDM/endpoint policy outside repo |
| A.8.2 | Privileged access rights | Y | Partial | Setup token + shared admin password |
| A.8.3 | Information access restriction | Y | Implemented | Account-scoped APIs + RBAC |
| A.8.4 | Access to source code | Y | Partial | GitHub repo ACLs not evidenced in-repo |
| A.8.5 | Secure authentication | Y | Partial | Strong crypto; no MFA; claim drift on sessions |
| A.8.6 | Capacity management | Y | Partial | Provider autoscaling; no capacity policy |
| A.8.7 | Protection against malware | Y | Partial | Rely on endpoints + CI; no formal malware control |
| A.8.8 | Management of technical vulnerabilities | Y | Partial | `npm audit` history; no Dependabot/CodeQL |
| A.8.9 | Configuration management | Y | Partial | `lib/env.ts` prod asserts; no IaC for app |
| A.8.10 | Information deletion | Y | Partial | Account deletion cascade now covers linked identities/passkeys on both backends (2026-08-12); log purge runs on Postgres; data export/portability still manual (G-25) |
| A.8.11 | Data masking | Y | Implemented | `lib/secretRedaction.ts` |
| A.8.12 | Data leakage prevention | Y | Partial | Redaction + CSP; no enterprise DLP |
| A.8.13 | Information backup | Y | Not implemented | Supabase backup capability unevidenced — see ops/BACKUP_RESTORE.md |
| A.8.14 | Redundancy of information processing facilities | Y | Partial | Vercel/Supabase HA assumptions |
| A.8.15 | Logging | Y | Partial | Strong verify logs; failed-auth missing |
| A.8.16 | Monitoring activities | Y | Not implemented | No APM/SIEM |
| A.8.17 | Clock synchronization | Y | Partial | Cloud provider NTP assumed |
| A.8.18 | Use of privileged utility programs | Y | Partial | Setup token routes constrained |
| A.8.19 | Installation of software on operational systems | Y | Partial | Vercel deploy; release workflow for CLI |
| A.8.20 | Networks security | Y | Partial | HTTPS, SSRF, egress proxy for agents |
| A.8.21 | Security of network services | Y | Partial | Provider + CSP/HSTS |
| A.8.22 | Segregation of networks | Y | Partial | Logical tenancy; no dedicated VPC design in-repo |
| A.8.23 | Web filtering | N/A | N/A | Not a corporate web proxy product control |
| A.8.24 | Use of cryptography | Y | Partial | TLS + hashing; no app-level field encryption; no key pepper |
| A.8.25 | Secure development life cycle | Y | Partial | CI tests; no formal SDLC policy |
| A.8.26 | Application security requirements | Y | Implemented | Validation, authn/z, Origin checks |
| A.8.27 | Secure system architecture and engineering principles | Y | Partial | Fail-closed verify design; prototype limitations documented |
| A.8.28 | Secure coding | Y | Partial | Reviews via PR/CI; no coding standard doc |
| A.8.29 | Security testing in development and acceptance | Y | Partial | Unit/security-focused tests in CI |
| A.8.30 | Outsourced development | Y | Partial | If contractors used — process not in-repo |
| A.8.31 | Separation of development, test and production environments | Y | Partial | Env vars / Vercel envs; evidence thin |
| A.8.32 | Change management | Y | Partial | Strong CI/CLI release; app deploy manual |
| A.8.33 | Test information | Y | Partial | Demo/fixtures; no formal test-data policy |
| A.8.34 | Protection of information systems during audit testing | Y | Partial | Read-only assessment this engagement |

---

## Summary counts (applicable controls)

| Implementation | Approx. count |
|----------------|---------------|
| Implemented | ~6 |
| Partial | ~45 |
| Not implemented | ~30 |
| Not applicable | Physical cluster + A.8.23 |

**SoA conclusion:** Technological controls for the SaaS application are the most mature. Organizational, people, supplier, incident, and continuity controls must be stood up before Stage 1 readiness.
