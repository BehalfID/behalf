# BehalfID API

Base URLs:

```txt
http://localhost:3000
https://behalfid.vercel.app
```

Protected public endpoints require:

```txt
Authorization: Bearer bhf_sk_xxx
```

Errors use:

```json
{
  "error": "Human-readable error message."
}
```

Protected public endpoints are rate limited by IP before authentication and by API key hash after authentication. Rate limiting uses Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured; otherwise it falls back to in-memory mode.

## POST /api/agents

Creates an agent and returns its API key once.

By default, anonymous public agent creation is disabled. To allow anonymous prototype creation, set `BEHALFID_PUBLIC_AGENT_CREATION=true`. Otherwise this endpoint requires either a console session cookie or:

```txt
Authorization: Bearer <BEHALFID_SETUP_TOKEN>
```

Request:

```json
{
  "name": "Jasper Shopping Agent"
}
```

Response:

```json
{
  "agentId": "agent_xxx",
  "apiKey": "bhf_sk_xxx"
}
```

## POST /api/permissions

Creates an active permission rule for an agent. Requires that agent's API key.

Request:

```json
{
  "agentId": "agent_xxx",
  "action": "purchase",
  "description": "Festival purchase approval",
  "constraints": {
    "maxAmount": 800,
    "allowedVendors": ["coachella.com"],
    "expiresAt": "2099-05-01T23:59:59Z"
  }
}
```

Response:

```json
{
  "permissionId": "perm_xxx",
  "status": "active"
}
```

## POST /api/verify

Checks whether an agent may perform an action. Requires that agent's API key. Every authenticated verification decision is logged.

Request:

```json
{
  "agentId": "agent_xxx",
  "action": "purchase",
  "amount": 742,
  "vendor": "coachella.com",
  "metadata": {
    "cartId": "optional-client-reference"
  }
}
```

Optional `metadata` must be an object under 2KB. It is only persisted when `BEHALFID_LOG_METADATA` is not `false`. Required log fields, including `action`, `amount`, and `vendor`, are always stored and may still be sensitive.

Allowed response:

```json
{
  "requestId": "req_xxx",
  "allowed": true,
  "reason": "Action allowed by active permission.",
  "risk": "low"
}
```

Denied response:

```json
{
  "requestId": "req_xxx",
  "allowed": false,
  "reason": "Amount exceeds maxAmount constraint.",
  "risk": "high"
}
```

Denial reasons include:

- `Agent is disabled.`
- `No active permission exists for this action.`
- `Permission has been revoked.`
- `Permission has expired.`
- `amount is required for permissions with a maxAmount constraint.`
- `Amount exceeds maxAmount constraint.`
- `Vendor is not included in allowedVendors constraint.`

## GET /api/logs/[agentId]

Returns the 50 most recent verification logs for an agent. Requires that agent's API key.

Response:

```json
[
  {
    "requestId": "req_xxx",
    "agentId": "agent_xxx",
    "permissionId": "perm_xxx",
    "action": "purchase",
    "amount": 742,
    "vendor": "coachella.com",
    "allowed": true,
    "reason": "Action allowed by active permission.",
    "risk": "low",
    "createdAt": "2026-05-01T23:59:59.000Z"
  }
]
```

If no permission matched, `permissionId` is `null`.

## GET /api/health

Public liveness check. It does not reveal secrets.

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-05-02T00:00:00.000Z",
  "environment": "production"
}
```

## GET /api/health/db

Protected database health check. Requires console auth or:

```txt
Authorization: Bearer <BEHALFID_SETUP_TOKEN>
```

Response:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## GET /api/webhooks/process

Processes due webhook outbox events. This endpoint is safe to call repeatedly and is intended for Vercel cron or an external scheduler. Requires console auth or:

```txt
Authorization: Bearer <BEHALFID_SETUP_TOKEN>
```

Response:

```json
{
  "status": "ok",
  "processed": 1,
  "completed": 1,
  "retried": 0,
  "failed": 0
}
```

## POST /api/agents/[agentId]/rotate-key

Rotates an agent API key. Requires the current API key for the same agent. The old key stops working immediately and the new key is returned once.

Response:

```json
{
  "agentId": "agent_xxx",
  "apiKey": "bhf_sk_xxx"
}
```

## POST /api/permissions/[permissionId]/revoke

Revokes a permission. Requires the API key for the agent that owns the permission.

Response:

```json
{
  "revoked": true
}
```

## Console API

The console uses cookie auth, not agent bearer keys:

- `POST /api/console/login`
- `POST /api/console/logout`
- `GET /api/console/summary`
- `GET|POST /api/console/agents`
- `GET /api/console/agents/[agentId]`
- `POST /api/console/agents/[agentId]/permissions`
- `POST /api/console/agents/[agentId]/permissions/[permissionId]/revoke`
- `POST /api/console/agents/[agentId]/rotate-key`
- `POST /api/console/agents/[agentId]/disable`
- `POST /api/console/agents/[agentId]/enable`
- `GET /api/console/logs`
- `GET /api/console/settings`
- `GET /api/console/webhook-events`
- `GET /api/console/webhook-events/[eventId]`
- `POST /api/console/webhook-events/[eventId]/replay`
- `GET|POST /api/console/webhooks`
- `GET /api/console/webhooks/[webhookId]`
- `POST /api/console/webhooks/[webhookId]/disable`
- `POST /api/console/webhooks/[webhookId]/enable`
- `POST /api/console/webhooks/[webhookId]/rotate-secret`
- `GET /api/console/webhooks/[webhookId]/deliveries`

Console API routes are intended for the built-in prototype console, not third-party integrations.

See [WEBHOOKS.md](WEBHOOKS.md) for event payloads and signature verification.

## JavaScript SDK

The Node.js SDK wraps the public API with typed methods:

```bash
npm install @behalfid/sdk
```

```js
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY,
  baseUrl: "https://behalfid.vercel.app"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "purchase",
  amount: 742,
  vendor: "coachella.com"
});
```

Available methods:

- `verify(input)`
- `createAgent(name)`
- `createPermission(input)`
- `rotateKey(agentId)`
- `getLogs(agentId)`
- `verifyWebhookSignature(input)`

When public agent creation is disabled, use a server-side `BEHALFID_SETUP_TOKEN` as the SDK `apiKey` only for provisioning with `createAgent`.
