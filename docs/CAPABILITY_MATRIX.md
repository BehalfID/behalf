# BehalfID Capability Matrix

**Purpose:** Single source of truth for what exists in source, what is installable from a public registry, what has been live-validated, and what is production-supported.
**As of:** 2026-07-24 (branch tip based on Phase 1 `5de74ec`).
**Status vocabulary:**

| Status | Meaning |
|---|---|
| **Implemented in source** | Code exists in this repository and is exercised by unit/integration tests or documented local flows. |
| **Released and installable** | Published to a public install channel (npm, Homebrew formula, or equivalent) at a version operators can install without cloning the monorepo. |
| **Live-validated** | Exercised against a running BehalfID instance (or vendor SDK) under an opt-in live/pilot harness — not the same as production SLA evidence. |
| **Production-supported** | Documented as safe for production use with known boundaries; support expectations are stated. Absence of this status means pilot / experimental / gated / source-only. |

Do **not** invent live-client, pilot-completion, performance, uptime, or compliance evidence. Strong operational claims require a linked evidence source or must be narrowed to a target.

---

## Platform backends

| Capability | Implemented in source | Released and installable | Live-validated | Production-supported | Notes / evidence |
|---|---|---|---|---|---|
| MongoDB / Mongoose runtime | Yes (legacy/test) | N/A (hosted app) | Yes — `npm run test:integration`, Mongo contract suites | **No — retired for production cutover** | Available only when `BEHALFID_ALLOW_POSTGRES_RUNTIME` is unset. Not used for production traffic after cutover. |
| Postgres / Drizzle schema + migrations | Yes | N/A | Yes — CI `postgres-schema` job (`test:postgres-smoke`, `test:postgres-repositories`) | **Yes — authoritative production backend** | Requires `BEHALFID_ALLOW_POSTGRES_RUNTIME=true` (defaults repository backend to postgres). Prefer also setting `BEHALFID_REPOSITORY_BACKEND=postgres`. See `docs/PRODUCTION.md`, `docs/DATABASE_MIGRATION.md` |
| Repository boundary (Mongo + Postgres adapters) | Yes | N/A | Partial — Mongo contracts always; Postgres contracts opt-in/CI | Postgres path yes for production | `lib/repositories/*` |

---

## Identity, org, and access foundations

| Capability | Implemented in source | Released and installable | Live-validated | Production-supported | Notes / evidence |
|---|---|---|---|---|---|
| Developer accounts (email/password) | Yes | Hosted product | Integration coverage | Constrained / prototype multi-tenant posture | `docs/SECURITY.md` |
| Workspace accounts + memberships + roles | Yes | Hosted product | Integration / UI coverage | Constrained | `Account`, `AccountMembership`, `lib/authority.ts` — not “future work” |
| Sign in with Google + workspace Google SSO | Yes | Hosted product | Unit / route coverage | Constrained (Pro+ for workspace SSO) | Not SAML / arbitrary IdPs |
| Admin console shared password | Yes | Hosted product | Manual / route coverage | Yes for console ops | Single shared `BEHALFID_ADMIN_PASSWORD` |

---

## Verification and approval lifecycle

| Capability | Implemented in source | Released and installable | Live-validated | Production-supported | Notes / evidence |
|---|---|---|---|---|---|
| `POST /api/verify` decision API | Yes | Hosted API | Yes — live-verify suite (opt-in) | Yes where callers fail closed | Core product |
| Approval requests, approve/deny, grants | Yes | Hosted product | Dashboard / integration coverage | Yes for integrated callers | `ApprovalRequest`, dashboard inbox, webhooks `approval.requested` / granted / denied |
| Action Gateway (verify + execute supported actions) | Yes | Hosted API | Example / demo paths | Limited — supported action set only | Not a general HTTP proxy |
| Site Guard policy check API | Yes (MVP) | Hosted API + SDK helper | Unit / route coverage | MVP only where installed | Not a global crawler blocker; User-Agent spoofable |

---

## Coding-agent enforcement surfaces

| Capability | Implemented in source | Released and installable | Live-validated | Production-supported | Notes / evidence |
|---|---|---|---|---|---|
| `@behalfid/cli` | Yes | **Yes** — npm `@behalfid/cli` (e.g. 0.2.11) | Pilot docs / hook unit tests | Pilot / experimental for hooks | Primary install path for coding agents |
| Advisory MCP server (`verify_action`, `get_permissions`) | Yes (via CLI) | Via `@behalfid/cli` | Pilot observation only | **Advisory only — not enforcement** | Does not intercept other tools. See `docs/MCP_DEMO.md`, `docs/PILOT_*` |
| Claude Code `PreToolUse` hook | Yes | Via `@behalfid/cli` | Unit + built-CLI coverage; pilot rehearsal | Pilot — not universal fail-closed | **Outage semantics (verified in `packages/cli/src/commands/hook.ts`):** fail-**closed** on deny, approval-required, malformed input, missing mapped target, oversized policy context; fail-**open** on missing config and network/API/timeout verify errors |
| Cursor / Codex hook wiring | Yes (partial) | Via `@behalfid/cli` | Unit coverage | Pilot / experimental | Cursor beforeShellExecution fail-open on parse/config/network (see hook source) |
| Managed Profiles launch shim | Yes | Via CLI + dashboard | Pilot rehearsal | Pilot — not outage fail-closed boundary | Required mode is not a universal outage guarantee |
| `@behalfid/mcp-runtime` (MCP tool interceptor PEP) | Yes | **No** — not on npm (404 as of 2026-07-24) | Unit tests in repo | **No** | Source-only until published. Do not present `npm install @behalfid/mcp-runtime` as immediately installable |
| `@behalfid/install` | Yes | **No** — not on npm | Package tests | **No** | Source-only until published |
| `@behalfid/mcp-audit` | Yes | **No** — not on npm | Package tests | **No** — static audit, not runtime enforcement | Advisory analysis |

---

## SDK and compatibility adapters

| Capability | Implemented in source | Released and installable | Live-validated | Production-supported | Notes / evidence |
|---|---|---|---|---|---|
| `@behalfid/sdk` core client | Yes | **Yes** — npm `@behalfid/sdk` | Live-verify / SDK export tests | Yes for Node callers that fail closed | |
| OpenAI / Anthropic / LangChain / LlamaIndex / Stripe / Ollama adapters | Yes | Via `@behalfid/sdk` subpaths (where exported) | Partial — opt-in live adapter suite | **No** — experimental unofficial adapters | See `docs/COMPATIBILITY_MATRIX.md` |
| Ollama runtime convenience (per-agent URL/model, test + chat proxy) | Yes | Dashboard APIs | Unit tests for client helpers | **No** — developer convenience only, not enforcement | `lib/ollamaClient.ts`, `docs/OLLAMA.md` Track B |
| Vercel adapter | Yes (example) | **Not** an SDK subpath export | Unit only | **No** | Deployment example |

---

## Compliance, SLAs, and marketing performance claims

| Claim | Status | Evidence |
|---|---|---|
| Universal fail-closed enforcement | **Not claimed as universal** | Enforcement is integration-bound. Claude PreToolUse and some Managed Profiles outage paths fail open. Prefer “fail closed where you integrate, with documented outage exceptions.” |
| &lt;2ms p99 latency | **No evidence in repo** — do not claim | No published latency study or dashboard linked here. |
| 99.99% uptime SLA | **No evidence / no SLA** — do not claim | Status page reports component state; no contractual uptime SLA. Design-partners copy correctly disclaims enterprise SLAs. |
| Framework / integration count as partnerships | **Do not over-count** | Unofficial adapters ≠ vendor partnerships. Matrix in `docs/COMPATIBILITY_MATRIX.md`. |
| SOC 2 Type II | **Not certified** | `/compliance` documents controls in progress; target audit, not completed certification. |
| Production support / white-glove | **Not enterprise-supported by default** | Prototype / constrained deployment posture in `docs/SECURITY.md`; design partners disclaim white-glove. |

---

## How to read this matrix next to other docs

- **Security / trust:** `docs/SECURITY.md`, `/security`
- **Enforcement design (incl. hard-enforcement proposal):** `docs/ENFORCEMENT_ARCHITECTURE.md`
- **Adapter detail:** `docs/COMPATIBILITY_MATRIX.md`
- **Postgres migration:** `docs/DATABASE_MIGRATION.md`, `docs/POSTGRES_SCHEMA.md`
- **Pilot honesty:** `docs/PILOT_REHEARSAL.md`, `docs/PILOT_TESTER_GUIDE.md`
- **CLI / MCP quickstart (public):** `/docs/cli`, `docs/MCP_DEMO.md`
