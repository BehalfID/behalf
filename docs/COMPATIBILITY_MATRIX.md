# Adapter Compatibility Matrix

Status as of 2026-05-28. All adapters are EXPERIMENTAL — not official vendor integrations. (Tracked in [#131](https://github.com/BehalfID/behalf/issues/131).)

## Summary

| Adapter | Status | Unit tests | Allowed-path live | Denied-path live | Runtime verified | npm-publishable | Production-ready? |
|---|---|---|---|---|---|---|---|
| OpenAI | Experimental | ✅ | ✅ opt-in (seeded) | ✅ opt-in | BehalfID only | Not yet | No |
| Anthropic / Claude | Experimental | ✅ | ✅ opt-in (seeded) | ✅ opt-in | BehalfID only | Not yet | No |
| LangChain | Experimental | ✅ | ✅ opt-in (seeded) | ✅ opt-in | BehalfID only | Not yet | No |
| LlamaIndex | Experimental | ✅ | No | No | No | Not yet | No |
| Vercel | Deployment example | ✅ (unit) | No | No | No | Not yet | No |
| Stripe | Permission example | ✅ | No (no seeded perm) | ✅ opt-in | BehalfID only | Not yet | No |

"Runtime verified" means tested against a live instance of the actual SDK/framework (not just mocks).
"BehalfID only" means the BehalfID verify path has been live-tested; vendor SDK execution paths use mocks.
"seeded" means `npm run seed:live-test` must be run first to create the required test permission.

---

## Running live tests

Live tests call a real BehalfID instance. They are **opt-in** and will not run as part of `npm test`.

### Prerequisites

Add these to your environment (or to `~/behalf/.env`):

```
BEHALFID_BASE_URL=http://localhost:3000   # or https://your-instance.example.com
BEHALFID_API_KEY=bhf_sk_...
BEHALFID_AGENT_ID=agent_...
```

Optional vendor keys (tests skip cleanly if absent):

```
OPENAI_API_KEY=sk-...          # enables OpenAI SDK smoke test
ANTHROPIC_API_KEY=sk-ant-...   # enables Anthropic SDK smoke test
STRIPE_SECRET_KEY=sk_test_...  # enables Stripe gating smoke test
```

### Seeding the allowed-path permission

Allowed-path live tests require a permission seeded on the test agent. Run this first:

```bash
npm run seed:live-test
```

This creates (or confirms) the permission:
- `action: "send"`, `resource: "communication.email"`
- Expires in 1 hour (auto-cleanup)
- Safe to rerun — idempotent if the permission already exists

If seeding fails (e.g., the API is not running), allowed-path tests skip with a message explaining which permission to create manually through the dashboard.

### Run commands

```bash
# Full live test sequence from scratch
npm run dev                          # start local BehalfID instance
npm run seed:live-test               # create the allowed-path permission
RUN_LIVE_TESTS=true npm run test:live # run all live tests
npm test                             # confirm unit tests still pass
npm run build:sdk                    # confirm SDK build is clean

# Run only the verify endpoint tests
RUN_LIVE_TESTS=true npx vitest run test/integration/live-verify.test.ts

# Run only the adapter gate tests
RUN_LIVE_TESTS=true npx vitest run test/integration/live-adapters.test.ts

# Run both live test files together
RUN_LIVE_TESTS=true npm test -- test/integration/live-verify.test.ts test/integration/live-adapters.test.ts
```

### What live tests validate

| Test file | What it checks |
|---|---|
| `test/integration/live-verify.test.ts` | Raw `/api/verify` HTTP responses; deny for `purchase/commerce.checkout/999999`; structured response shape; 401 on invalid key |
| `test/integration/live-adapters.test.ts` | Each adapter's BehalfID verify path against a real instance; `execute` is never called on deny; timeoutMs=1 still fails closed; vendor SDK smoke tests (if keys present) |

### Warning

These are **compatibility adapters, not official partnerships**. No adapter in this repo is co-developed, certified, or listed in any vendor's marketplace. See the table above and the per-adapter notes below for exactly what has and has not been validated.

---

---

## Per-adapter details

### OpenAI

| Property | Value |
|---|---|
| Adapter file | `integrations/openai/index.ts` |
| Official status | Unofficial compatibility adapter |
| SDK dependency | None (duck-typed tool call shape) |
| Tested SDK versions | None — unit tests only, no real openai SDK installed |
| Supported environments | Node.js 18+, Edge (no Node-specific APIs used) |
| Functions | `checkToolCall`, `checkWebBrowse`, `checkPurchase` |
| Fail-closed | Yes — verify errors return DenyResponse |
| Known limitations | Does not handle streaming tool calls; arguments must be pre-parsed |
| Before claiming production-ready | Run against real `openai` SDK responses; test with streaming; publish to npm |

### Anthropic / Claude

| Property | Value |
|---|---|
| Adapter file | `integrations/anthropic/index.ts` |
| Official status | Unofficial compatibility adapter |
| SDK dependency | None (duck-typed ToolUseBlock shape) |
| Tested SDK versions | None — unit tests only, no real `@anthropic-ai/sdk` installed |
| Supported environments | Node.js 18+, Edge |
| Functions | `checkToolUse`, `buildDeniedToolResult` |
| Fail-closed | Yes — verify errors return DenyResponse with `tool_use_id` echoed |
| Known limitations | Only handles `tool_use` blocks; does not intercept text or image content |
| Before claiming production-ready | Run against real Claude API responses; test multi-turn tool loops; validate `tool_result` formatting matches current API spec |

### Claude Code PreToolUse hook (CLI)

| Property | Value |
|---|---|
| Entry point | `behalf hook pre-tool-use` (installed into `~/.claude/settings.json`) |
| Official status | Pilot / experimental enforcement path |
| Mapped tools | Write, Edit, MultiEdit, NotebookEdit → `write_file`; Read → `read_file`; Bash, PowerShell, Monitor(with `command`) → `execute_command`; Agent, Task → `spawn_agent`; WebFetch, WebSearch → `browse_web`; `mcp__*` → `mcp_tool` |
| Policy transport | Sanitized `policyContext` only (`filePath` / `command` + `cwd` / `home`); never Write contents or Edit replacement bodies |
| Constraint evaluation | `allowedPaths` / `deniedPaths` / `deniedCommands` via `/api/verify` |
| Fail-open | Missing config; network/API errors and the bounded five-second verify timeout |
| Fail-closed | Malformed root/tool input, missing command/path for mapped shell/file tools, and oversized local policy input |
| Intentionally unmapped | Monitor without a shell `command` (e.g. WebSocket-only); Glob, Grep, TodoWrite, and other non-governed tools |
| Known limitations | Not universal Claude Code security — only tool calls routed through the installed PreToolUse hook are checked. |
| Before claiming production-ready | Expand Monitor coverage only when a clean existing action mapping exists |

**Approval grant integrity (agent_action):** Command and file-path approvals are bound to a deterministic SHA-256 fingerprint of the canonical target (exact command string; lexically canonicalized file path). Grants are consumed with a single atomic conditional update and are single-use. Legacy unbound command/file approvals cannot be approved or consumed. Generic purchase-style approvals retain action/vendor/amount binding. Managed Profiles pause approvals are unchanged. BehalfID does not interpret shell semantics or review file contents.

### LangChain

| Property | Value |
|---|---|
| Adapter file | `integrations/langchain/index.ts` |
| Official status | Unofficial compatibility adapter |
| SDK dependency | None (duck-typed `name`, `description`, `call` interface) |
| Tested SDK versions | None — unit tests use manually constructed tool objects |
| Supported environments | Node.js 18+ |
| Functions | `wrapToolWithBehalfID`, `wrapToolsWithBehalfID` |
| Fail-closed | Yes — verify errors return DenyResponse |
| Known limitations | `verifyOverrides` applies to all tools in `wrapToolsWithBehalfID` — per-tool overrides require individual wrapping; return type widens to `TOutput \| DenyResponse` which LangChain will serialize to JSON |
| Before claiming production-ready | Test with real `DynamicTool`, `StructuredTool`, `Tool` from `@langchain/core`; verify executor handles DenyResponse objects in tool output; run end-to-end with a real LLM |

### LlamaIndex

| Property | Value |
|---|---|
| Adapter file | `integrations/llamaindex/index.ts` |
| Official status | Unofficial compatibility adapter |
| SDK dependency | None (duck-typed `metadata.name`, `metadata.description`, `call` interface) |
| Tested SDK versions | None — unit tests use manually constructed tool objects |
| Supported environments | Node.js 18+ |
| Functions | `wrapLlamaToolWithBehalfID` |
| Fail-closed | Yes — verify errors return DenyResponse |
| Known limitations | Only tested with FunctionTool shape; QueryEngineTool has a different call signature that may need adaptation; `metadata.parameters` is passed through unchanged |
| Before claiming production-ready | Test with real `FunctionTool.from()` from `llamaindex`; test with `ReActAgent`; confirm `metadata.parameters` round-trips correctly |

### Vercel

| Property | Value |
|---|---|
| Adapter files | `integrations/vercel/index.ts` (factory), `integrations/vercel/example-route.ts` (annotated example) |
| Official status | Deployment example — not in Vercel Marketplace |
| SDK dependency | `next` (NextRequest, NextResponse) |
| Tested SDK versions | `next` ^16 (type-only, not unit-tested) |
| Supported environments | Next.js App Router, Vercel Fluid Compute, Node.js 18+ |
| Functions | `createBehalfIDHandler` |
| Fail-closed | Yes — verify errors return HTTP 503 before action handler runs |
| Known limitations | No unit tests for the Vercel adapter (requires Next.js runtime mocking); no middleware variant; no rate-limit or auth layer included |
| Before claiming production-ready | Write unit tests with mocked NextRequest/NextResponse; test on real Vercel deployment; add to Vercel Marketplace; consider a middleware variant for route-level protection |

### Stripe

| Property | Value |
|---|---|
| Adapter file | `integrations/stripe/index.ts` |
| Official status | Permission example — not a Stripe App |
| SDK dependency | None (execute callback is caller-supplied) |
| Tested SDK versions | None — no real `stripe` SDK calls in the adapter |
| Supported environments | Node.js 18+, Edge (no Node-specific APIs used) |
| Functions | `gateCheckoutSession`, `gateCharge`, `gateSubscriptionChange`, `gateRefund` |
| Fail-closed | Yes — verify errors return DenyResponse |
| Known limitations | Does not handle Stripe idempotency keys; does not validate webhook signatures; no SCA/3DS flow integration; refund amounts are not cross-validated against the original charge |
| Before claiming production-ready | Run against real Stripe test mode; add idempotency key support; handle webhook-triggered actions separately; review Stripe's SCA requirements |

---

## Security guarantees (all adapters)

The following properties are enforced by the adapter code and covered by tests:

| Guarantee | Mechanism | Test coverage |
|---|---|---|
| execute() never called on denial | `if (verifyResult.allowed !== true) return deny` before execute | `adapters.test.ts` |
| execute() never called when verify throws | `safeVerify()` catches and returns DenyResponse | `adapters-stress.test.ts` |
| Non-boolean `allowed` treated as denial | Strict `=== true` check | `adapters-stress.test.ts` |
| DenyResponse is immutable | `Object.freeze()` on return value | `adapters-stress.test.ts` |
| execute() errors propagate to caller | No catch around execute() | `adapters-stress.test.ts` |
| verify() timeout → deny (fail-closed) | Timer race in `safeVerify`; timeout rejects into the catch and aborts the in-flight request via `AbortController` | `sdk-exports.test.ts`, `safe-verify-abort.test.ts`, `live-adapters.test.ts` |

---

## What is NOT guaranteed by these adapters

- **No replay protection**: if a requestId is returned, it is used for audit only. The adapter does not prevent the same action from being re-requested.
- **No rate limiting**: call frequency is not controlled by the adapters. Implement rate limiting at the route or client level.
- **No argument validation**: tool input is passed through to execute() without sanitization. Validate inputs inside execute().
- **No idempotency**: if execute() fails after verify() succeeds, the permission check result is not cached or reused.
- **verify() timeout (opt-in)**: pass `timeoutMs` in `IntegrationConfig` to enforce a deadline on the BehalfID permission check. If the deadline fires, the action is denied (fail-closed). The execute() callback is caller-owned — add timeouts inside execute() if needed.

- **AbortSignal on timeout**: when `timeoutMs` is set, `safeVerify` creates an `AbortController` and passes its signal to `BehalfIDClient.verify(input, { signal })`. When the deadline fires, `safeVerify` aborts the in-flight client request and returns the same fail-closed deny result as before — provided the runtime `fetch` implementation supports `AbortSignal` (Node.js 18+, modern Edge runtimes, and browsers all do). Custom clients that implement only `verify(input)` remain compatible; they still fail closed on timeout, but their request is not cancelled.

---

## What must happen before advertising official integrations

### OpenAI
- Published in OpenAI's tool/plugin registry
- Co-designed API contract reviewed by OpenAI
- Dedicated npm package `@behalfid/openai` with subpath exports

### Anthropic
- Listed in Anthropic's partner ecosystem
- Integration guide reviewed and approved
- Dedicated npm package `@behalfid/anthropic`

### LangChain
- Merged PR in `langchain-ai/langchainjs`
- Published `@langchain/behalfid`
- Listed on LangChain integrations page

### LlamaIndex
- Merged PR in `run-llama/LlamaIndex.TS`
- Published `@llamaindex/behalfid`
- Listed on LlamaIndex integrations page

### Vercel
- Listed in Vercel Marketplace with a provisioning flow
- Integration review completed by Vercel partnerships

### Stripe
- Listed in Stripe App Marketplace
- SCA, webhooks, and idempotency compliance reviewed
- Dedicated npm package `@behalfid/stripe`
