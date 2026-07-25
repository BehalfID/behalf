# Multi-app website layout (scaffolding)

This directory is the **planned home** for separate Next.js apps after subdomain
boundaries are proven on staging. **Today the live website still deploys from the
repo root** (`app/`, `lib/`, `proxy.ts`). Do not move routes here yet.

## Target apps (phase 2)

| Directory        | Public host             | Owns |
|------------------|-------------------------|------|
| `apps/www`       | `www.behalfid.com`      | Marketing, legal, status, sandbox |
| `apps/docs`      | `docs.behalfid.com`     | `/docs` (optional split from www) |
| `apps/auth`      | `auth.behalfid.com`     | Login/signup/password/invite/onboarding |
| `apps/app`       | `app.behalfid.com`      | Dashboard + workspace URLs |
| `apps/console`   | `console.behalfid.com`  | Internal console |

## Phase 1 (current — safe)

Keep **one** Next.js app at repo root. Optionally attach multiple Vercel
projects/domains to that same build and enable:

```bash
BEHALFID_SUBDOMAIN_ROUTING=1
BEHALFID_COOKIE_DOMAIN=.behalfid.com   # only after TLS on all auth/app hosts
BEHALFID_HOST_AUTH=auth.behalfid.com
BEHALFID_HOST_APP=app.behalfid.com
BEHALFID_HOST_CONSOLE=console.behalfid.com
BEHALFID_HOST_WWW=www.behalfid.com
BEHALFID_HOST_DOCS=docs.behalfid.com
```

Redirect map + ownership live in `lib/subdomainRouting.ts` and are enforced from
`proxy.ts` when routing is enabled.

See `docs/architecture/multi-app-subdomains.md` for the full plan, cookie rules,
and do-not-do-yet list.

## Placeholders

Each subdirectory has a stub `package.json` marking future ownership. They are
not buildable Next apps yet.
