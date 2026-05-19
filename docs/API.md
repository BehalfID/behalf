# BehalfID API

Base URLs:

```txt
http://localhost:3000
https://behalfid.com
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

Protected public endpoints are rate limited by IP before authentication and by API key hash after authentication. Rate limiting uses Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured; otherwise it intentionally falls back to per-process memory mode.

Developer portal routes under `/api/dashboard/*` use HTTP-only developer session cookies. Public documentation pages are available under `/docs`.

## POST /api/agents

Adds a native or connected agent and returns its API key once. The original `{ "name": "..." }` request remains supported.

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

Optional connected-agent metadata:

```json
{
  "name": "Ollie",
  "agentType": "connected",
  "provider": "ollie",
  "externalAgentId": "optional",
  "externalAgentLabel": "Jasper's Ollie assistant",
  "description": "Family/personal assistant used for daily planning"
}
```

Supported `agentType` values are `native` and `connected`. Supported providers are `custom`, `ollie`, `chatgpt`, `claude`, `zapier`, `make`, `langchain`, `openai`, and `other`. Provider metadata is descriptive only and is not used as authentication.

Response:

```json
{
  "agentId": "agent_xxx",
  "apiKey": "bhf_sk_xxx",
  "agentType": "connected",
  "provider": "ollie"
}
```

## POST /api/permissions

Creates an active permission rule for an agent. Requires that agent's API key.

A permission is an action plus constraints: the agent can do `[action]` on
`[resource/scope]` under `[constraints]`. Purchase-style permissions are one
template; BehalfID also supports data access, messaging, scheduling, admin
workflow, and custom action patterns.

Request:

```json
{
  "agentId": "agent_xxx",
  "action": "access_data",
  "description": "Read-only Gmail label access",
  "resource": "gmail.com",
  "scope": "read labels only",
  "blockedActions": ["send email", "delete messages"],
  "template": "access_data",
  "constraints": {
    "allowedVendors": ["gmail.com"],
    "expiresAt": "2099-05-01T23:59:59Z"
  }
}
```

Optional permission metadata:

- `resource`: service, dataset, workflow, or merchant, such as `gmail.com` or `google-calendar`
- `scope`: plain-English summary of the allowed scope, such as `read-only gmail access`
- `allowedActions`: array of explicit allowed actions, such as `["read labels", "summarize messages"]`
- `blockedActions`: array of explicit blocked actions, such as `["send email", "delete messages"]`
- `requiresApproval`: boolean used by integrations that require human approval before proceeding
- `notes`: internal notes
- `template`: `access_data`, `create_content`, `schedule`, `purchase`, or `custom`

Agent descriptions are informational. Permissions — including `allowedActions` and `blockedActions` — are the source of truth for what an agent may do. External agents can read these structured fields from the public passport page.

When `allowedActions` is non-empty, it narrows the permission to those explicit actions. Verifying the broad parent `action` alone does not bypass a non-empty `allowedActions` list. Any active `blockedActions` match denies the request, even if another active permission would otherwise allow it.

Resource and vendor matching is strict. `resource` and `constraints.allowedVendors` support exact values and comma-separated values when stored that way. If a matching permission has a resource, allowed vendor, or max amount constraint, a request that omits the required `vendor`/`resource` or `amount` fails closed instead of bypassing the constraint.

The existing `constraints.allowedVendors` field is also used as a simple
resource/service allow-list for non-purchase permissions to preserve API
compatibility.

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
  "action": "access_data",
  "vendor": "gmail.com",
  "metadata": {
    "context": "summarize inbox labels"
  }
}
```

For compatibility, the verification field may still be named `vendor`; for
non-transaction actions, treat it as the resource or service being accessed.
`/api/verify` also accepts `resource` as a clearer alias. `amount` is optional
and only relevant when a permission has a `maxAmount` constraint.

Optional `metadata` must be an object under 2KB. It is only persisted when `BEHALFID_LOG_METADATA` is not `false`. Required log fields, including `action`, `amount`, and `vendor`/resource, are always stored and may still be sensitive.

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
- `Resource does not match permission resource.`
- `Action is blocked by this permission.`
- `Action is not included in allowedActions.`
- `Permission requires approval before execution.`

## GET /api/logs/[agentId]

Returns the 50 most recent verification logs for an agent. Requires that agent's API key.

Response:

```json
[
  {
    "requestId": "req_xxx",
    "agentId": "agent_xxx",
    "permissionId": "perm_xxx",
    "action": "access_data",
    "vendor": "gmail.com",
    "allowed": true,
    "reason": "Action allowed by active permission.",
    "risk": "low",
    "createdAt": "2026-05-01T23:59:59.000Z"
  }
]
```

## GET /api/passport/[agentId]

Returns the public-safe passport for a manual passport link, including agent metadata and active permission scopes. The token is separate from the agent API key. Generated passport links keep the token in the URL fragment; API calls should send it as `Authorization: Bearer bhf_pass_...`.

Passport links intentionally expose the agent's allowed permission scopes so external agents can read what they are permitted to do. They never expose API keys, webhook secrets, developer identity, account IDs, internal DB IDs, or audit logs. Revoked and expired permissions are excluded.

A passport token is not an API key. It only allows viewing the scoped passport and running manual preview checks for one agent.

Response:

```json
{
  "passportVersion": "2026-05-03",
  "mode": "manual",
  "agent": {
    "agentId": "agent_xxx",
    "name": "Ollie",
    "agentType": "connected",
    "provider": "ollie",
    "connectionStatus": "manual",
    "description": "Personal assistant used for planning"
  },
  "permissions": [
    {
      "action": "access_data",
      "resource": "gmail.com",
      "scope": "read-only gmail access",
      "description": null,
      "allowedActions": ["read labels", "summarize messages", "provide pricing metrics"],
      "blockedActions": ["send email", "delete messages", "schedule events", "make purchases"],
      "requiresApproval": true,
      "notes": null,
      "template": "access_data",
      "maxAmount": null,
      "expiresAt": null,
      "status": "active"
    }
  ],
  "limitations": [
    "Manual mode does not directly control third-party agents.",
    "Automatic enforcement requires API or SDK integration."
  ]
}
```

## POST /api/passport/[agentId]

Runs a manual allow/deny preview for a tokenized passport link. It does not create logs, mutate permissions, rotate keys, or expose secrets.

Request:

```json
{
  "action": "access_data",
  "resource": "gmail.com",
  "context": "summarize inbox labels"
}
```

If no permission matched, `permissionId` is `null`.

## GET /api/health

Public liveness check. It does not reveal secrets.

Response:

```json
{
  "status": "ok",
  "service": "behalfid",
  "timestamp": "2026-05-02T00:00:00.000Z"
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
  "service": "behalfid",
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

## Dashboard API

The developer dashboard uses these session-protected routes:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/dashboard/summary`
- `GET|POST /api/dashboard/agents`
- `GET /api/dashboard/agents/[agentId]`
- `POST /api/dashboard/agents/[agentId]/permissions`
- `POST /api/dashboard/agents/[agentId]/permissions/[permissionId]/revoke`
- `POST /api/dashboard/agents/[agentId]/rotate-key`
- `POST /api/dashboard/agents/[agentId]/disable`
- `POST /api/dashboard/agents/[agentId]/enable`
- `GET|POST /api/dashboard/webhooks`
- `GET /api/dashboard/webhooks/[webhookId]`
- `POST /api/dashboard/webhooks/[webhookId]/disable`
- `POST /api/dashboard/webhooks/[webhookId]/enable`
- `POST /api/dashboard/webhooks/[webhookId]/rotate-secret`
- `GET /api/dashboard/logs`
- `GET /api/dashboard/settings`

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
  baseUrl: "https://behalfid.com"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "access_data",
  vendor: "gmail.com"
});
```

Available methods:

- `verify(input)`
- `executeAction(input)`
- `createAgent(name)`
- `createPermission(input)`
- `rotateKey(agentId)`
- `getLogs(agentId)`
- `verifyWebhookSignature(input)`

When public agent creation is disabled, use a server-side `BEHALFID_SETUP_TOKEN` as the SDK `apiKey` only for provisioning with `createAgent`.
