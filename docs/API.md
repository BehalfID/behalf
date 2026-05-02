# BehalfID API

Base URLs:

```txt
http://localhost:3000
https://behalfid.vercel.app
```

Protected endpoints require:

```txt
Authorization: Bearer bhf_sk_xxx
```

Protected endpoints are rate limited. The MVP limiter allows 60 requests per minute per source IP before authentication and 60 requests per minute per authenticated API key hash after authentication. It is in-memory only: Vercel/serverless instances do not share counters, counters reset on cold starts/redeploys, and production should replace this with Redis or Upstash.

Errors use a consistent JSON shape:

```json
{
  "error": "Human-readable error message."
}
```

## POST /api/agents

Creates an agent and returns its API key one time.

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

Creates an active permission rule for an agent. Requires the same agent's API key.

Request:

```json
{
  "agentId": "agent_xxx",
  "action": "purchase",
  "constraints": {
    "maxAmount": 800,
    "allowedVendors": ["coachella.com"],
    "expiresAt": "2026-05-01T23:59:59Z"
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

Validation:

- `agentId` and `action` are required.
- `maxAmount` must be a non-negative number.
- `allowedVendors` must be an array of non-empty strings.
- `expiresAt` must be a valid future ISO date.

## POST /api/verify

Checks whether an agent may perform an action. Requires the same agent's API key. Every verification decision is logged.

Request:

```json
{
  "agentId": "agent_xxx",
  "action": "purchase",
  "amount": 742,
  "vendor": "coachella.com"
}
```

Allowed response:

```json
{
  "allowed": true,
  "reason": "Action allowed by active permission.",
  "risk": "low"
}
```

Denied response:

```json
{
  "allowed": false,
  "reason": "Amount exceeds maxAmount constraint.",
  "risk": "high"
}
```

Denial reasons include:

- `No active permission exists for this action.`
- `Permission has been revoked.`
- `Permission has expired.`
- `Amount exceeds maxAmount constraint.`
- `Vendor is not included in allowedVendors constraint.`

## GET /api/logs/[agentId]

Returns the 50 most recent verification logs for an agent. Requires the same agent's API key.

Response:

```json
[
  {
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

If no permission matched a verification request, `permissionId` is `null`.

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

Revocation is idempotent.

## Security Review

Implemented:

- Plaintext API keys are never stored.
- API keys are only returned at agent creation.
- Protected endpoints require bearer API keys.
- API key hashes are compared with `crypto.timingSafeEqual`.
- Agent ownership is enforced before creating permissions, verifying actions, reading logs, or revoking permissions.
- Request fields are whitelisted and nested constraints are validated.
- Verification logs do not store API keys.
- Verification logs are written for authenticated verification decisions, including denied decisions. Failed authentication attempts are not logged in verification logs.
- API key rotation stores only the hash of the new key.
- Rate limiting is applied to protected routes.

Known limitations:

- Rate limiting is in-memory only and not shared across serverless instances.
- No per-user account model or organization model.
- No API key naming or multiple active keys.
- Permission matching currently uses the most recent matching action permission.
- MongoDB credentials should be least-privilege in production.
