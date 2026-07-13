# BehalfID API

Base URLs:

```txt
http://localhost:3000
https://www.behalfid.com
```

Agent protected public endpoints require:

```txt
Authorization: Bearer bhf_sk_xxx
```

Errors use:

```json
{
  "error": "Human-readable error message."
}
```

Plan and quota errors add stable fields without exposing Stripe IDs or internal billing state:

```json
{
  "error": "Agent limit of 3 reached on the free plan.",
  "code": "AGENT_LIMIT_REACHED",
  "currentPlan": "free",
  "limit": 3,
  "upgradeHint": "Upgrade to Pro to add more agents."
}
```

Protected public endpoints are rate limited by IP before authentication and by API key hash after authentication. Rate limiting uses Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured; otherwise it intentionally falls back to per-process memory mode.

Developer portal routes under `/api/dashboard/*` use HTTP-only developer session cookies. Public documentation pages are available under `/docs`.

Site Guard checks use the existing account-scoped developer API token header in this MVP:

```txt
x-developer-token: bhf_dev_xxx
```

## Plans and Quotas

Plan entitlements are centralized in `lib/plans.ts`; see [ENTITLEMENTS.md](ENTITLEMENTS.md) for the full model. Current plan limits:

| Plan | Billable seats | Agents | Protected repos | Verifications / month | Webhooks | Log retention |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Free | 1 | 3 | 1 | 10,000 | Disabled | 7 days |
| Pro (legacy) | 25 | 50 | 10 | 250,000 | Enabled | 90 days |
| Team | 25 | 25 | 10 | 250,000 | Enabled | 30 days |
| Business | 100 | 250 | 100 | 2,000,000 | Enabled | 180 days |
| Enterprise | Unlimited | Unlimited | Unlimited | Unlimited | Enabled | 365 days (custom) |

Plans are seat-based with pooled verification usage. Creation limits block new resources only (`AGENT_LIMIT_REACHED`, `SEAT_LIMIT_REACHED`, `PROTECTED_REPO_LIMIT_REACHED`); existing resources are never deleted or disabled when an account is over a limit or downgrades. `team` and `business` are internal tiers with no checkout path yet; Stripe still only moves accounts between `free` and `pro`.

Verification usage is tracked on `Account.verificationCount` with `verificationPeriodStart`. The current reset boundary is the UTC calendar month: stale or missing period data resets the count on the next metered verification and sets the period start to the first day of the current UTC month. Enterprise verification and agent quotas are treated as unlimited. Metered quota checks fail closed with `ACCOUNT_CONTEXT_MISSING` when `accountId` is missing; a known `accountId` whose `Account` record is missing remains unmetered because it indicates data inconsistency rather than lost auth context.

Free accounts cannot create or enable dashboard webhooks. If an account downgrades or a Stripe payment fails, webhook endpoints are disabled and paid limits are removed until billing is restored.

## Key Management

Agent API keys and developer API tokens are shown only once when they are created or rotated. BehalfID stores hashes, plus safe metadata such as `createdAt`, `lastUsedAt`, `keyRotatedAt`, and short previews where available. List and detail endpoints never return raw keys after the one-time create or rotate response.

`lastUsedAt` is updated after successful agent-key authentication and successful developer-token authentication. Invalid, missing, malformed, or previously rotated keys do not update `lastUsedAt`. Timestamp updates are best effort: if the metadata write fails, the authenticated request continues and logs only sanitized identifiers/error text.

Rotating an agent API key invalidates the old key immediately, clears `lastUsedAt` for the newly active key, sets `keyRotatedAt`, and returns the new raw key once. Store it in a secret manager or environment variable before leaving the response.

Error responses, webhook payloads, worker summaries, SDK errors, and CLI errors are expected to redact bearer tokens, agent keys, developer tokens, passport tokens, and webhook signing secrets.

## Integration Paths

- SDK path: use `@behalfid/sdk` inside your app and call `verify` before your code executes a tool action. Use `getBoundary` to discover the agent's operating limits ahead of time.
- Action Gateway path: call `/api/actions/execute` when BehalfID should verify and execute a supported safe action in one request.
- CLI/MCP path: use `behalf mcp init`, `behalf claude`, or `behalf codex` to add permission context and `verify_action` to local coding agents.
- Site Guard path: call `/api/site-guard/check` from website middleware before serving protected routes.

The CLI/MCP path is documented in [MCP_DEMO.md](MCP_DEMO.md). It does not change the core verify API: denied, approval-required, or unavailable verification must fail closed before execution.

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

Optional `policyContext` is a separate, non-persisted object (max 16 KB) used only during policy evaluation — for example sanitized Claude Code PreToolUse arguments. It is never written to `VerificationLog.metadata` and never included in webhook payloads. Typical shape:

```json
{
  "source": "claude_code",
  "toolName": "Write",
  "cwd": "/workspace/project",
  "home": "/Users/alice",
  "toolInput": {
    "filePath": "/workspace/project/src/index.ts"
  }
}
```

Only constraint-relevant fields belong in `policyContext.toolInput` (`filePath`, `command`). File contents, Edit `old_string`/`new_string`, notebook cell bodies, and unrelated tool-input fields must not be sent.

### Path and command argument constraints

Permissions may include `constraints.allowedPaths`, `constraints.deniedPaths`, and `constraints.deniedCommands`.

- Path constraints apply to `write_file` and `read_file`. Patterns are glob-style (`src/**`, `**/.env`, `~/.ssh/**`). `deniedPaths` takes precedence over `allowedPaths`. Absolute paths are matched against normalized candidates derived from `cwd` and optional `home` (relative-to-cwd and `~/` forms). When path constraints exist and no usable path is supplied, verification fails closed with `path_not_permitted`.
- Command constraints apply to `execute_command`. `deniedCommands` entries are **literal substrings** of the full command string (not regexes or shell globs), so a denied token is detected inside compound commands such as `npm test && rm -rf /tmp/build`. Empty or whitespace-only entries are ignored. When `deniedCommands` is non-empty and no usable command is supplied, verification fails closed with `command_blocked`.
- Argument-level denials are hard constraints: they are evaluated before approval resolution and cannot be bypassed by an approval grant.

Claude Code tool calls routed through the installed BehalfID PreToolUse hook are checked against matching BehalfID permissions before execution. The hook forwards only sanitized policy-relevant fields via `policyContext` (never Write contents or Edit replacement bodies). Network or service unavailability in the hook still fails open so a BehalfID outage does not brick the agent; malformed or oversized local policy input fails closed because the action cannot be safely evaluated.

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
- `path_not_permitted`
- `command_blocked`

### Approvals (`approvalRequired` and `approvalId`)

When the matching permission has `requiresApproval: true` and the request passes
every other policy check, verification denies with `approvalRequired: true` and
returns the `approvalId` of the pending `ApprovalRequest`:

```json
{
  "requestId": "req_xxx",
  "allowed": false,
  "approvalRequired": true,
  "approvalId": "apr_xxx",
  "reason": "Permission requires approval before execution.",
  "risk": "medium"
}
```

- `approvalRequired: true` means the action is policy-compliant but is being held
  for a human decision. A pending `ApprovalRequest` is created (or reused) for
  the exact request — repeated identical verify calls do not create duplicates.
- `approvalId` identifies that pending request. A developer resolves it in the
  dashboard (`POST /api/dashboard/approvals/{approvalId}/approve` or `/deny`).

**What an approval grant means.** Approving a request creates a time-limited
grant (30 minutes) scoped to the exact `action`, `vendor`/resource, `amount`,
and — for `execute_command` / `read_file` / `write_file` — a deterministic
SHA-256 `argumentFingerprint` of the canonical command or file path that was
presented for review. The next verify call that matches that exact tuple is
allowed and the grant is consumed atomically (marked `used` with `usedAt`) —
it cannot be reused. Approval time (`resolvedAt` / `resolvedBy`) is preserved
separately from consumption time.

**Command and file-path binding.** For bindable actions:

- Commands are fingerprinted from the complete extracted command string with
  **exact** matching (no trim, collapse, tokenize, reorder, or case folding).
  An exact whitespace difference requires a new approval. BehalfID does not
  interpret shell semantics.
- File paths are fingerprinted after **lexical** canonicalization (separators,
  `.` / `..`, optional `cwd` / `home` resolution). The file need not exist;
  `realpath` is not used. Approvals bind to the path, not file contents.
- The Action Inbox stores a bounded (500-character), best-effort-redacted
  preview (`argumentPreview`). Raw `policyContext` and file contents are never
  persisted on the approval document. Previews redact known Bearer /
  BehalfID / webhook key formats; arbitrary shell secrets are not guaranteed
  to be detected — do not place secrets in command arguments.
- Missing command/path targets deny with
  `"Approval target is required for this action."` and do **not** create an
  ApprovalRequest.
- Legacy unbound command/file approvals (no fingerprint) cannot be approved or
  consumed; retry the agent action to create a bound request.

Generic non-command/file approvals (for example purchases) retain
action/vendor/amount binding as before.

**What an approval grant does not override.** An approval satisfies only the
human-approval gate. It never overrides policy constraints, which are
re-evaluated on every verify call *before* the approval gate is consulted:

- disabled agents
- revoked permissions
- expired permissions
- `blockedActions`
- `allowedActions` narrowing
- resource/vendor matching
- `constraints.allowedVendors`
- `constraints.maxAmount` (including the requirement that `amount` be present)
- `constraints.allowedPaths` / `constraints.deniedPaths` / `constraints.deniedCommands`

A grant approved for `vendor: "a.com"` does not allow `vendor: "b.com"`; a
grant approved for `amount: 25` does not allow `amount: 250`; a grant approved
for `action: "purchase"` does not allow `action: "deploy"`; a grant approved
for command `npm test` does not allow `rm -rf /tmp/project`. A request that
differs from the approved tuple is denied with `approvalRequired: true` and a
new pending `ApprovalRequest` for the new tuple.

The verification order is: find the matching permission → apply all hard
constraint checks above → only then, if the permission requires approval,
consume a matching grant or create a pending approval request.

### Shadow Mode

Shadow mode lets you observe what BehalfID would have decided without enforcing it. Use it during policy discovery and onboarding to understand which actions your agents are performing before you begin blocking them.

To enable shadow mode, add `"shadow": true` (or `"mode": "shadow"`) to the request body:

```json
{
  "agentId": "agent_xxx",
  "action": "deploy_production",
  "vendor": "vercel",
  "shadow": true
}
```

The policy is evaluated normally and the decision is logged with `shadow: true`. Execution is never blocked. The response always returns `"allowed": true` and includes the real policy decision in `shadowDecision`:

```json
{
  "requestId": "req_xxx",
  "allowed": true,
  "shadow": true,
  "shadowDecision": {
    "allowed": false,
    "reason": "No active permission exists for this action.",
    "risk": "high"
  },
  "reason": "Shadow mode: action would have been denied.",
  "risk": "high"
}
```

Key properties:
- `shadow: true` is always present in the response when shadow mode was requested.
- `shadowDecision.allowed` is the real policy outcome.
- `allowed` is always `true` — shadow mode never blocks.
- Approval gates are not triggered in shadow mode (no `ApprovalRequest` is created).
- The log is marked `shadow: true` and can be filtered with `?shadow=true` on the logs endpoints.
- Normal mode is unaffected. `allowed: false` still means the action is blocked when `shadow` is not set.

**CLI shadow mode:**

```sh
# Evaluate the policy for a command without blocking it
behalf run --shadow -- npm run deploy

# Evaluate a single verify call without enforcement
behalf verify agent_xxx --action deploy_production --shadow
```

In shadow mode the CLI prints what the decision would have been, prefixed with `[shadow]`, then executes the command regardless.

**Dashboard filtering:**

Logs can be filtered to show only shadow-mode decisions:

```
GET /api/dashboard/logs?shadow=true
GET /api/logs/{agentId}?shadow=true
```

Use `?shadow=false` to exclude shadow logs and see only real enforced decisions.

## GET /api/agents/[agentId]/boundary

Returns the agent's **Boundary Manifest** — the computed, machine-readable representation of its effective operating limits. The boundary is the authoritative way for an agent to ask "what am I allowed to do?" before planning tool calls.

The boundary is derived entirely from real Permission records using the same semantics as `/api/verify`:

- `blockedActions` win over allowed actions across all active permissions.
- A non-empty `allowedActions` list narrows a permission to those exact action strings; the broad parent action is not granted.
- Revoked permissions and permissions past `constraints.expiresAt` are excluded from the effective surface and listed separately for transparency.
- Actions on `requiresApproval` permissions are listed in `approvalRequiredActions`, not `allowedActions`.
- A disabled agent returns `status: "disabled"` with empty `allowedActions` and `approvalRequiredActions`.

Authentication matches `/api/verify`: the request requires that agent's own API key (`Authorization: Bearer bhf_sk_...`), so an agent can never read another agent's boundary. The optional `x-developer-token` header, when present, must belong to the same account. Database or computation failures fail closed with `503`.

Response:

```json
{
  "boundaryVersion": "2026-06-11",
  "agentId": "agent_xxx",
  "status": "active",
  "generatedAt": "2026-06-11T00:00:00.000Z",
  "agent": {
    "name": "Coding Agent",
    "description": "Deploys and maintains the web app",
    "guidelines": ["Use BehalfID before risky actions."]
  },
  "allowedActions": ["deploy to staging", "read issues"],
  "blockedActions": ["deploy to production", "force push"],
  "approvalRequiredActions": ["deploy_production"],
  "resources": ["github.com", "staging"],
  "vendors": ["vercel.com"],
  "constraints": {
    "maxAmount": [
      { "permissionId": "perm_xxx", "action": "purchase", "resource": null, "maxAmount": 25 }
    ],
    "vendorRestrictions": [
      { "permissionId": "perm_xxx", "action": "purchase", "allowedVendors": ["vercel.com"] }
    ],
    "expirationRules": [
      { "permissionId": "perm_xxx", "action": "deploy", "expiresAt": "2099-01-01T00:00:00.000Z" }
    ]
  },
  "activePermissions": [ { "permissionId": "perm_xxx", "action": "deploy", "status": "active" } ],
  "expiredPermissions": [],
  "revokedPermissions": [],
  "summary": {
    "activePermissionCount": 1,
    "expiredPermissionCount": 0,
    "revokedPermissionCount": 0,
    "allowedActionCount": 2,
    "blockedActionCount": 2,
    "approvalRequiredActionCount": 1
  },
  "enforcement": {
    "decisionEndpoint": "/api/verify",
    "note": "The boundary is informational context. Every risky action must still be verified with POST /api/verify before execution; denied or unavailable verification fails closed."
  }
}
```

How the boundary relates to other primitives:

- **Verification** stays the enforcement decision point. The boundary tells an agent its operating space ahead of time; `/api/verify` decides each action and writes the audit log. Reading the boundary never replaces verification and is not metered as a verification.
- **Passports** are human-readable or manual boundary sharing: tokenized links for assistants that cannot authenticate with an agent API key. The boundary endpoint is the authoritative runtime source of truth for integrated agents.
- **Approvals** appear in `approvalRequiredActions`. When the agent attempts one of these actions, `/api/verify` returns `approvalRequired: true` and the normal approval-grant flow applies.

SDK access: `behalf.getBoundary(agentId)`. CLI/MCP access: the `get_boundary` MCP tool and the permission cache used by `behalf mcp init` both read this endpoint with the agent API key — no dashboard session is required.

## POST /api/site-guard/check

Checks whether a website route should be served to an AI agent or crawler signal. Site Guard is separate from `/api/verify`: it does not use agent API keys or passport permissions. The MVP requires an account-scoped developer API token in `x-developer-token`.

Request:

```json
{
  "siteId": "site_xxx",
  "path": "/docs/api",
  "userAgent": "ExampleBot/1.0",
  "agentIdentifier": "crawler_example",
  "metadata": {
    "edge": "iad1"
  }
}
```

`domain` may be supplied instead of `siteId`. `path` must be an absolute path without query or fragment. `metadata` is optional, limited to an object under 2KB, redacted at input handling, and not stored in Site Guard logs in this MVP.

```json
{
  "allowed": true,
  "reason": "Path allowed by an active Site Guard rule.",
  "requestId": "req_xxx",
  "matchedRuleId": "sgr_xxx",
  "siteId": "site_xxx"
}
```

Denied decisions return the same shape with `allowed: false`. Site Guard denies when a site is disabled, a rule is disabled, no active rule matches the signal, no matching allowed path exists, an approval-gated rule matches, or an unexpected policy lookup error occurs. Missing sites are denied without creating a log because no owned site record exists.

Active rules match either an exact `agentIdentifier` or a simple wildcard `userAgentPattern`. `allowedPaths` and `blockedPaths` support exact paths and `*` wildcards. Any matching blocked path wins before an allowed path, including when another active matching rule would allow it.

Every allowed or denied decision for an existing site writes a Site Guard log with the site, matched rule when any, domain, path, user-agent signal, optional agent identifier, decision, reason, risk, and `requestId`. Site Guard logs do not store cookies, authorization headers, developer tokens, request bodies, page contents, query strings, or raw optional metadata.

## GET /api/logs/[agentId]

Returns verification logs for an agent. Requires that agent's API key. With no query string, the legacy response remains the 50 most recent logs as an array. When filters or pagination are supplied, the response includes `logs`, `summary`, and `pagination`.

Supported query parameters:

- `allowed=true|false`
- `risk=low|medium|high`
- `action=purchase`
- `vendor=stripe.com` or `resource=stripe.com`
- `requestId=req_xxx`
- `from=2026-05-01T00:00:00.000Z`
- `to=2026-05-31T23:59:59.999Z`
- `limit=100`
- `page=1`

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

Filtered response:

```json
{
  "logs": [
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
  ],
  "summary": {
    "total": 1,
    "allowed": 1,
    "denied": 0,
    "highRisk": 0,
    "approvalRequired": 0,
    "topDeniedAction": null,
    "topVendor": "gmail.com"
  },
  "pagination": {
    "limit": 100,
    "page": 1,
    "total": 1,
    "hasMore": false
  }
}
```

Dashboard and console log APIs support the same filters. Dashboard log reads are scoped to the authenticated developer user and retention window for the account plan. Console log reads are admin-only and scoped to the console account. `format=csv` exports the selected safe log fields as CSV. Raw API keys, bearer tokens, developer tokens, passport tokens, and webhook signing secrets are redacted from log API and export output.

Verification logs store the decision fields needed for debugging: `requestId`, `agentId`, `permissionId`, `action`, `vendor`/resource, `amount`, `allowed`, `reason`, `risk`, and `createdAt`. Optional `metadata` is stored only when `BEHALFID_LOG_METADATA` is not `false`, and current list/export endpoints do not return metadata. Request IDs are stable across the verification response, audit log entry, and verification webhook payload, so they are the primary join key when debugging an agent action end to end.

## GET /api/passport/[agentId]

Returns the public-safe passport for a manual passport link, including agent metadata and active permission scopes. Passports are human-readable or manual boundary sharing for assistants that cannot authenticate with an agent API key; integrated agents should read `GET /api/agents/[agentId]/boundary` instead, which is the authoritative runtime source of truth. The token is separate from the agent API key. Generated passport links keep the token in the URL fragment; API calls should send it as `Authorization: Bearer bhf_pass_...`.

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

## POST /api/actions/execute

Runs the Action Gateway MVP. Requires the agent API key. The route verifies the requested action first and only runs the supported executor when the decision is allowed.

Current supported executor:

- action: `browse_web`
- resource: `web`
- input: `{ "url": "https://example.com" }`

Request:

```json
{
  "agentId": "agent_xxx",
  "action": "browse_web",
  "resource": "web",
  "input": {
    "url": "https://example.com"
  }
}
```

Allowed and executed response:

```json
{
  "requestId": "req_xxx",
  "allowed": true,
  "decision": "allowed",
  "reason": "Action allowed by active permission.",
  "executed": true,
  "result": {
    "url": "https://example.com",
    "status": 200,
    "contentType": "text/html",
    "title": "Example Domain",
    "excerpt": "Example Domain...",
    "truncated": false
  }
}
```

Denied response:

```json
{
  "requestId": "req_xxx",
  "allowed": false,
  "decision": "denied",
  "reason": "Permission requires approval before execution.",
  "executed": false
}
```

Denied, approval-required, unsupported, or failed verification decisions do not run the executor.

## POST /api/cli/session-policy

Resolve the managed profile mode for a local coding-agent session. Used by CLI shims (`behalf profile install`).

Authentication is optional. Developer session cookies and agent API keys enrich workspace policy; unauthenticated callers receive `unmanaged`. Agent API keys are supported on this route but **cannot** request pause leases (see `/api/cli/pause`).

Request:

```json
{
  "tool": "claude",
  "cwd": "hashed-or-path",
  "gitRemote": "hashed-remote",
  "branch": "main",
  "repoRoot": "policy-repo-hash",
  "deviceId": "devmac_123",
  "cliVersion": "0.2.8",
  "workspaceId": "acct_xxx"
}
```

Response:

```json
{
  "mode": "unmanaged",
  "profileId": null,
  "profileName": null,
  "sessionId": "sess_xxx",
  "workspaceId": "acct_xxx",
  "reason": "No matching managed profile.",
  "expiresAt": null,
  "cacheTtlSeconds": 300
}
```

Modes: `unmanaged`, `managed`, `required`.

The CLI sends a stable **policy repo hash** in `repoRoot`: SHA-256 of the git remote URL when available, otherwise SHA-256 of the local repo root (16-char hex slice). Dashboard protected repo entries must use this same hash. Raw git remotes are never sent or displayed.

Resolution order (first match wins):

1. Development override env vars (`BEHALF` + `ID_CLI_POLICY_MODE`)
2. Active server-side pause lease for the current user/account/device/repo scope
3. No account/auth context → `unmanaged`
4. Required account env override (`BEHALF` + `ID_CLI_REQUIRED_ACCOUNT_IDS`)
5. Persisted workspace managed profile policy (when enabled in dashboard):
   - Protected repo hash match
   - Per-tool override (`claude`, `codex`, `cursor`)
   - Work-hours mode (server time in configured timezone)
   - Outside-hours mode
   - Default mode
6. Legacy onboarding/account fallback when no persisted policy applies

Server dev overrides:

- `BEHALF` + `ID_CLI_POLICY_MODE=unmanaged|managed|required`
- `BEHALF` + `ID_CLI_REQUIRED_ACCOUNT_IDS=acct_a,acct_b`

## POST /api/cli/session-policy/simulate

Dry-run managed profile policy resolution without launching a tool, granting pause leases, or creating approval requests. Active pause leases are **not** considered — the response reflects underlying workspace policy only.

Authentication matches `POST /api/cli/session-policy`: developer session, agent API key, or anonymous. If `workspaceId` / `accountId` is supplied, it must match the authenticated workspace.

Request:

```json
{
  "tool": "claude",
  "repo": "0123456789abcdef",
  "branch": "main",
  "deviceId": "devmac_test"
}
```

- `tool` (required): `claude`, `codex`, or `cursor`
- `repo` (optional): 16- or 64-character lowercase hex policy repo hash (same value the CLI sends as `repoRoot`)
- `branch` (optional): branch name for context (not used in rule matching today)
- `deviceId` (optional): device identifier

Response:

```json
{
  "ok": true,
  "mode": "required",
  "reason": "Protected repo requires enforcement.",
  "profileId": "pprf_xxx",
  "profileName": "Default managed profile",
  "matchedRule": {
    "type": "protected_repo",
    "repoHash": "0123456789abcdef",
    "mode": "required"
  },
  "pausePolicy": {
    "enabled": true,
    "reasonRequired": true,
    "maxDurationMinutes": 30,
    "allowAllRepos": false,
    "requireApprovalForRequiredMode": true
  }
}
```

`matchedRule.type` values: `protected_repo`, `tool_override`, `work_hours`, `outside_hours`, `default`, `legacy`.

No audit log is written for v1. Raw git remotes and local paths are never accepted or returned.

## POST /api/cli/pause

Request a scoped pause lease. Pause is policy-approved — not a local bypass.

**Authentication:** requires a **developer session** (`behalf login`). Agent API keys are **not** accepted on this route (403). Use `/api/cli/session-policy` if you are authenticating with an agent API key.

Request:

```json
{
  "durationMinutes": 30,
  "reason": "personal project",
  "scope": "current_repo",
  "tool": "claude",
  "repo": "hashed-root",
  "branch": "main",
  "deviceId": "devmac_123"
}
```

Response when granted:

```json
{
  "granted": true,
  "leaseId": "pause_xxx",
  "mode": "unmanaged",
  "expiresAt": "2026-07-04T17:30:00.000Z",
  "reason": "Pause granted for current repo.",
  "scope": "current_repo",
  "tool": "claude",
  "repo": "hashed-root",
  "branch": "main",
  "deviceId": "devmac_123"
}
```

Response when approval is required (required mode with `pausePolicy.requireApprovalForRequiredMode: true`):

HTTP status: **202 Accepted**

```json
{
  "granted": false,
  "approvalRequired": true,
  "approvalRequestId": "apr_xxx",
  "mode": "required",
  "reason": "Pause requires approval for this required managed profile context."
}
```

Hard denials (approval disabled or policy rejection) still return **403 Forbidden** with an error message.

After a workspace approver approves the request in the dashboard, retry the same pause request with matching tool/repo/scope/device/duration to consume the one-time grant and receive a pause lease.

## GET /api/cli/pause/approvals/:approvalRequestId

Read the status of a managed-profile pause approval created by the authenticated developer.

**Authentication:** requires a **developer session** (`behalf login`). Agent API keys are **not** accepted (403).

Response:

```json
{
  "approvalRequestId": "apr_xxx",
  "status": "pending",
  "grantExpiresAt": null,
  "reason": "Pause requires approval for this required managed profile context."
}
```

Statuses:

- `pending` — waiting for a workspace approver
- `approved` — approved and ready to consume with a matching pause request
- `denied` — denied in the dashboard
- `used` — one-time grant already consumed
- `expired` — approved but `grantExpiresAt` is in the past

Only pause approvals owned by the authenticated developer in the active account are returned. Non-pause approval ids return **404 Not Found**. Raw pause metadata (repo hashes, device ids, secrets) is not exposed in this response.

Rules:

- Pause grant decisions evaluate the **underlying workspace policy** and ignore any already-active pause lease (renewals cannot bypass a newly required policy)
- `reason` is required unless workspace pause policy disables `reasonRequired`
- Maximum duration: workspace pause policy `maxDurationMinutes` (hard cap 240 minutes)
- Denied when workspace pause policy is disabled
- Denied when `scope=all` but workspace policy disallows all-repo pause
- Denied when workspace policy is `required` for the current context **unless** `pausePolicy.requireApprovalForRequiredMode` is `true`, in which case a pending approval is created (or an existing identical pending request is returned) instead of an immediate denial
- Approved pause grants are one-time use, scoped to requester/tool/repo/scope/device, and must be consumed within 30 minutes of approval
- Granted/denied/approval-requested events are written to `CliAuditLog`
- Session policy resolutions are written to `CliAuditLog` as `cli_session_policy`

## GET /api/dashboard/managed-profiles/activity

Return paginated managed profile runtime evidence for the current workspace: session policy decisions, pause grants, and pause denials.

Authentication: developer session required. Workspace members with viewer access can read activity for their active workspace.

Query parameters:

- `limit` — default `25`, max `100`
- `cursor` — opaque cursor from a previous response `nextCursor`
- `tool` — `claude`, `codex`, or `cursor`
- `mode` — `unmanaged`, `managed`, or `required`
- `eventType` — `cli_session_policy`, `cli_pause_grant`, `cli_pause_deny`, or `cli_pause_approval_requested`
- `repo` — policy repo hash (16- or 64-char lowercase hex)
- `branch`
- `from`, `to` — ISO timestamps

Response:

```json
{
  "events": [
    {
      "id": "clia_xxx",
      "createdAt": "2026-07-05T12:00:00.000Z",
      "eventType": "cli_session_policy",
      "tool": "claude",
      "mode": "required",
      "granted": null,
      "reason": "Protected repository policy applies (required).",
      "repo": "0123456789abcdef",
      "branch": "main",
      "deviceId": "devmac_123",
      "profileId": "pprf_xxx",
      "profileName": "Protected repository",
      "expiresAt": null
    }
  ],
  "nextCursor": "..."
}
```

Events are sorted newest first. Raw git remotes, local filesystem paths, API keys, and auth headers are never returned.

Dashboard UI: `/dashboard/managed-profiles/activity`

## POST /api/dashboard/managed-profiles/protected-repos

Append a single protected repository hash to the workspace managed profile policy without replacing the full policy document.

Authentication: verified developer session with workspace mutation capability (Owner / Engineering Lead).

Request:

```json
{
  "repoHash": "0123456789abcdef",
  "label": "Production repo",
  "mode": "required",
  "enabled": true
}
```

Rules:

- `repoHash` must be a 16- or 64-character lowercase hex policy repo hash (from `behalf profile status` or activity events)
- Raw git remotes, local filesystem paths, and URLs are rejected
- `mode` defaults to `required`; must be `unmanaged`, `managed`, or `required`
- `enabled` defaults to `true`
- `label` is optional, trimmed, max 120 characters
- Unknown fields are rejected
- Duplicate `repoHash` values in the same workspace policy return `409` with `Protected repo already exists.`
- Existing policy settings (work hours, tool modes, pause policy, and other protected repos) are preserved

Response:

```json
{
  "ok": true,
  "policy": { "...": "updated effective managed profile policy" }
}
```

Dashboard UI: use **Protect repo** on `/dashboard/managed-profiles/activity` to enroll a repo hash from session-policy activity.

## GET /api/dashboard/managed-profiles

Return the effective workspace managed profile policy for CLI shims, including defaults when no document exists yet.

Authentication: developer session required.

## PUT /api/dashboard/managed-profiles

Create or update the workspace managed profile policy used by `/api/cli/session-policy` and `/api/cli/pause`.

Authentication: verified developer session with workspace mutation capability (Owner / Engineering Lead).

Request body fields:

- `enabled`, `timezone`
- `workHours`: `{ enabled, days, start, end }`
- `duringHoursMode`, `outsideHoursMode`, `defaultMode`
- `toolModes`: optional `{ claude?, codex?, cursor? }`
- `protectedRepos`: `[{ repoHash, label?, mode?, enabled? }]` — `repoHash` must be 16- or 64-character lowercase hex (the policy repo hash from `behalf profile status`)
- `pausePolicy`: `{ enabled, reasonRequired, maxDurationMinutes, allowAllRepos, requireApprovalForRequiredMode }`

Unknown fields are rejected. Modes must be `unmanaged`, `managed`, or `required`. Pause duration is capped at 240 minutes.

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
  "failed": 0,
  "skipped": 0,
  "deadLettered": 0,
  "recovered": 0
}
```

Webhook delivery is at least once. The worker atomically claims due `pending` events before delivery so concurrent cron or scheduler calls do not process the same event at the same time. Events already `processing`, `completed`, or dead-lettered are not claimed; stuck `processing` events are moved back to `pending` after the worker timeout unless they have reached the max attempt count.

Failed deliveries retry after the configured backoff schedule and are not retried before `nextAttemptAt`. The current policy makes up to 5 attempts. After the fifth failed attempt, the event is marked `failed` with `deadLetter: true`. Console replay is intentional-only and resets a dead-lettered event to `pending` with attempts set back to 0. Completed events are not replayed.

Webhook receivers should verify `BehalfID-Signature` with the SDK `verifyWebhookSignature` helper, deduplicate by `BehalfID-Event-ID`, and avoid assuming exactly-once delivery. Delivery records store status, HTTP status when available, attempt count, retry time, and sanitized error summaries. They must not store webhook secrets, bearer tokens, cookies, or API keys.

Dashboard webhook creation and enablement require a paid plan. Free-plan requests fail with `WEBHOOKS_REQUIRE_PRO` (the preserved historical code for the paid-plan webhook gate), `currentPlan`, `limit`, and an `upgradeHint`. Downgrades and failed payments disable endpoints instead of leaving delivery active on a free account.

## POST /api/agents/[agentId]/rotate-key

Rotates an agent API key. Requires the current API key for the same agent. The old key stops working immediately and the new key is returned once.

Response:

```json
{
  "agentId": "agent_xxx",
  "apiKey": "bhf_sk_xxx"
}
```

The route stores only the new key hash, sets `keyRotatedAt`, and clears `lastUsedAt` until the new key is used.

## GET /api/dashboard/tokens

Lists developer API token metadata for the authenticated dashboard user. Raw token values are not returned.

Response:

```json
{
  "tokens": [
    {
      "tokenId": "tok_xxx",
      "name": "CI",
      "tokenPreview": "bhf_dev_xxx...abc123",
      "createdAt": "2026-05-19T00:00:00.000Z",
      "lastUsedAt": null
    }
  ]
}
```

## POST /api/dashboard/tokens

Creates a developer API token for the authenticated dashboard user. The raw token is returned once.

Request:

```json
{
  "name": "CI"
}
```

Response:

```json
{
  "tokenId": "tok_xxx",
  "name": "CI",
  "token": "bhf_dev_xxx",
  "tokenPreview": "bhf_dev_xxx...abc123",
  "createdAt": "2026-05-19T00:00:00.000Z",
  "lastUsedAt": null
}
```

## DELETE /api/dashboard/tokens/[tokenId]

Revokes a developer API token by deleting it. The route only deletes tokens owned by the authenticated dashboard user.

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
- `GET /api/console/sites`
- `PATCH /api/console/sites/[siteId]`
- `GET /api/console/site-guard/logs`
- `PATCH /api/console/sites/[siteId]/rules/[ruleId]`
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
- `GET|POST /api/dashboard/tokens`
- `DELETE /api/dashboard/tokens/[tokenId]`
- `GET|POST /api/dashboard/sites`
- `GET|PATCH /api/dashboard/sites/[siteId]`
- `POST /api/dashboard/sites/[siteId]/rules`
- `PATCH /api/dashboard/sites/[siteId]/rules/[ruleId]`
- `GET|POST /api/dashboard/webhooks`
- `GET /api/dashboard/webhooks/[webhookId]`
- `POST /api/dashboard/webhooks/[webhookId]/disable`
- `POST /api/dashboard/webhooks/[webhookId]/enable`
- `POST /api/dashboard/webhooks/[webhookId]/rotate-secret`
- `GET /api/dashboard/logs`
- `GET /api/dashboard/settings`

`GET /api/dashboard/summary` includes a redacted `usage` object for the dashboard billing surfaces:

```json
{
  "usage": {
    "plan": "free",
    "seatCount": 1,
    "seatLimit": 1,
    "agentCount": 1,
    "agentLimit": 3,
    "protectedRepoCount": 0,
    "protectedRepoLimit": 1,
    "verificationCount": 42,
    "verificationLimit": 10000,
    "verificationPeriodStart": "2026-05-01T00:00:00.000Z",
    "verificationPeriodResetAt": "2026-06-01T00:00:00.000Z",
    "webhooksEnabled": false,
    "logRetentionDays": 7,
    "stripeSubscriptionStatus": null
  }
}
```

Unlimited limits (`Infinity` internally) serialize to `null` in the JSON payload.

The summary response intentionally omits Stripe customer IDs, subscription IDs, price IDs, raw secrets, and internal database IDs.

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
  baseUrl: "https://www.behalfid.com"
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

When public agent creation is disabled, create agents through the dashboard/console or call `POST /api/agents` with a server-side `BEHALFID_SETUP_TOKEN`. Do not expose setup tokens to browser code or bundled examples.
