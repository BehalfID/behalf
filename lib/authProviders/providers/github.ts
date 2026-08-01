import type {
  AuthorizeRequest,
  ExchangeRequest,
  LoginIdentityProvider,
  LoginProviderErrorCode,
  NormalizedLoginIdentity,
  ProviderConfigStatus
} from "@/lib/authProviders/providers/types";
import {
  isSubdomainRoutingEnabled,
  resolveSubdomainHosts
} from "@/lib/subdomainRouting";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_USER_EMAILS_URL = "https://api.github.com/user/emails";
const GITHUB_API_VERSION = "2022-11-28";

/**
 * Only what is needed to identify the person and read their verified email.
 * `read:user` excludes repository and organization access; `user:email` is
 * required because GitHub omits a private primary email from /user.
 */
export const GITHUB_SCOPES = ["read:user", "user:email"] as const;

/** Timeout for provider HTTP calls so a hung GitHub does not hang the callback. */
const PROVIDER_TIMEOUT_MS = 8000;

export const GITHUB_CALLBACK_PATH = "/api/auth/github/callback";

type GitHubUserResponse = {
  id?: unknown;
  login?: unknown;
  name?: unknown;
};

export type GitHubEmailEntry = {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
};

/**
 * `GITHUB_OAUTH_*` is preferred over `GITHUB_*` because `.env.example` already
 * carries GitHub packaging tokens (NPM/Homebrew publishing); an unprefixed
 * `GITHUB_CLIENT_SECRET` next to those reads as if it belonged to release
 * automation. The shorter names are still accepted so an operator who follows
 * the Google naming convention is not left with a silently disabled provider.
 */
export function githubClientId(): string | null {
  return (
    process.env.GITHUB_OAUTH_CLIENT_ID?.trim() || process.env.GITHUB_CLIENT_ID?.trim() || null
  );
}

function githubClientSecret(): string | null {
  return (
    process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim() ||
    process.env.GITHUB_CLIENT_SECRET?.trim() ||
    null
  );
}

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(githubClientId() && githubClientSecret());
}

/**
 * Canonical origin used for GitHub OAuth redirect_uri.
 *
 * With subdomain routing, auth callbacks live on the auth host — never the
 * marketing apex/www URL from NEXT_PUBLIC_APP_URL / APP_BASE_URL. Mirrors
 * googleOAuthBaseUrl so the state cookie set on auth.behalfid.com is present
 * on the callback host. Optional GITHUB_OAUTH_BASE_URL overrides for staging.
 */
export function githubOAuthBaseUrl(requestOrigin?: string): string {
  const explicit = process.env.GITHUB_OAUTH_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  if (isSubdomainRoutingEnabled()) {
    const authHost = resolveSubdomainHosts().auth.trim().toLowerCase();
    if (requestOrigin) {
      try {
        const url = new URL(requestOrigin);
        const host = url.hostname.toLowerCase();
        if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app")) {
          return url.origin;
        }
        if (host === authHost) {
          return url.origin;
        }
      } catch {
        // fall through to configured auth host
      }
    }
    return `https://${authHost}`;
  }

  const configured =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    requestOrigin ||
    "";
  return configured.replace(/\/$/, "");
}

export function githubRedirectUri(requestOrigin: string): string {
  return `${githubOAuthBaseUrl(requestOrigin)}${GITHUB_CALLBACK_PATH}`;
}

function isConfigured(): ProviderConfigStatus {
  if (!githubClientId()) {
    return { configured: false, reason: "GITHUB_OAUTH_CLIENT_ID is not set." };
  }
  if (!githubClientSecret()) {
    return { configured: false, reason: "GITHUB_OAUTH_CLIENT_SECRET is not set." };
  }
  return { configured: true };
}

function buildAuthorizeUrl(request: AuthorizeRequest): string {
  const clientId = githubClientId();
  if (!clientId) {
    throw new Error("GitHub OAuth is not configured.");
  }

  // GitHub's OAuth App flow does not implement RFC 7636. Sending a challenge
  // would be silently ignored and would imply a protection that is not there,
  // so it is omitted. Replay protection comes from the single-use server-side
  // state bound to an httpOnly cookie. See docs/AUTH_PROVIDERS.md.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: githubRedirectUri(request.requestOrigin),
    scope: GITHUB_SCOPES.join(" "),
    state: request.state,
    allow_signup: "false"
  });

  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function githubApiHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "BehalfID"
  };
}

/**
 * Exchanges the code for an access token, reads the identity, and discards the
 * token. The token is never returned to callers, never written to a response,
 * and never persisted: BehalfID performs no ongoing GitHub API work on the
 * user's behalf, so storing it would create a credential with no matching need.
 */
async function exchangeCodeForIdentity(
  request: ExchangeRequest
): Promise<{ identity: NormalizedLoginIdentity } | { error: LoginProviderErrorCode }> {
  const clientId = githubClientId();
  const clientSecret = githubClientSecret();
  if (!clientId || !clientSecret) {
    return { error: "provider_not_configured" };
  }

  const tokenResponse = await fetchWithTimeout(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "BehalfID"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: request.code,
      redirect_uri: githubRedirectUri(request.requestOrigin)
    }).toString()
  });

  if (!tokenResponse?.ok) {
    return { error: "exchange_failed" };
  }

  // GitHub returns HTTP 200 with an `error` body for invalid codes, so the
  // presence of access_token is the only reliable success signal.
  const tokenJson = (await tokenResponse.json().catch(() => null)) as {
    access_token?: unknown;
  } | null;
  const accessToken = typeof tokenJson?.access_token === "string" ? tokenJson.access_token : "";
  if (!accessToken) {
    return { error: "exchange_failed" };
  }

  const userResponse = await fetchWithTimeout(GITHUB_USER_URL, {
    headers: githubApiHeaders(accessToken)
  });
  if (!userResponse?.ok) {
    return { error: "identity_unavailable" };
  }

  const user = (await userResponse.json().catch(() => null)) as GitHubUserResponse | null;
  // GitHub's numeric id is immutable; `login` is not. Keying on the id means a
  // username change — or a released username being re-registered by someone
  // else — cannot move an account between people.
  const providerAccountId =
    typeof user?.id === "number" && Number.isSafeInteger(user.id) && user.id > 0
      ? String(user.id)
      : "";
  if (!providerAccountId) {
    return { error: "identity_unavailable" };
  }

  const emailsResponse = await fetchWithTimeout(GITHUB_USER_EMAILS_URL, {
    headers: githubApiHeaders(accessToken)
  });
  const emails = emailsResponse?.ok
    ? ((await emailsResponse.json().catch(() => null)) as GitHubEmailEntry[] | null)
    : null;

  const verifiedPrimary = pickVerifiedPrimaryEmail(emails);
  const { firstName, lastName } = splitDisplayName(
    typeof user?.name === "string" ? user.name : null
  );

  return {
    identity: {
      provider: "github",
      providerAccountId,
      username: typeof user?.login === "string" ? user.login.slice(0, 120) : null,
      email: verifiedPrimary,
      emailVerified: Boolean(verifiedPrimary),
      firstName,
      lastName
    }
  };
}

/**
 * Returns the primary email only when GitHub reports it verified.
 *
 * An unverified provider email is not proof of address ownership: accepting one
 * would let anyone who can create a GitHub account claim an address they do not
 * control, and from there claim a BehalfID workspace.
 */
export function pickVerifiedPrimaryEmail(entries: GitHubEmailEntry[] | null): string | null {
  if (!Array.isArray(entries)) return null;

  const verified = entries
    .map((entry) => ({
      email:
        typeof entry?.email === "string" ? entry.email.trim().toLowerCase().slice(0, 254) : "",
      primary: entry?.primary === true,
      verified: entry?.verified === true
    }))
    .filter((entry) => entry.email && entry.verified);

  return verified.find((entry) => entry.primary)?.email ?? verified[0]?.email ?? null;
}

export function splitDisplayName(name: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0].slice(0, 80),
    lastName: parts.length > 1 ? parts.slice(1).join(" ").slice(0, 80) : null
  };
}

export const githubLoginProvider: LoginIdentityProvider = {
  id: "github",
  displayName: "GitHub",
  principalKind: "human_login",
  scopes: GITHUB_SCOPES,
  supportsPkce: false,
  isConfigured,
  buildAuthorizeUrl,
  exchangeCodeForIdentity
};
