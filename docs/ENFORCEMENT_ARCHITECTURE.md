# BehalfID Hard-Enforcement Architecture

**Document type:** Internal architecture + product design  
**Status:** Proposal — pre-implementation  
**Author role:** Enforcement Architecture Lead  
**Date:** 2026-05-25

---

## Executive Summary

BehalfID's current model relies on agents voluntarily calling `/api/verify` before executing
actions. The API returns `{ allowed: true | false }` and the agent decides whether to proceed.
This is advisory enforcement. No structural guarantee prevents an agent from skipping the call
entirely or ignoring a `denied` response.

This document answers: **what does BehalfID become if enforcement is real instead of voluntary?**

The short answer: BehalfID becomes the execution boundary, not the advisory layer. For
enforcement to be real, high-risk actions must pass through infrastructure BehalfID controls —
either as execution proxies, single-use authorization tokens validated by services, or
interception points that cannot be bypassed without architectural compromise.

---

## Part 1 — What Is Actually Enforceable

Before designing, we must be honest about what enforcement means in practice.

### Hard enforcement requires control of the execution path

| Enforcement tier | BehalfID controls | Bypass difficulty |
|---|---|---|
| **Tier 0 — Advisory** (current) | Nothing. Returns allow/deny. | Trivial. Agent ignores the response. |
| **Tier 1 — Execution proxy** | The HTTP request itself | Hard. Agent must route through BehalfID. |
| **Tier 2 — Execution token** | Authorization at the downstream service | Medium. Requires service to validate token. |
| **Tier 3 — MCP interceptor** | Tool call dispatch in the agent runtime | Medium. Agent controls MCP config; can be reconfigured. |
| **Tier 4 — Cooperative gateway** | API surface of enrolled services | Hard if service enforces it; trivial if not enrolled. |

**There is no Tier 5 for local code execution, LLM reasoning, or services that do not
integrate BehalfID.** No software architecture can prevent an agent process with the right OS
permissions from running arbitrary commands. We do not claim otherwise.

### Honest capability table

| Action type | Hard enforcement possible? | Mechanism |
|---|---|---|
| Outbound HTTP requests | Yes | Execution proxy (Tier 1) |
| Web browsing / read | Yes (already implemented) | Action Gateway |
| Purchase / payment API calls | Yes, with service cooperation | Execution token (Tier 2) |
| Deploy (Vercel, AWS, etc.) | Yes, with service cooperation | Execution token (Tier 2) |
| Production database mutations | Yes, with connector | Execution proxy (Tier 1) |
| File I/O on agent's machine | No | Out of BehalfID's trust boundary |
| Local `exec` / shell commands | No | Out of BehalfID's trust boundary |
| LLM reasoning / tool selection | No | Not an execution boundary |
| Third-party API (no integration) | No — advisory only | Soft enforcement |
| MCP tool calls | Yes, with interceptor | MCP proxy (Tier 3) |

---

## Part 2 — Revised System Architecture

### 2.1 Core Principle

> A high-risk action must cross a BehalfID-controlled boundary before it executes.
> The action does not execute anywhere else.

This flips the current design. Today: agent acts, then optionally reports. New design: agent
requests, BehalfID authorizes and executes, agent receives the result.

### 2.2 Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         TRUST BOUNDARY                          │
│                                                                 │
│  Agent Process                                                  │
│  ┌───────────────┐   ┌──────────────────────────────────────┐  │
│  │   Agent LLM   │──▶│  BehalfID SDK / MCP interceptor      │  │
│  │               │   │  (bhf_sk_ key identifies agent)      │  │
│  └───────────────┘   └──────────────┬───────────────────────┘  │
│                                     │ HTTPS                     │
└─────────────────────────────────────┼───────────────────────────┘
                                      │
                         ╔════════════▼════════════╗
                         ║   BehalfID Platform     ║  ← ENFORCEMENT BOUNDARY
                         ║                         ║
                         ║  ┌─────────────────┐   ║
                         ║  │  Auth Layer     │   ║
                         ║  │  (verify bhf_sk)│   ║
                         ║  └────────┬────────┘   ║
                         ║           │             ║
                         ║  ┌────────▼────────┐   ║
                         ║  │  Policy Engine  │   ║
                         ║  │  (permissions,  │   ║
                         ║  │   constraints,  │   ║
                         ║  │   approval gate)│   ║
                         ║  └────────┬────────┘   ║
                         ║           │             ║
                         ║  ┌────────▼────────┐   ║
                         ║  │ Execution Layer │   ║
                         ║  │ OR Token Issuer │   ║
                         ║  └────────┬────────┘   ║
                         ║           │             ║
                         ║  ┌────────▼────────┐   ║
                         ║  │  Audit Log      │   ║
                         ║  │  (append-only)  │   ║
                         ║  └─────────────────┘   ║
                         ╚════════════╤════════════╝
                                      │
                     ┌────────────────┼────────────────┐
                     │                │                 │
              ┌──────▼──────┐ ┌───────▼──────┐ ┌───────▼──────┐
              │  Execution  │ │  Exec Token  │ │  Approval    │
              │  Proxy      │ │  Validation  │ │  Queue       │
              │  (HTTP out) │ │  by Services │ │  (human/bot) │
              └─────────────┘ └──────────────┘ └──────────────┘
```

### 2.3 Three Enforcement Paths

**Path A: Execution Proxy** — BehalfID executes the action directly

```
Agent → POST /api/gateway/execute { action, params }
      ← BehalfID performs action, returns result
```

Suitable for: HTTP requests, web browsing, API calls to enrolled connectors,
database reads/writes via configured credentials.

**Path B: Execution Token** — BehalfID issues a single-use token, downstream validates

```
Agent    → POST /api/auth/execution-token { action, params }
         ← { token: "bhf_exec_...", expires_at, requestId }

Agent    → POST https://service.com/api/deploy
           Authorization: Bearer bhf_exec_...

Service  → GET /api/exec-tokens/validate?token=bhf_exec_...
         ← { valid: true, action, params, agentId }

Service  → executes action
         → POST /api/exec-tokens/consume { token, outcome }

BehalfID → logs execution with outcome
```

Suitable for: deploy approvals, purchase flows, privileged infrastructure,
any service that can make an outbound validation call.

**Path C: MCP Interceptor** — BehalfID wraps tool dispatch in the agent runtime

```
Agent runtime → calls tool via BehalfID MCP wrapper
              → wrapper checks permission before invoking real tool
              → if denied, throws structured error; tool never called
              → if approved, invokes real tool, logs call
```

Suitable for: MCP-native agents (Claude Code, etc.) where the MCP server is
BehalfID-controlled infrastructure.

---

## Part 3 — Trust Model

### 3.1 Trust Boundary Map

```
UNTRUSTED                    CONDITIONALLY TRUSTED           TRUSTED
─────────                    ─────────────────────           ───────
Agent LLM reasoning          Agent process (has bhf_sk_)     BehalfID servers
Agent code not using SDK     Agent using SDK correctly        BehalfID DB
Third-party services         Services validating exec tokens  BehalfID audit log
User input to agent          MCP interceptor host             Policy evaluation engine
```

### 3.2 What BehalfID Can Assert

After a successful Tier 1 execution:
- ✅ This agent key was authenticated at time T
- ✅ The action matched an active permission with these constraints
- ✅ The execution was performed by BehalfID infrastructure, not the agent
- ✅ The exact parameters are logged
- ✅ The response is logged

After a successful Tier 2 execution token:
- ✅ This agent was verified at token issuance time
- ✅ The token was consumed exactly once (single-use)
- ✅ The service declared the outcome via callback
- ⚠️ We cannot verify the service actually enforced the token (trust service)

### 3.3 What BehalfID Cannot Assert

- ❌ The agent did not perform other actions outside BehalfID
- ❌ The agent's LLM reasoning was correct
- ❌ The agent's environment was not compromised
- ❌ Actions taken by services after token validation

These limitations must be documented clearly. Claiming them would be false.

---

## Part 4 — Threat Model

### 4.1 Attack Surfaces

| Surface | Threat | Mitigation |
|---|---|---|
| `bhf_sk_` key compromise | Attacker impersonates agent, authorizes actions | Key rotation, IP allowlist option, short-lived keys |
| Replay attack on execution token | Reuse consumed token | Single-use: token marked consumed on first validation |
| Token forging | Fake `bhf_exec_` token presented to service | HMAC-SHA256 signed with server secret; service validates with BehalfID |
| SSRF via execution proxy | Agent requests internal BehalfID infrastructure | DNS pre-validation, IP blocklist (already in Action Gateway) |
| Permission manipulation | Attacker modifies permissions via developer API | Developer auth required; agent key cannot modify its own permissions |
| Log tampering | Attacker removes evidence of action | Append-only log model; no DELETE on VerificationLog |
| Agent key brute force | Iterating `bhf_sk_` space | 128-bit entropy keys, rate limiting, lockout |
| Timing oracle on key comparison | Derive key from response time | `crypto.timingSafeEqual` (already implemented) |
| Approval bypass | Skip `requiresApproval` gate | Token only issued after explicit approval event in DB |
| MCP config reconfiguration | Agent routes around interceptor | Interceptor is the only registered MCP server for high-risk tools |
| Execution token clock skew | Token expired on BehalfID but service clock disagrees | 60-second grace window; reject tokens >5 min old regardless |

### 4.2 Scenarios We Do Not Defend Against

- Agent running in an environment BehalfID does not control
- Agent with direct database or API credentials that bypass BehalfID entirely
- Developer account compromise (that's an identity/auth problem, not enforcement)
- Service-side enforcement failure (service validates token but executes wrong action)

---

## Part 5 — Enforcement Primitives

### 5.1 Execution Token Format

```
bhf_exec_{base64url(HMAC-SHA256(secret, payload))}

payload = {
  version: 1,
  requestId: "req_xxx",
  agentId: "agt_xxx",
  action: "deploy.production",
  resource: "project:my-app",
  amount: null,
  issuedAt: 1748000000,
  expiresAt: 1748000300,   // 5-minute window
  nonce: "<32-byte random>",
  permissionId: "perm_xxx"
}
```

Properties:
- **Single-use**: Redis SET NX on nonce; second validation fails immediately
- **Short-lived**: 5-minute default TTL, configurable per permission
- **Tamper-evident**: HMAC-signed with a server-side secret; services verify with BehalfID
- **Scoped**: Token is bound to exact action + resource + agent; cannot be reused for different action
- **Auditable**: requestId ties token to the verification log entry

### 5.2 Execution Proxy Request Shape

```typescript
POST /api/gateway/execute
Authorization: Bearer bhf_sk_...

{
  action: "http_request",
  resource: "https://api.stripe.com",
  input: {
    method: "POST",
    path: "/v1/payment_intents",
    headers: { "Content-Type": "application/json" },
    body: { amount: 5000, currency: "usd" }
  }
}
```

Response:
```typescript
{
  requestId: "req_xxx",
  allowed: true,
  executed: true,
  result: { status: 200, body: { ... } }
}
```

### 5.3 Approval Gate

When a permission has `requiresApproval: true`:

1. Agent calls gateway → policy engine sees `requiresApproval`
2. BehalfID creates an `ApprovalRequest` record (pending)
3. Returns `{ allowed: false, requiresApproval: true, approvalId: "apr_xxx" }`
4. Webhook fires `approval.requested` to developer
5. Human/system approves via dashboard or API → `ApprovalRequest.status = "approved"`
6. Agent polls `GET /api/approvals/{approvalId}` or receives webhook
7. Once approved, BehalfID issues execution token or executes directly

Approval requests expire. Expired approval = denied. No second chance without new request.

### 5.4 Execution Receipt

After every execution, BehalfID emits an `ExecutionReceipt`:

```typescript
{
  receiptId: "rcpt_xxx",
  requestId: "req_xxx",
  agentId: "agt_xxx",
  action: "deploy.production",
  resource: "project:my-app",
  executedAt: "2026-05-25T10:00:00Z",
  outcome: "success" | "failure" | "timeout",
  permissionId: "perm_xxx",
  signature: "<HMAC of receipt fields>"  // verifiable by developer
}
```

Receipts are:
- Stored append-only in the audit log
- Delivered as a webhook event (`execution.completed`)
- Verifiable by the developer without trusting BehalfID's UI

---

## Part 6 — How Execution Flows (Sequence Diagrams)

### 6.1 Execution Proxy Flow (Tier 1)

```
Agent                BehalfID Platform              Target Service
  │                        │                              │
  │─── POST /api/gateway ──▶                              │
  │    { action, resource, input }                        │
  │                        │                              │
  │            auth agent key (bhf_sk_)                   │
  │            evaluate permissions                       │
  │            check constraints (amount, vendor, expiry) │
  │            check approval gate                        │
  │            write log (pending)                        │
  │                        │                              │
  │                        │── HTTP request (pinned IP) ──▶
  │                        │                              │
  │                        │◀── response ─────────────────│
  │                        │                              │
  │            update log (executed, outcome)             │
  │            emit webhook (execution.completed)         │
  │                        │                              │
  │◀── { requestId, result } ──────────────────────────── │
  │                        │                              │
```

### 6.2 Execution Token Flow (Tier 2)

```
Agent           BehalfID Platform           Downstream Service
  │                    │                          │
  │─ POST /api/auth/execution-token ──▶           │
  │  { action, resource, params }                 │
  │                    │                          │
  │      auth + policy evaluation                 │
  │      check approval gate (if required)        │
  │      issue bhf_exec_... token (HMAC signed)  │
  │      store token in Redis (TTL 5m)            │
  │                    │                          │
  │◀─ { token: "bhf_exec_...", expiresAt } ───────│
  │                    │                          │
  │── request + "Authorization: Bearer bhf_exec_" ─▶
  │                    │                          │
  │                    │◀─ POST /api/exec-tokens/validate?token=... ─│
  │                    │                          │
  │     verify HMAC signature                     │
  │     check token not consumed (Redis NX)       │
  │     mark consumed                             │
  │     return { valid, action, agentId, params } │
  │                    │                          │
  │                    │── { valid: true, ... } ──▶
  │                    │                          │
  │                    │     service executes      │
  │                    │                          │
  │                    │◀─ POST /api/exec-tokens/consume ─│
  │                    │   { token, outcome }      │
  │                    │                          │
  │     log execution receipt                     │
  │     emit webhook (execution.completed)        │
  │                    │                          │
  │◀─ response from service ──────────────────────│
```

### 6.3 MCP Interceptor Flow (Tier 3)

```
Agent Runtime       BehalfID MCP Server        Real Tool
  │                        │                      │
  │── tool call request ──▶│                      │
  │   { tool: "deploy",    │                      │
  │     params: {...} }    │                      │
  │                        │                      │
  │             verify agent (bhf_sk_ from env)   │
  │             POST /api/verify { action, params }│
  │                        │                      │
  │   [if denied] ◀─ structured error ────────────│
  │                        │                      │
  │   [if allowed]         │─── invoke real tool ─▶
  │                        │                      │
  │                        │◀── result ────────────│
  │                        │                      │
  │               log execution                   │
  │◀── tool result ────────│                      │
  │                        │                      │
```

---

## Part 7 — Policy Evaluation Engine

### 7.1 Evaluation Order

```
1. Is the agent key valid and active?            → deny if not
2. Is the agent disabled?                        → deny if so
3. Does a matching permission exist?             → deny if not
4. Is the permission active and not expired?     → deny if not
5. Is the action explicitly blocked?             → deny if so
6. Does the resource/vendor match?               → deny if not
7. Does the amount satisfy constraints?          → deny if exceeds maxAmount
8. Is vendor in allowedVendors?                  → deny if not
9. Does the permission require approval?         → hold for approval if so
10. Quota check (plan limits)                    → deny if exceeded
11. Rate limit check                             → limit if exceeded
12. ALLOW — issue token or execute
```

No exceptions. No fallback-to-allow on error. Fail closed.

### 7.2 Constraint Schema (revised)

```typescript
type PermissionConstraints = {
  maxAmount?: number;          // max spend per action call
  allowedVendors?: string[];   // vendor allowlist
  allowedPaths?: string[];     // URL path allowlist for proxy
  blockedPaths?: string[];     // URL path blocklist for proxy
  allowedMethods?: string[];   // HTTP methods: ["GET"] or ["POST", "PUT"]
  expiresAt?: Date;            // hard expiry
  maxUsesPerDay?: number;      // rolling 24h window
  maxUsesTotal?: number;       // lifetime cap
  requireApprovalAbove?: number; // auto-require approval when amount > threshold
  ipAllowlist?: string[];      // agent IP allowlist (proxy mode only)
};
```

### 7.3 Replay Prevention

Every execution token carries a `nonce` (32 random bytes). On validation:

```
SET behalf:nonce:{nonce} "consumed" EX 600 NX
```

If Redis returns `0` (key already exists): token already consumed. Reject.

For the execution proxy path, `requestId` is checked for duplicate submissions:

```
SET behalf:req:{requestId} "in-flight" EX 30 NX
```

---

## Part 8 — Minimum Viable Hard Enforcement

This is the smallest implementation that creates a real enforcement boundary.

### 8.1 MVP Scope

**One new primitive**: Generalized HTTP Execution Proxy

Extend the existing Action Gateway (which already enforces `browse_web`) to support
**arbitrary outbound HTTP requests** to configured allowed endpoints.

This is the smallest wedge because:
- Infrastructure already exists in `lib/actionGateway.ts`
- The `POST /api/actions/execute` route already does verify-then-execute
- The DNS pre-validation and SSRF mitigations are implemented
- It works for 80% of agent actions (API calls)

### 8.2 MVP Implementation Plan

**Step 1**: Generalize Action Gateway (1 week)

```typescript
// POST /api/gateway/execute
{
  action: "http_request",
  resource: "https://api.stripe.com",   // must match permission resource
  input: {
    method: "POST",
    path: "/v1/payment_intents",
    headers: { ... },  // filtered: no Authorization override
    body: { ... }
  }
}
```

Policy: permission with `action: "http_request"` and `resource: "api.stripe.com"` must exist.

**Step 2**: Add `maxAmount` enforcement at request time (not just check-time)

When gateway sees a financial action, extract amount from request body if it matches a
known pattern (Stripe amount field, etc.) and validate against `constraints.maxAmount`
before executing.

**Step 3**: Single-use execution tokens for non-proxied actions (2 weeks)

```typescript
// New route: POST /api/auth/execution-token
// New route: GET  /api/exec-tokens/validate
// New model: ExecutionToken (redis-backed, TTL 5m)
```

**Step 4**: Approval gate materialization (1 week)

```typescript
// New model: ApprovalRequest
// New route: POST /api/approvals/{id}/approve
// New route: POST /api/approvals/{id}/deny
// New webhook event: approval.requested
// Dashboard: approval queue view
```

**Step 5**: Execution receipts (1 week)

```typescript
// Extend VerificationLog with: executed: boolean, outcome, executedAt
// New webhook event: execution.completed
// Receipt HMAC signature for developer verification
```

### 8.3 What MVP Does NOT Include

- MCP interceptor (Tier 3)
- Service-side SDK for execution token validation
- Connector marketplace (pre-configured API credentials)
- Local execution sandbox

These are follow-on. The MVP is the HTTP proxy + execution token.

### 8.4 Integration Path for Developers

```typescript
// Before (advisory):
const decision = await behalf.verify({ agentId, action: "purchase", amount: 50 });
if (!decision.allowed) throw new Error("Not allowed");
await stripe.createPaymentIntent({ amount: 5000 });  // NOT enforced

// After (enforced, proxy path):
const result = await behalf.gateway.execute({
  action: "http_request",
  resource: "https://api.stripe.com",
  input: {
    method: "POST",
    path: "/v1/payment_intents",
    body: { amount: 5000, currency: "usd" }
  }
});
// Stripe was called by BehalfID, not the agent directly

// After (enforced, token path):
const { token } = await behalf.gateway.authorize({
  action: "deploy.production",
  resource: "project:my-app"
});
await vercelClient.deploy({ project: "my-app", authToken: token });
// Vercel validates token with BehalfID before executing deploy
```

---

## Part 9 — Implementation Roadmap

> Tracked in [#130](https://github.com/BehalfID/behalf/issues/130): none of the checklist items below are implemented yet.

### Phase 1 — Execution Proxy (Weeks 1–3)

- [ ] Generalize Action Gateway to `http_request` action type
- [ ] Hostname/path allowlist enforcement from permission constraints
- [ ] Amount extraction for financial requests (Stripe, etc.)
- [ ] Extend VerificationLog with `executed`, `outcome`, `executedAt`
- [ ] Dashboard: show execution status alongside verification status

### Phase 2 — Execution Tokens (Weeks 4–6)

- [ ] `ExecutionToken` model (Redis-backed, TTL-based)
- [ ] `POST /api/auth/execution-token` — issue token after policy check
- [ ] `GET /api/exec-tokens/validate` — service-side validation endpoint
- [ ] `POST /api/exec-tokens/consume` — outcome reporting
- [ ] HMAC signing with `BEHALFID_TOKEN_SECRET`
- [ ] Nonce replay prevention

### Phase 3 — Approval Gate (Weeks 7–8)

- [ ] `ApprovalRequest` model
- [ ] Approval queue in dashboard
- [ ] Webhook events: `approval.requested`, `approval.granted`, `approval.denied`
- [ ] `requireApprovalAbove` constraint (auto-escalate high-value actions)
- [ ] Approval expiry (unapproved requests auto-expire)

### Phase 4 — MCP Interceptor (Weeks 9–11)

- [ ] Extend existing CLI MCP server to wrap arbitrary tool definitions
- [ ] Tool call interception: verify before dispatch
- [ ] Per-tool permission mapping (tool name → action)
- [ ] Structured denial errors that MCP clients understand

### Phase 5 — Service SDK (Weeks 12–14)

- [ ] Server-side SDK for execution token validation
- [ ] Vercel integration guide
- [ ] AWS Lambda integration guide
- [ ] Stripe webhook integration guide
- [ ] Express/Fastify middleware package

---

## Part 10 — Revised Product Positioning

### What BehalfID Is (Revised)

**BehalfID is the execution boundary for AI agents.**

Not: "a permission API that agents should check"  
But: "the only path through which high-risk actions execute"

### The Three Layers

| Layer | Product name | What it does |
|---|---|---|
| Identity | **Agent Passport** | Agents carry a signed credential describing their authorized scope |
| Policy | **Permission Engine** | Rules defining what agents can do, with what constraints |
| Enforcement | **Action Gateway** | The execution proxy. Actions happen here, not in the agent. |

### Key Claims (All Defensible)

1. **"Your agent cannot purchase above $500 without crossing BehalfID."**
   True when: purchase API call routes through the execution proxy.

2. **"Every deploy your agent triggers has a signed, auditable receipt."**
   True when: deploys use execution tokens validated by Vercel/AWS integration.

3. **"Your agent's production database calls go through a policy check you control."**
   True when: DB connector is configured in BehalfID; agent uses the proxy endpoint.

4. **"You can pause all agent actions instantly."**
   True: disabling the agent denies all future verification and proxy calls immediately.

### Claims NOT to Make

- ❌ "BehalfID prevents all unauthorized AI actions" (only enforces enrolled actions)
- ❌ "Cryptographically guaranteed compliance" (crypto proves token integrity, not intent)
- ❌ "AI-safe by design" (not a meaningful claim)
- ❌ "Enforces actions taken without BehalfID" (cannot)

---

## Part 11 — Honest Limitations of the Revised Architecture

1. **Opt-in enforcement**: Developers must route actions through BehalfID. An agent with a
   Stripe secret key can still call Stripe directly. BehalfID can only enforce what it controls.

2. **Proxy coverage gap**: The execution proxy covers HTTP-based actions. Actions that are not
   HTTP calls (local file system, subprocess execution, in-process operations) cannot be
   intercepted without a different runtime boundary (container sandbox, etc.).

3. **Token trust delegation**: Execution tokens shift trust to the validating service. If
   a service validates but ignores the constraints, BehalfID cannot detect this. The audit
   log records the token validation; it cannot record what the service did afterward.

4. **MCP reconfiguration**: The MCP interceptor requires the agent runtime to use
   BehalfID's MCP server. An agent that reconfigures its MCP servers to bypass BehalfID
   bypasses enforcement. This is mitigated by organizational controls, not technical ones.

5. **Key compromise**: A stolen `bhf_sk_` key allows an attacker to call the execution
   proxy or obtain execution tokens. Key rotation, IP allowlisting, and short-lived keys
   reduce but do not eliminate this risk.

6. **Dependency on BehalfID availability**: If BehalfID is down, the execution proxy fails
   closed (denies all actions). This is correct for security but creates an operational
   dependency. Uptime SLAs and circuit breaker documentation are required.

---

## Appendix A — New Models Required

### ExecutionToken (Redis)

```typescript
key:   `behalf:exec:${nonce}`
value: JSON.stringify({
  version: 1,
  requestId: string,
  agentId: string,
  permissionId: string,
  action: string,
  resource: string | null,
  amount: number | null,
  issuedAt: number,
  expiresAt: number,
  consumed: boolean,
  consumedAt: number | null,
  outcome: "success" | "failure" | "timeout" | null
})
TTL: 300s (5 minutes)
```

### ApprovalRequest (MongoDB)

```typescript
{
  approvalId: string;         // apr_xxx
  requestId: string;          // links to VerificationLog
  accountId: string;
  developerUserId: string;
  agentId: string;
  permissionId: string | null;
  action: string;
  resource: string | null;
  amount: number | null;
  status: "pending" | "approved" | "denied" | "expired";
  expiresAt: Date;            // default: 24h from creation
  approvedBy: string | null;  // developer user ID
  approvedAt: Date | null;
  deniedAt: Date | null;
  createdAt: Date;
}
```

### ExecutionLog extension to VerificationLog

```typescript
// Add to existing VerificationLog schema:
{
  executed: boolean;          // was the action actually executed?
  executedAt: Date | null;
  executionOutcome: "success" | "failure" | "timeout" | null;
  executionDurationMs: number | null;
  tokenId: string | null;     // if execution token was used
}
```

---

## Appendix B — New Routes Required

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/gateway/execute` | Generalized execution proxy |
| POST | `/api/auth/execution-token` | Issue single-use execution token |
| GET | `/api/exec-tokens/validate` | Service-side token validation |
| POST | `/api/exec-tokens/consume` | Report execution outcome |
| GET | `/api/approvals/:id` | Poll approval status |
| POST | `/api/approvals/:id/approve` | Grant approval (dashboard auth) |
| POST | `/api/approvals/:id/deny` | Deny approval (dashboard auth) |
| GET | `/api/dashboard/approvals` | List pending approvals |
| GET | `/api/dashboard/receipts` | List execution receipts |

---

## Appendix C — Environment Variables Required

```bash
# Token signing (required for execution tokens)
BEHALFID_TOKEN_SECRET=<32-byte random, base64>

# Execution proxy allowed hostname patterns (comma-separated glob)
BEHALFID_PROXY_ALLOWED_HOSTS=*.stripe.com,api.github.com,api.vercel.com

# Approval gate defaults
BEHALFID_DEFAULT_APPROVAL_TTL_HOURS=24

# Execution proxy timeout
BEHALFID_PROXY_TIMEOUT_MS=10000

# Execution token TTL
BEHALFID_EXEC_TOKEN_TTL_SECONDS=300
```

---

*This document describes a proposed architecture, not current production behavior.*  
*Current production behavior is described in SECURITY.md.*
