# Caching policy

BehalfID caches only data whose scope and freshness are explicit.

| Data | Scope | Lifetime | Invalidation | Classification |
| --- | --- | --- | --- | --- |
| Hashed Next.js assets (`/_next/static`) | Browser and shared cache | Framework-managed immutable | New build hash | Public, immutable |
| Named brand images | Browser and shared cache | 1 day browser, 7 days shared | Bounded expiry or renamed asset | Public |
| Robots, sitemap, `llms.txt`, ATProto DID | Browser and shared cache | 1 hour browser, 1 day shared | Bounded expiry/deploy | Public |
| `install.sh` | Shared cache only | 5 minutes | Bounded expiry/deploy | Public executable |
| Successful public status API | Shared cache only | 15 seconds | Bounded expiry | Public operational |
| Server Component auth/workspace/onboarding lookups | React render/request | One render | Automatic at request end | Private request memo |
| Authenticated HTML, APIs, errors, health, and mutations | None | `private, no-store` | Not applicable | Private/sensitive |

Never shared-cache session, user, workspace, agent, permission, approval,
verification, credential, token, billing, membership, Site Guard, webhook,
console, or authorization-decision data. Public pages currently include a
cookie-derived navigation action and a request-specific CSP nonce, so their HTML
must remain dynamic and non-shared even when the page body is stable.

React `cache()` is allowed for repeated Server Component reads because React
clears it per server request. Do not replace it with module-global maps or a
persistent cache. Authorization and operational mutations continue to take
effect on the next request.
