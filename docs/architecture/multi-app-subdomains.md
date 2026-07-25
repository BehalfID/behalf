# Multi-app / subdomain architecture (BehalfID website)

## Decision

**Least risk for this codebase: separate Vercel projects (or multiple domains on
one project) pointing at the same root Next.js app first — not true multi-zone
extraction yet.**

Why not multi-zone / immediate `apps/*` Next apps?

- `app/`, `lib/`, and `proxy.ts` are tightly coupled (CSP nonce, workspace
  rewrites, next-intl, DB-backed sessions).
- Splitting into independently built Next apps with `basePath`/`assetPrefix`
  multiplies deploy risk before cookie/DNS staging is proven.
- Claude CLI second-opinion agreed: route via host config first; extract apps
  only after boundaries are clean.

Phase 2 can still land real apps under `apps/{www,auth,app,console,docs}` in
this monorepo. Separate remotes are phase 3 only.

## Route ownership

| Host | Paths |
|------|--------|
| `auth.behalfid.com` | `/login` `/signup` `/auth` `/authenticate` `/forgot-password` `/reset-password` `/verify-email` `/invite` `/passport` `/onboarding` `/logout` + `api/auth/*` `api/passport/*` `api/onboarding/*` `api/invites` `api/consent-ping` |
| `app.behalfid.com` | `/dashboard` `/workspace/*` public `/<slug>/dashboard` + dashboard/billing/verify/webhook APIs |
| `console.behalfid.com` | `/console` + `api/console/*` |
| `www.behalfid.com` | marketing, legal, status, sandbox, design-system |
| `docs.behalfid.com` | `/docs` (optional; may stay on www initially) |

Canonical map + redirect helpers: `lib/subdomainRouting.ts`.

## Cookies / sessions

| Cookie | Today | Multi-subdomain |
|--------|-------|-----------------|
| `behalfid_developer` | Host-only | Set `Domain=.behalfid.com` via `BEHALFID_COOKIE_DOMAIN` so auth → app works |
| `behalfid_console` | Host-only | **Keep host-only** — do not share with auth/app |

Keep `SameSite=Lax`, `Secure`, `HttpOnly`. Subdomains of `behalfid.com` are
same-site; do **not** switch to `SameSite=None`.

Sessions are opaque DB tokens — no JWT issuer rewrite needed across hosts.

## Redirect map

Implemented in `proxy.ts` when `BEHALFID_SUBDOMAIN_ROUTING=1`:

- Out-of-scope path on a known subdomain → **308** to the owning host
- Example: `app.behalfid.com/login` → `auth.behalfid.com/login`
- Example: `www.behalfid.com/dashboard` → `app.behalfid.com/dashboard`

Optional edge config sample: `vercel.subdomains.example.json` (not wired into
production deploy).

## Env reference

```bash
# Off by default — apex single-app deploy unchanged
BEHALFID_SUBDOMAIN_ROUTING=0

# Enable only after DNS + TLS for the hosts below
BEHALFID_SUBDOMAIN_ROUTING=1
BEHALFID_COOKIE_DOMAIN=.behalfid.com

BEHALFID_HOST_WWW=www.behalfid.com
BEHALFID_HOST_AUTH=auth.behalfid.com
BEHALFID_HOST_APP=app.behalfid.com
BEHALFID_HOST_CONSOLE=console.behalfid.com
BEHALFID_HOST_DOCS=docs.behalfid.com

# Optional: force Google OAuth origin (defaults to https://$BEHALFID_HOST_AUTH)
# GOOGLE_OAUTH_BASE_URL=https://auth.behalfid.com
```

### Google OAuth (auth host)

When subdomain routing is on, Sign in with Google uses:

- **Authorized redirect URI:** `https://auth.behalfid.com/api/auth/google/callback`
- **Authorized JavaScript origins:** `https://auth.behalfid.com`, `https://www.behalfid.com`, `https://app.behalfid.com`, `http://localhost:3000`

Do not point `redirect_uri` at the marketing apex/`NEXT_PUBLIC_APP_URL` — that causes `Error 400: redirect_uri_mismatch` after the auth subdomain cutover.

## Rollout sequence

1. DNS + TLS for `auth.` (smallest blast radius).
2. Enable routing on a staging project; verify login cookie Domain.
3. Cut over `app.` then `console.` then www/docs.
4. Only then extract `apps/*` Next projects if still desired.
5. Remotes last.

## Do not do yet

- Do **not** set `BEHALFID_COOKIE_DOMAIN` before all auth/app hosts have HTTPS.
- Do **not** decompose `app/` into multi-zone Next apps in the same PR as DNS cutover.
- Do **not** use `SameSite=None` or loosen CORS/CSP beyond the known hosts.
- Do **not** cut separate git remotes until cookie + redirect staging is green.
- Do **not** broaden `behalfid_console` with a parent Domain.
- Do **not** flip all four subdomains live in one DNS change.

## Related Phase 0 monorepo prep

- npm workspaces: `packages/*` in root `package.json`
- Declared couplings (optional until packages are published to npm):
  - `@behalfid/cli` optional → `@behalfid/egress-proxy`
  - `@behalfid/install` optional → `@behalfid/mcp-runtime`
- Package tests: `packages/egress-proxy/test`, existing `packages/install/test`,
  `packages/github-action/test` via `npm run test:packages`
- Nested `packages/*/package-lock.json` files remain for standalone publish
  workflows; root `npm ci` is the primary install path for CI.
