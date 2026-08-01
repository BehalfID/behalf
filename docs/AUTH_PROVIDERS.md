# Auth provider architecture

BehalfID authenticates several distinct **principal kinds**. They must not be collapsed into one abstraction: an enterprise SSO assertion, a personal OAuth login, a repository installation, an API token, and an agent identity each answer a different accountability question and have different revocation stories.

## Principal kinds

| Kind | Example | Establishes human session? | Linkable in account settings? |
| --- | --- | --- | --- |
| `human_login` | Password, GitHub, Google, Passkey | Yes | Yes (GitHub today; Google migration planned; passkeys in settings) |
| `enterprise_sso` | Google Workspace domain enforce | Yes (via Google OIDC) | No — workspace policy, not a personal link |
| `repo_installation` | GitHub App on a repository | No | No |
| `api_token` | Developer API token | No (programmatic) | No |
| `agent_identity` | Registered agent via enforcement path | No | No |

Implementation: `lib/authProviders/principals.ts`.

## Human login providers

### Storage model

Linked login identities live in **`external_identities`**, not as nullable columns on `developer_users`:

- `(provider, providerAccountId)` is unique globally — one provider account maps to at most one BehalfID user.
- `(userId, provider)` is unique — one identity per provider per user.
- **`providerAccountId` is immutable at the provider** (GitHub numeric user ID, Google `sub`). Usernames and emails are display metadata only.

There is intentionally **no `githubId` column** on `DeveloperUser`. Adding a column per provider does not scale and cannot express cross-account conflicts as a database constraint.

`DeveloperUser.authProviders` remains a fast denormalized hint (`password`, `github`, `google`, `passkey`) for “does this account have a password?” checks. The link table is authoritative for OAuth; `passkey_credentials` is authoritative for WebAuthn.

### OAuth flow (GitHub)

1. Browser hits **`GET /api/auth/github`** — creates a server-side authorization state (scrypt hash stored; secret returned as `state`), sets an httpOnly **`behalfid_oauth_state`** cookie, redirects to GitHub.
2. GitHub redirects to **`GET /api/auth/github/callback`** with `code` + `state`.
3. Callback **consumes state atomically** (provider `state` must match cookie; single-use via `consumedAt`).
4. Server exchanges the code for an access token **server-side only**, reads identity + verified email, **discards the token** (never persisted, never sent to the client).
5. Resolution:
   - Known identity → sign in (MFA still required if enabled).
   - Unknown identity + verified email already on an account → **non-enumerating** redirect: sign in, then connect in Settings.
   - Unknown identity + unclaimed verified email → pending signup → **`POST /api/auth/github/complete`** (DOB + CSRF origin check) → same registration path as password signup (`createDeveloperAccount`), **no domain auto-join**.

**GitHub OAuth Apps do not implement RFC 7636 PKCE.** Replay protection comes from single-use crypto state bound to an httpOnly cookie. A PKCE verifier is still generated and stored server-side for providers that support it (future Google migration).

Scopes: **`read:user`**, **`user:email`** only.

### Passkeys / WebAuthn

Passkeys are an optional additional human login method. They are **not** stored in `external_identities` (they are authenticator credentials, not OIDC subjects).

- Library: `@simplewebauthn/server` + `@simplewebauthn/browser`
- RP ID / origin: derived from `APP_BASE_URL` (or `NEXT_PUBLIC_APP_URL`); production binds to the configured apex (e.g. `behalfid.com` / `https://behalfid.com`). Arbitrary Vercel preview hosts are not accepted.
- `userVerification: required`; attestation `none` (privacy-preserving)
- Discoverable / usernameless sign-in is supported on the login page
- Challenges are short-lived (5 minutes), hashed at rest, single-use
- **Recovery:** passkey-only accounts are blocked — a password or linked OAuth provider must remain. Users may add passkeys only when a non-passkey recovery method already exists.

Migration: `drizzle/0008_passkeys_auth_usage.sql` (additive; safe to apply before app deploy).

### Account linking policy

| Scenario | Behavior |
| --- | --- |
| Unauthenticated sign-in, email matches existing account | Refuse silent merge; user-facing copy does not confirm account existence |
| Authenticated link from Settings | Attach identity to current session |
| Identity already linked elsewhere | Reject; audit `identity_link_rejected` |
| Unlink | Allowed only if a non-passkey recovery method remains (password or another OAuth provider) |
| Same email, unlinked provider | “Sign in, then connect in Settings” |

All link/unlink/register/login events write to **`identity_audit_logs`** (durable, user-attributed). Brute-force telemetry stays in `auth_events` (TTL, IP-hashed, no subject).

### Account-level last sign-in

Successful authentication updates `developer_users.last_sign_in_at` / `last_sign_in_method` / `last_sign_in_user_agent`, plus method-specific timestamps (`password_last_used_at`, `external_identities.last_login_at`, `passkey_credentials.last_used_at`). Unknown history displays as “Last used unknown” — never fabricated from `createdAt`.

Last-method safety is centralized in `lib/authProviders/loginMethodSafety.ts` and used by GitHub unlink and passkey removal.

### Google (current vs planned)

Google OIDC today uses a **legacy parallel route** (`/api/auth/google/*`) with `google_sub` on `developer_users`. Migration to `external_identities` is sequenced separately because that route also carries **workspace SSO enforcement** (`lib/workspaceSso.ts`) — an account-level policy, not a personal linked identity.

**Planned order after GitHub stabilizes:**

1. Google personal login → `external_identities` adapter in `lib/authProviders/providers/`
2. Microsoft personal login (OIDC, same adapter pattern)
3. Enterprise SAML/OIDC (workspace-scoped, not linkable)

## Environment variables

| Variable | Purpose |
| --- | --- |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App client ID (preferred) |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App secret (server-only) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Accepted aliases; `GITHUB_OAUTH_*` preferred because `.env.example` already uses `GITHUB_*` for release automation tokens |
| `APP_BASE_URL` / `NEXT_PUBLIC_APP_URL` | WebAuthn RP base (apex). GitHub/Google `redirect_uri` use auth host when `BEHALFID_SUBDOMAIN_ROUTING=1` |
| `GITHUB_OAUTH_BASE_URL` | Optional override for GitHub OAuth origin (no path) |
| `WEBAUTHN_RP_NAME` | Optional RP display name (default `BehalfID`) |

When GitHub OAuth is unset, **password auth is unaffected** — GitHub buttons are hidden and `/api/auth/github` returns 503. When `APP_BASE_URL` is unset, passkey registration/authentication returns 503 without affecting other methods.

## Code map

| Area | Location |
| --- | --- |
| Provider adapters | `lib/authProviders/providers/` |
| Link/unlink/resolve | `lib/authProviders/externalIdentityService.ts` |
| Passkeys | `lib/authProviders/passkeyService.ts`, `lib/authProviders/webauthnConfig.ts` |
| Login-method safety | `lib/authProviders/loginMethodSafety.ts` |
| Usage tracking | `lib/authProviders/authUsage.ts` |
| OAuth state + PKCE storage | `lib/authProviders/oauthState.ts` |
| User-facing error codes | `lib/authProviders/oauthErrors.ts` |
| Mongo models | `models/ExternalIdentity.ts`, `PasskeyCredential.ts`, `WebAuthnChallenge.ts`, `IdentityAuditLog.ts` |
| Postgres migrations | Applied on production Supabase via `supabase_migrations.schema_migrations` through `passkeys_auth_usage` (+ MFA / console / adaptive follow-ups). Repo SQL: `drizzle/0007_external_identities.sql`, `drizzle/0008_passkeys_auth_usage.sql`, `drizzle/0010_developer_user_mfa.sql` |
| Routes | `app/api/auth/github/*`, `app/api/auth/passkey/*`, `app/api/auth/passkeys`, `app/api/auth/identities/*` |
| UI | `components/auth/ContinueWithGitHub.tsx`, `ContinueWithPasskey.tsx`, `components/dashboard/LinkedAccountsSection.tsx` |
