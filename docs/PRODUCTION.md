# Production Deployment Checklist

This checklist is for deploying the current BehalfID product safely. It does not include Site Guard, teams/org roles, or provider-native integrations.

## Required Environment Variables

Set these in Vercel Production before deploying:

```env
MONGODB_URI=
BEHALFID_ADMIN_PASSWORD=
BEHALFID_SETUP_TOKEN=
NEXT_PUBLIC_APP_URL=https://behalfid.com
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
```

Requirements:

- `MONGODB_URI` must point to the production MongoDB database.
- `BEHALFID_ADMIN_PASSWORD` must be strong and must not be a placeholder such as `change-me` or `replace-this-password`.
- `BEHALFID_SETUP_TOKEN` is used for protected setup, health, and webhook-worker calls. Keep it server-side only.
- `NEXT_PUBLIC_APP_URL` must be the canonical HTTPS origin.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRO_PRICE_ID` are required because billing routes are part of the deployed product.

Production startup validation fails loudly when required variables are missing or unsafe. Error messages list variable names only and do not print secret values.

## Key and Secret Handling

- Agent API keys and developer API tokens are shown only once on create or rotation.
- Agent keys, developer tokens, sessions, and webhook signing secrets are stored as hashes or derived signing keys, not raw secrets.
- Agent key rotation invalidates the old key immediately, sets `keyRotatedAt`, and clears current-key `lastUsedAt` until the new key is used.
- Successful agent-key and developer-token authentication update `lastUsedAt` on a best-effort basis. Failed metadata writes must not fail the authenticated request.
- Invalid, missing, malformed, or previously rotated keys must not update `lastUsedAt`.
- Logs, webhook payloads, CLI errors, SDK errors, worker summaries, and route errors must not include raw bearer tokens, API keys, developer tokens, passport tokens, setup tokens, Stripe secrets, or webhook signing secrets.

## Optional Environment Variables

```env
STRIPE_PUBLISHABLE_KEY=
BEHALFID_WEBHOOK_SIGNING_PEPPER=
BEHALFID_LOG_METADATA=true
BEHALFID_PUBLIC_AGENT_CREATION=false
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
TRUST_PROXY_XFF=
OLLAMA_BASE_URL=
OLLAMA_MODEL=
OLLAMA_TIMEOUT_MS=
OLLAMA_PROXY_TOKEN=
```

Notes:

- `BEHALFID_WEBHOOK_SIGNING_PEPPER` hardens outbound webhook signing if the database is exposed. Generate it with `openssl rand -hex 32`.
- Keep `BEHALFID_PUBLIC_AGENT_CREATION=false` in production unless intentionally running an open demo.
- Leave `TRUST_PROXY_XFF` unset on Vercel; BehalfID uses `x-real-ip` there.
- Ollama variables are optional and only affect AI-assisted permission drafting.

## Vercel Setup

1. Import the GitHub repository into Vercel.
2. Add all required Production env vars.
3. Add optional env vars for billing checkout, Redis, webhooks, and Ollama as needed.
4. Set `NEXT_PUBLIC_APP_URL` to the production domain, for example `https://behalfid.com`.
5. Redeploy after changing env vars.

## MongoDB Atlas

1. Create a production Atlas cluster.
2. Create a least-privilege database user for the BehalfID database.
3. Allow the Vercel deployment to connect according to your Atlas network-access policy.
4. Store the connection string in `MONGODB_URI`.

## Upstash Redis

Production rate limiting uses Upstash when both variables are set:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

If either variable is missing, BehalfID intentionally falls back to per-process memory rate limits. That is acceptable for local development, but weaker in production because limits are not shared across instances and reset on restart. If Redis is configured but the REST API fails, requests fail closed for that rate-limit check.

## Stripe Webhooks

1. Create or confirm Stripe products and prices.
2. Set `STRIPE_SECRET_KEY`.
3. Set `STRIPE_PRO_PRICE_ID` for checkout.
4. Create a Stripe webhook endpoint for:

```txt
https://behalfid.com/api/billing/webhook
```

5. Subscribe to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`.
6. Store the endpoint signing secret in `STRIPE_WEBHOOK_SECRET`.

Stripe webhook events are verified with Stripe signatures and processed idempotently by Stripe event ID.

## Webhook Worker Cron

BehalfID outbound webhooks are queued in MongoDB and processed by:

```txt
GET /api/webhooks/process
```

Protect scheduler calls with:

```txt
Authorization: Bearer <BEHALFID_SETUP_TOKEN>
```

The worker claims pending events atomically, retries with backoff, recovers stuck processing events, and dead-letters events that exceed the max attempt count. Receivers should still deduplicate by `BehalfID-Event-ID` because delivery is at least once.

Retry policy:

- Eligible events are `pending`, not dead-lettered, below the max attempt count, and due by `nextAttemptAt`.
- Processing claims increment the attempt count before endpoint delivery.
- Failed endpoint deliveries create failed delivery records and set the next retry time.
- Events are retried up to 5 total attempts, then marked `failed` and `deadLetter: true`.
- Stuck `processing` events are recovered after the worker timeout; if the event is already at the max attempt count, it is dead-lettered instead.

Replay policy:

- Console replay requires console auth.
- Only dead-lettered webhook events can be replayed.
- Replay resets the event to `pending`, clears the last error and processing timestamp, and resets attempts to 0.
- Completed events are not replayed, so receivers should treat replay as an intentional recovery path rather than a normal duplicate-send path.

Operational expectations:

- Schedule `GET /api/webhooks/process` from Vercel Cron or an external scheduler with `Authorization: Bearer <BEHALFID_SETUP_TOKEN>`.
- Do not expose `BEHALFID_SETUP_TOKEN`, webhook secrets, or API keys to webhook receivers.
- Receivers should verify `BehalfID-Signature`, enforce timestamp tolerance, and deduplicate on `BehalfID-Event-ID`.
- Worker responses and delivery errors are sanitized and should not include stack traces, raw webhook secrets, bearer tokens, cookies, or API keys.

## Health Checks

- `GET /api/health` is public liveness only.
- `GET /api/health/db` requires console auth or `BEHALFID_SETUP_TOKEN` and returns safe database status without stack traces.

## Validation Before Deploy

Run:

```bash
npm test
npm run build
npm run lint
git diff --check
```

For a running deployment, also run:

```bash
APP_URL=https://behalfid.com BEHALFID_SETUP_TOKEN=<token> scripts/diagnose-prod-db.sh
```

## Known Warnings

- `Production rate limits are using per-process memory fallback`: set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- `Stripe billing is partially configured`: set both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and add `STRIPE_PRO_PRICE_ID` if checkout is enabled.
- `BEHALFID_PUBLIC_AGENT_CREATION=true`: anonymous agent creation is open. Keep it false for normal production.
