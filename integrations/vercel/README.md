# Vercel Deployment Guide

**Status: DEPLOYMENT EXAMPLE**

BehalfID runs on Vercel without any special integration. This guide shows how to configure environment variables and use the included example API route.

This is **not an official Vercel Marketplace integration**. It is a deployment example using standard Vercel features (environment variables, Next.js App Router, Fluid Compute).

## Environment variables

Set these in your Vercel project dashboard under Settings → Environment Variables:

| Variable | Required | Description |
|---|---|---|
| `BEHALFID_API_KEY` | Yes | Agent API key (`bhf_sk_...`) |
| `BEHALFID_AGENT_ID` | Yes | Agent identifier |
| `BEHALFID_BASE_URL` | No | Override for self-hosted deployments (default: `https://behalfid.com`) |
| `BEHALFID_LOG_METADATA` | No | Set to `"false"` to suppress metadata from verification logs |

Add them to all environments (Production, Preview, Development):

```bash
vercel env add BEHALFID_API_KEY
vercel env add BEHALFID_AGENT_ID
```

## Example API route

`integrations/vercel/example-route.ts` is a complete Next.js App Router `POST` handler. To use it:

1. Copy it to `app/api/agent-action/route.ts`
2. Adapt the action handler at the bottom of the `POST` function
3. Deploy — the route will verify permissions before any action executes

The route is fail-closed: if BehalfID is unreachable, it returns `503` and blocks the action rather than allowing it through.

## Runtime notes

- **Fluid Compute (default):** The `fetch`-based verify call in the example route is compatible with Vercel's default Fluid Compute runtime. No edge-specific changes are needed.
- **Full Node.js available:** You can use the `@behalfid/sdk` npm package directly in Fluid Compute functions rather than the inline fetch approach in the example.
- **Cold starts:** The verify call adds ~50–150ms on the first request in a new instance. Subsequent requests in the same instance reuse the warm connection.

## Using the SDK instead of raw fetch

If you prefer the SDK over the inline fetch in the example route:

```typescript
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
});

const result = await behalf.verify({
  agentId: process.env.BEHALFID_AGENT_ID!,
  action: "purchase",
  amount: 4999,
  vendor: "stripe.com",
});
```

## What still needs to happen for an official Vercel Marketplace integration

- Listed in the Vercel Marketplace with a reviewed integration guide
- One-click environment variable setup via Vercel Marketplace provisioning
- Vercel integration review completed by the Vercel partnerships team
