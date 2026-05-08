# BehalfID Site Guard

BehalfID Site Guard is a planned AI access gateway for website owners.

Current BehalfID permission passports answer:

```txt
Is this agent allowed to act for this user?
```

Site Guard should answer:

```txt
Is this AI agent, crawler, or automation allowed to access or act on this website?
```

`llms.txt`-style files can declare a site owner’s intent. Site Guard should enforce access rules only when the website installs an enforcement point: middleware, proxy, worker, gateway, or app route code that calls BehalfID before protected workflows execute.

## Product model

- **Passports** define what agents may do.
- **Gateway enforcement** ensures denied actions fail closed before code runs.
- **Site Guard** applies the same fail-closed model to website-owned routes and workflows.

Site Guard should be separate from the existing agent permission API at first. Do not change `/api/verify` or passport token behavior to support Site Guard.

## Recommended MVP

Build a small site-key authenticated policy check system:

```txt
website middleware / worker
  -> POST /api/site-guard/check
  -> allow / deny / rate-limit / require verified agent
  -> website origin route or blocked response
```

### Models

```ts
Site {
  siteId: string;
  developerUserId: string;
  domain: string;
  status: "active" | "disabled";
  siteKeyHash: string;
  siteKeyPreview: string;
  createdAt: Date;
  updatedAt: Date;
}

SiteAccessRule {
  ruleId: string;
  siteId: string;
  routePattern: string;
  action: "read_public_page" | "summarize_page" | "crawl_bulk" | "submit_form" | "create_account" | "login" | "checkout" | "call_api" | "read_docs" | "custom";
  effect: "allow" | "deny" | "require_verified_agent" | "rate_limit";
  aiTrafficOnly: boolean;
  allowedPurposes: string[];
  blockedPurposes: string[];
  requireCitation: boolean;
  maxRequestsPerWindow?: number;
  notes?: string;
  status: "active" | "disabled";
}

SiteAccessLog {
  logId: string;
  siteId: string;
  route: string;
  method: string;
  userAgent?: string;
  detectedAiAgent?: string;
  verifiedAgentId?: string;
  declaredPurpose?: string;
  action: string;
  decision: "allowed" | "denied" | "rate_limited" | "requires_verified_agent";
  reason: string;
  createdAt: Date;
}
```

### Policy endpoint

```txt
POST /api/site-guard/check
Authorization: Bearer bhf_site_xxx
```

```json
{
  "siteId": "site_123",
  "method": "GET",
  "path": "/docs/api",
  "userAgent": "example-agent",
  "declaredPurpose": "summarize_public_page",
  "agentId": "agent_123",
  "action": "read_public_page"
}
```

```json
{
  "allowed": true,
  "decision": "allowed",
  "reason": "Public page reads are allowed for this route.",
  "siteId": "site_123",
  "ruleId": "rule_123"
}
```

## Security requirements

- Require a site key for every policy check.
- Store only hashed site keys and show raw keys once.
- Do not trust User-Agent, IP, or self-declared provider headers as identity.
- Treat User-Agent AI detection as a weak signal only.
- Do not log cookies, authorization headers, raw query strings, page content, prompts, or request bodies by default.
- Add request body size limits and timeouts.
- Use Redis/Upstash-backed rate limiting for production traffic.
- Do not forward arbitrary URLs or proxy raw requests through BehalfID.
- Never claim Site Guard blocks all AI traffic globally; it only enforces where installed.

## Deferred

- Full reverse proxy/CDN.
- Provider-native agent identity.
- Signed BehalfID agent access credentials.
- Importing or generating `llms.txt`.
- Complex policy language.
- SDK package changes or a separate `@behalfid/site-guard` package.
