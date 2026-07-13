# Testing BehalfID

BehalfID uses Vitest for security and enforcement regression tests.

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:watch
npm run test:coverage
```

Run the full project checks before shipping security-sensitive changes:

```bash
npm run lint
npm run build
npm test
```

## Security regression coverage

The tests focus on the core product loop:

```txt
create agent -> define permissions -> verify action -> allow/deny decision -> audit/log/webhook
```

Current coverage includes:

- `/api/verify` route authentication, malformed body handling, quota denial, allowed and denied webhook queuing, `policyContext` accept/reject/size limits, and response secret hygiene.
- `verifyAction` permission decisions for disabled agents, missing permissions, revoked and expired permissions, matching active permissions, cross-permission `blockedActions` override, strict `allowedActions` narrowing, resource/vendor constraints, comma-separated resource matching, `allowedVendors`, `maxAmount`, approval-gated permissions, request IDs, risk, denial reasons, and verification-log writes.
- Argument-level path and command constraints: nested `policyContext` / `metadata.tool_input`, flat-string legacy metadata, cwd-relative and home-relative path candidates, Windows separator normalization, `..` lexical normalization, denied-over-allowed precedence, empty `deniedCommands` ignore, compound-command substring denial, and non-persistence of `policyContext`.
- Approval grant integrity: deterministic command/file fingerprints, exact command matching, lexical path canonicalization, pending-request identity including fingerprint, missing-target denial without creating an ApprovalRequest, atomic single-use grant consumption (`usedAt` separate from `resolvedAt`), legacy unbound command/file rejection, Action Inbox preview fields without `policyContext`/fingerprint exposure, and best-effort secret redaction in previews.
- Claude Code PreToolUse hook: sanitized `policyContext` forwarding (file path / command only), current tool-name mappings (Write/Edit/MultiEdit/NotebookEdit/Read/Bash/PowerShell/Agent/Task/Web*/mcp__/Monitor-with-command), oversized local policy fail-closed, and debug output that never prints raw commands or file contents.
- Antigravity PreToolUse gate: Windsurf- and Gemini-heritage tool-name normalization (file writes/reads, shell, web/browser, MCP via the documented `mcp_{server}_{tool}` FQN, the provisional `mcp__` alias, and `mcp_context`, subagents), required-mode unknown-tool denial with the exact metadata-only allowlist (list_directory/glob), content-search tools (grep_search/search_file_content) denied in required mode or warned without verification in advisory mode pending payload capture, binding-argument validation (missing/empty command, path, URL, query, MCP server identity; non-object `tool_input` and `toolCall.args` treated as malformed — required denies locally, advisory warns and verifies action-level only), argument-alias extraction (`file_path`/`absolute_path`/`TargetFile`, `command`/`CommandLine`), nested `toolCall` payload variants, decision protocol (`{}` allow / stdout deny JSON + exit 2), approval-required block with approved-retry and re-block semantics, advisory fail-open vs `required` fail-closed matrix (malformed/oversized payloads, missing tool name, missing credentials, unreachable API, timeout, invalid credentials), oversized policy context fail-closed in both modes, config-file (non-env) enforcement resolution, secret hygiene in traces and decisions, provenance-labeled payload fixtures (`test/fixtures/antigravity/`), capture-schema diagnostic sanitization (field names/types only, never values, never blocks), and hooks.json / mcp_config.json install/status/uninstall idempotence with atomic temp-file+rename writes, permission preservation, pre-change `.behalfid.bak` backups, interrupted-write recovery, preservation of foreign entries, and refusal on malformed files.
- Antigravity ↔ real approval integrity (mongo integration, `test/integration/antigravity-approval.integration.test.ts`): the gate wired to the real `verifyAction` — pending approvals bound to exact command/path fingerprints via the real intent code, self-approval blocked by the real `canApproveRequest` rule, one identical retry allowed after approval with atomic single-use grant consumption, different-command intent mismatch leaving the grant unconsumed, re-block after consumption, and fail-closed behavior when approval resolution errors.
- Fail-closed behavior for permission lookup failures and missing constrained inputs.
- Webhook event payload safety, HMAC signing interoperability with the SDK verifier, invalid signature/body/secret failures, replay tolerance, and delivery-error redaction.
- Action Gateway verification-before-execution call order, denial and thrown-verification short-circuiting, unsupported-action denial, DNS-pinned HTTP lookup behavior, private/internal URL blocking, private DNS resolution blocking, redirect-to-private blocking, and response truncation.
- Billing/quota enforcement for free, pro, and enterprise agent and monthly verification limits, fail-closed behavior when `accountId` is missing, unmetered behavior when only the `Account` record is missing, webhook plan gating, and missing/invalid plan fallback.
- Production hardening checks for env validation, Redis rate-limit fallback warnings, protected health response shape, webhook worker route auth and summary output, and Stripe webhook idempotency/unknown-event behavior.
- Webhook worker integration-style coverage for atomic pending-event claims, already-processing/completed/dead-letter skips, stuck processing recovery, retry timing, max-attempt dead-lettering, delivery record creation, endpoint status/event/account filtering, secret redaction, worker route safe error responses, and console replay authorization/dead-letter reset behavior.
- API key hashing, real bearer-token parsing for missing/malformed/wrong-scheme/invalid-prefix formats, valid-looking key lookup, matching against hashed keys, successful-use `lastUsedAt` updates, no `lastUsedAt` updates for invalid or previously rotated keys, rotation invalidating the old hash condition, one-time raw key response, and non-persistence of raw rotated keys.
- Developer API token list/create/revoke behavior, one-time raw token response, hashed token storage with safe preview metadata, developer-token `lastUsedAt` updates, and token list redaction after creation.
- Secret redaction for best-effort last-used update failures and CLI error output.
- Verification log filtering, date-range retention floor behavior, summary counts, dashboard developer scoping, console account scoping, pagination metadata, CSV export redaction, and CLI log filter/output redaction.
- Site Guard path wildcard matching, blocked-path precedence, deny-by-default logic, disabled site/rule behavior, log creation, metadata redaction, fail-closed lookup handling, and check-route auth/input/response coverage.
- Workspace URL routing v1: slug normalize/validate/reserve rules, membership resolution by slug, trusted `x-behalf-workspace-slug` API scoping, and proxy public-path rewrite helpers (see `docs/WORKSPACE_URLS.md`).

## MongoDB integration coverage

`npm test` and `npm run test:unit` keep the existing fast mocked-model suite. `npm run test:integration` runs the opt-in real Mongoose coverage from `test/integration` through `vitest.integration.config.ts`.

The integration setup starts `mongodb-memory-server`, points `MONGODB_URI` at its isolated database, connects through the real `connectToDatabase()` path, clears collections after each integration test, and disconnects/stops the server after the run. Teardown also clears the test process copy of the global Mongoose connection cache before a later integration run can reconnect. It does not require MongoDB Atlas, Docker, Stripe, Upstash, Vercel, or production environment variables.

Current real-DB coverage proves:

- Account, Agent, Permission, and VerificationLog persistence for allowed and denied verification decisions.
- Atomic single-use approval grant consumption under concurrent verify retries (at most one allow; `usedAt` vs `resolvedAt` preserved).
- Revoked, expired, approval-required, narrowed `allowedActions`, comma-separated resource matching, comma-separated `constraints.allowedVendors` matching, last-used, and rotated-key verification behavior against real records.
- Order-independent `blockedActions` precedence where an older active block still overrides a newer active allow.
- Free and Pro agent limits, Free and Pro monthly verification limits, Free verification-period reset, Enterprise quota bypass, and current missing-account quota behavior against real Account and Agent records.
- Webhook event claiming/completion, retry scheduling, dead-lettering, endpoint event/status/account filtering, and delivery-record writes against real WebhookEvent, WebhookEndpoint, and WebhookDelivery records.
- Stripe webhook idempotency and plan/webhook status mutations against real StripeWebhookEvent, Account, DeveloperUser, and WebhookEndpoint records.
- Developer token create/list/auth/delete behavior against real DeveloperApiToken records, including hash storage, preview-only listing, and last-used updates.
- Site Guard Site, Rule, check decision, and SiteAccessLog persistence against real MongoDB records.

## What is mocked

Unit tests mock MongoDB/Mongoose models at the model boundary and do not open a database connection. This keeps the default suite fast and stable while still exercising the real decision functions and route handlers.

Network calls are mocked. Action Gateway tests mock DNS and `http`/`https` clients so SSRF and redirect behavior is tested without reaching external URLs. Webhook worker tests also mock DNS and `http`/`https` clients while exercising the real processing loop, endpoint filtering, retry/dead-letter transitions, delivery record writes, and sanitized error handling.

Rate limiting and quota checks are mocked in route tests where they are not the behavior under test. Dedicated developer-token tests cover token authentication and `lastUsedAt` updates, and dedicated quota tests cover plan enforcement directly.

`/api/verify` route tests still mock `authenticateAgent`; those tests cover route response shape when auth fails. Direct API key tests cover the real bearer parsing and hashed-key lookup behavior.

The real-DB integration suite still mocks outbound webhook DNS/HTTP delivery, Stripe event signature construction, and dashboard developer-session authorization. Those mocks isolate persistence and business transitions from live third-party systems and browser/session setup.

## Demo data cleanup

`npm run cleanup:demo` loads `.env`, connects to that MongoDB database, and prints a dry-run summary of the Site Guard demo records selected for cleanup:

```bash
npm run cleanup:demo
```

Review the host, database, counts, and document summaries before executing a delete. Destructive cleanup requires both confirmation flags and writes a JSON backup under `tmp/cleanup-backups/` before deletion starts:

```bash
npm run cleanup:demo -- --execute --confirm CLEAN_DEMO_DATA
```

Broader flags are opt-in. Do not run them casually:

```bash
npm run cleanup:demo -- --include-agents
npm run cleanup:demo -- --include-users --include-accounts
npm run cleanup:demo -- --older-than-days 7
```

`--include-webhooks` scopes webhook records to selected users/accounts or selected agent event payloads. `--include-billing-test-events` is narrower still: Stripe webhook cleanup only considers event IDs that explicitly contain `test` or `demo`.

## Remaining gaps

The real-DB integration suite is library-and-route focused. It does not start a Next.js server, establish real dashboard cookies, or run browser flows end to end.

Webhook worker route auth, summary behavior, safe error response, and replay route behavior remain covered by the default mocked-boundary route tests. The integration suite covers the worker persistence transitions with mocked outbound delivery.

Dashboard and console auth/session establishment is not fully covered here, but log route tests cover their scoped query behavior at the route dependency boundary.

Missing `accountId` fails closed with `ACCOUNT_CONTEXT_MISSING` for verification and agent-count quota checks (issue #77). A known `accountId` whose `Account` record is missing remains unmetered because it indicates data inconsistency rather than lost auth context. Tests cover both behaviors; the full decision note lives in `lib/quota.ts`.

`verifyAction` fails closed on permission lookup errors. Failures while updating `Agent`, updating `Permission`, or creating `VerificationLog` are still treated as database failures and may throw after the decision is computed; tests document that these failures do not create an allowed execution result.

## Adding permission regression tests

Add new permission-decision tests in `test/verify.test.ts` when changing enforcement rules.

Use `permissionFixture()` and `verificationRequestFixture()` from `test/fixtures.ts`, set the mocked permissions with `mockPermissions([...])`, call `verifyAction()`, and assert:

- `allowed`
- `reason`
- `risk`
- `requestId`
- whether `VerificationLog.create` was called with the expected decision

For route behavior, add tests to `test/api-verify-route.test.ts` and mock only the dependencies outside the behavior being tested.

## Memory Mongo troubleshooting

`mongodb-memory-server` downloads a MongoDB binary the first time it runs and reuses the cached binary later. The first `npm run test:integration` can therefore take longer or fail on a restricted network.

If the binary download is blocked:

- Re-run on a network that can reach the MongoDB download host or provide the memory-server download cache expected by your environment.
- Check memory-server environment overrides such as `MONGOMS_DOWNLOAD_DIR` when a shared binary cache is required.
- Keep using `npm test` for the normal mocked suite while the local memory-server binary issue is resolved.
