# Testing BehalfID

BehalfID uses Vitest for security and enforcement regression tests.

```bash
npm test
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

- `/api/verify` route authentication, malformed body handling, quota denial, allowed and denied webhook queuing, and response secret hygiene.
- `verifyAction` permission decisions for disabled agents, missing permissions, revoked and expired permissions, matching active permissions, cross-permission `blockedActions` override, strict `allowedActions` narrowing, resource/vendor constraints, comma-separated resource matching, `allowedVendors`, `maxAmount`, approval-gated permissions, request IDs, risk, denial reasons, and verification-log writes.
- Fail-closed behavior for permission lookup failures and missing constrained inputs.
- Webhook event payload safety, HMAC signing interoperability with the SDK verifier, invalid signature/body/secret failures, replay tolerance, and delivery-error redaction.
- Action Gateway verification-before-execution call order, denial and thrown-verification short-circuiting, unsupported-action denial, DNS-pinned HTTP lookup behavior, private/internal URL blocking, private DNS resolution blocking, redirect-to-private blocking, and response truncation.
- Billing/quota enforcement for free, pro, and enterprise agent and monthly verification limits, current unmetered behavior when `accountId` or the `Account` record is missing, webhook plan gating, and missing/invalid plan fallback.
- Production hardening checks for env validation, Redis rate-limit fallback warnings, protected health response shape, webhook worker route auth and summary output, and Stripe webhook idempotency/unknown-event behavior.
- API key hashing, real bearer-token parsing for missing/malformed/wrong-scheme/invalid-prefix formats, valid-looking key lookup, matching against hashed keys, rotation invalidating the old hash condition, one-time raw key response, and non-persistence of raw rotated keys.

## What is mocked

Tests mock MongoDB/Mongoose models at the model boundary and do not open a database connection. This keeps the suite fast and stable while still exercising the real decision functions and route handlers.

Network calls are mocked. Action Gateway tests mock DNS and `http`/`https` clients so SSRF and redirect behavior is tested without reaching external URLs. Webhook delivery tests do not call webhook endpoints.

Rate limiting, developer-token authentication, and quota checks are mocked in route tests where they are not the behavior under test. Dedicated quota tests cover plan enforcement directly.

`/api/verify` route tests still mock `authenticateAgent`; those tests cover route response shape when auth fails. Direct API key tests cover the real bearer parsing and hashed-key lookup behavior.

## Remaining gaps

The suite does not yet run against a real MongoDB test database. A later integration layer should create real accounts, agents, permissions, logs, and webhook events in an isolated database and call the HTTP routes end to end.

Webhook worker route auth and summary behavior is covered. The deeper `processWebhookEvents` delivery loop is still only partially covered through signing and redaction helpers; a future test should exercise it with mocked endpoints and delivery records.

Dashboard and console routes have separate auth/session behavior and are not fully covered here.

Missing `accountId` or missing `Account` records currently remain unmetered for verification and agent-count quota checks. Tests document this current behavior without implying paid or enterprise status. Product/security should revisit whether this should fail closed.

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
