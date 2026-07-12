# Workspace URL Routing (v1)

Human-facing workspace URLs for the developer dashboard. **Do not tell pilot users to use the new URL shape until this is deployed and verified in the target environment.**

## Tenancy model

- **Account** remains the tenant. All resources stay scoped by `accountId`.
- **AccountMembership** controls who can access a workspace and with which role.
- `accountId` is the internal / API identity (stable, opaque).
- `slug` is the human-facing URL identity (unique, lowercase, DNS-label shaped).

## URL shapes

| Surface | Shape | Notes |
| --- | --- | --- |
| Public dashboard | `/<slug>/dashboard/...` | What users bookmark and share |
| Internal App Router | `/workspace/<slug>/dashboard/...` | Proxy rewrite target for UI |
| Public dashboard API | `/<slug>/api/dashboard/...` (and `/api/billing/...`) | Rewritten to `/api/dashboard/...` with a trusted slug header |
| Legacy entry | `/dashboard/...` | Temporary redirect to the active workspace slug URL |

Proxy helpers: `matchWorkspacePublicPath` / `buildWorkspaceRewritePath` in `proxy.ts`.

## Trusted slug header

Workspace-scoped API rewrites set `x-behalf-workspace-slug` (see `WORKSPACE_SLUG_HEADER` in `lib/workspaceSlug.ts`).

- Only the proxy may set this header; client-supplied values are stripped on the way in.
- `requireDeveloperApi` / `requireWorkspaceDeveloperApi` prefer the trusted header over session `activeAccountId` for that request.
- Membership is always re-checked for the resolved slug (`requireWorkspaceMembershipBySlug`).

## Reserved slug policy

Slugs must not collide with product routes, locale prefixes, or common system paths. Key reserved values include:

`api`, `dashboard`, `login`, `logout`, `signup`, `onboarding`, `docs`, `blog`, `legal`, `admin`, `app`, `www`, `_next`, and locale codes `en` / `de` / `es` / `fr`.

Full list: `isReservedWorkspaceSlug` / `listReservedWorkspaceSlugs` in `lib/workspaceSlug.ts` (includes `routing.locales`).

## Slug immutability (v1)

Once an account has a valid slug, v1 does **not** change it when the company/display name changes. `ensureAccountHasSlug` returns the existing slug and only assigns a slug when missing.

## Multi-tab request scoping

Session `activeAccountId` is still the legacy switcher default. When a request arrives via `/<slug>/api/...`, tenancy for **that request** comes from the trusted slug header after membership verification. Two tabs on different workspace URLs can therefore hit different `activeAccountId` values without fighting over a single session write.

## Operator backfill

Assign missing slugs before relying on public workspace URLs:

```bash
npm run workspace-slugs:backfill -- --dry-run
npm run workspace-slugs:backfill -- --confirm
```

Run dry-run first; confirm only after reviewing the planned writes.

## Rollback considerations

- Keep legacy `/dashboard` redirects until traffic has moved.
- Proxy can stop rewriting `/<slug>/...` without deleting stored slugs.
- API callers without the trusted header continue to use session `activeAccountId`.
- Do not delete or rename production slugs casually — bookmarks and shared links depend on them.

## Related code

- `lib/workspaceSlug.ts` — client-safe normalize / validate / href helpers
- `lib/workspaceSlugServer.ts` — `generateUniqueWorkspaceSlug`, `ensureAccountHasSlug` (server-only)
- `lib/accountContext.ts` — `resolveWorkspaceForUserBySlug`, `requireWorkspaceMembershipBySlug`
- `lib/developerAuth.ts` — request-scoped slug preference in `requireDeveloperApi`
- `proxy.ts` — public path match + rewrite
- `app/dashboard/guard.tsx` — temporary legacy `/dashboard` → `/<slug>/dashboard` redirect
- `app/workspace/[workspaceSlug]/dashboard/**` — internal dashboard route namespace

## Dashboard API audit (v1)

All routes under `app/api/dashboard/**` obtain tenancy from `requireDeveloperApi` / `getRequestAccountId(auth)`. When the trusted workspace slug header is present, `activeAccountId` is set from membership-verified slug resolution for that request only. No dashboard route accepts `accountId` from query/body as the tenancy source. Billing under `/api/billing/**` is similarly scoped when requested via `/<slug>/api/billing/**`.
