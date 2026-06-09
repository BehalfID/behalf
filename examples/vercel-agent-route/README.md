# Vercel Agent Route

Shows how to protect a Next.js App Router API route with BehalfID using `createBehalfIDHandler`. The handler validates the request, calls BehalfID, and blocks denied actions before any application code runs.

## What it demonstrates

- `createBehalfIDHandler()` is a factory that returns a Next.js POST handler
- Configuration is read from env vars automatically
- Denied requests get `HTTP 403` with `allowed: false`, `reason`, `risk`, `requestId`
- BehalfID failure (network error) returns `HTTP 503` — the route never executes
- `onAllowed` callback is called only after permission is confirmed

## Setup

### 1. Set environment variables in Vercel

```bash
vercel env add BEHALFID_API_KEY
vercel env add BEHALFID_AGENT_ID
```

Or locally:

```bash
cp .env.example .env
# Fill in your keys
```

### 2. Copy the route

```bash
cp app/api/agent-action/route.ts your-nextjs-app/app/api/agent-action/route.ts
```

### 3. Add your action handlers

Edit the `onAllowed` callback in the route file to handle each action your agent needs.

## Test with curl

### Allow scenario

First create a `send_email` permission in the BehalfID dashboard, then:

```bash
curl -X POST http://localhost:3000/api/agent-action \
  -H "Content-Type: application/json" \
  -d '{"action": "send_email", "metadata": {"to": "user@example.com"}}'
```

Expected response (HTTP 200):
```json
{ "sent": true, "action": "send_email" }
```

### Deny scenario

```bash
curl -X POST http://localhost:3000/api/agent-action \
  -H "Content-Type: application/json" \
  -d '{"action": "delete_database"}'
```

Expected response (HTTP 403):
```json
{
  "allowed": false,
  "reason": "No active permission exists for this action.",
  "risk": "high",
  "requestId": "req_..."
}
```

### Missing configuration

If `BEHALFID_API_KEY` or `BEHALFID_AGENT_ID` are not set, any request returns (HTTP 503):
```json
{
  "error": "BehalfID is not configured. Set BEHALFID_API_KEY and BEHALFID_AGENT_ID in your environment variables."
}
```

## Deploying to Vercel

```bash
vercel deploy --prod
```

The handler works on Vercel's Fluid Compute runtime with no additional configuration.

## Using the low-level example route

For cases where you need full control, see `integrations/vercel/example-route.ts` — it implements the same logic without the factory pattern, with inline comments explaining each step.
