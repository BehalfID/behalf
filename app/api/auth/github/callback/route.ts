import { NextResponse, type NextRequest } from "next/server";
import { switchActiveAccount } from "@/lib/accountContext";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import type { OAuthErrorCode } from "@/lib/authProviders/oauthErrors";
import {
  clearedOAuthCookie,
  consumeOAuthState,
  OAUTH_MFA_COOKIE,
  OAUTH_PENDING_SIGNUP_COOKIE,
  OAUTH_PENDING_SIGNUP_TTL_MS,
  OAUTH_STATE_COOKIE,
  oauthCookieOptions,
  safeOAuthNextPath
} from "@/lib/authProviders/oauthState";
import {
  linkIdentity,
  resolveProviderLogin,
  touchIdentityLogin
} from "@/lib/authProviders/externalIdentityService";
import { getLoginProvider } from "@/lib/authProviders/providers/registry";
import type { NormalizedLoginIdentity } from "@/lib/authProviders/providers/types";
import {
  createDeveloperSession,
  DEVELOPER_SESSION_COOKIE_NAME,
  generateSecureToken,
  getDeveloperFromToken,
  hashEmailToken,
  isEmailVerified,
  setDeveloperSessionCookie
} from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { resolvePreferredSsoAccountId } from "@/lib/workspaceSso";
import * as oauthPending from "@/lib/repositories/oauthPending";
import * as users from "@/lib/repositories/users";

const SETTINGS_PATH = "/dashboard/settings";

function withCleanState(response: NextResponse) {
  response.cookies.set(OAUTH_STATE_COOKIE, "", clearedOAuthCookie());
  return response;
}

function errorRedirect(
  request: NextRequest,
  code: OAuthErrorCode,
  target: "login" | "settings"
) {
  const url = new URL(target === "settings" ? SETTINGS_PATH : "/login", request.nextUrl.origin);
  url.searchParams.set("oauth_error", code);
  if (target === "settings") url.hash = "account-security";
  return withCleanState(NextResponse.redirect(url));
}

function postLoginPath(options: {
  next?: string | null;
  emailVerified: boolean;
  onboardingCompleted: boolean;
}): string {
  if (!options.emailVerified) return "/verify-email";
  if (!options.onboardingCompleted) return "/onboarding";
  return safeOAuthNextPath(options.next) ?? "/dashboard";
}

export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const provider = getLoginProvider("github");
  if (!provider?.isConfigured().configured) {
    return errorRedirect(request, "provider_unconfigured", "login");
  }

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    // GitHub reports user cancellation and consent denial the same way.
    return errorRedirect(request, "access_denied", "login");
  }

  const code = params.get("code");
  const stateParam = params.get("state");
  if (!code || !stateParam) {
    return errorRedirect(request, "invalid_state", "login");
  }

  // Consuming the state before the code exchange means a replayed callback is
  // rejected without ever reaching GitHub.
  const state = await consumeOAuthState({
    provider: "github",
    stateFromProvider: stateParam,
    stateFromCookie: request.cookies.get(OAUTH_STATE_COOKIE)?.value
  });
  if (!state) {
    return errorRedirect(request, "invalid_state", "login");
  }

  const linkFlow = state.mode === "link";
  const errorTarget = linkFlow ? "settings" : "login";

  const exchanged = await provider.exchangeCodeForIdentity({
    requestOrigin: request.nextUrl.origin,
    code,
    codeVerifier: state.codeVerifier
  });
  if ("error" in exchanged) {
    return errorRedirect(request, "provider_error", errorTarget);
  }

  const identity = exchanged.identity;

  if (linkFlow) {
    // Re-read the session rather than trusting state.userId alone: the browser
    // may have signed out or switched accounts during the provider round trip,
    // and the link must land on the account that is actually signed in now.
    const context = await getDeveloperFromToken(
      request.cookies.get(DEVELOPER_SESSION_COOKIE_NAME)?.value
    );
    if (!context || context.user.userId !== state.userId) {
      return errorRedirect(request, "session_required", "settings");
    }

    const result = await linkIdentity({
      userId: context.user.userId,
      identity,
      request,
      context: "oauth_callback"
    });
    if (!result.ok) {
      return errorRedirect(request, result.code, "settings");
    }

    const url = new URL(safeOAuthNextPath(state.next) ?? SETTINGS_PATH, request.nextUrl.origin);
    url.searchParams.set("oauth_linked", "github");
    url.hash = "account-security";
    return withCleanState(NextResponse.redirect(url));
  }

  const resolution = await resolveProviderLogin(identity);

  if (resolution.kind === "email_unverified") {
    return errorRedirect(request, "email_unverified", "login");
  }

  if (resolution.kind === "requires_explicit_link") {
    return errorRedirect(request, "requires_explicit_link", "login");
  }

  if (resolution.kind === "existing_identity") {
    return signInExistingUser(request, resolution.userId, identity, state.next);
  }

  return startPendingSignup(request, identity, resolution.email, state.next);
}

async function signInExistingUser(
  request: NextRequest,
  userId: string,
  identity: NormalizedLoginIdentity,
  next: string | null
) {
  const user = await users.findByUserId(userId);
  if (!user) {
    // The identity row outlived its account. Treat as an unusable identity
    // rather than minting a session for a userId that no longer resolves.
    return errorRedirect(request, "provider_error", "login");
  }

  await touchIdentityLogin({
    provider: "github",
    providerAccountId: identity.providerAccountId,
    identity
  });
  await recordIdentityAudit({
    userId,
    action: "identity_login",
    provider: "github",
    providerAccountId: identity.providerAccountId,
    providerUsername: identity.username,
    request,
    context: "oauth_callback"
  });
  const { updateAccountLastSignIn } = await import("@/lib/authProviders/authUsage");
  await updateAccountLastSignIn({
    userId,
    method: "github",
    request
  });

  // A second factor is a property of the account, not of the sign-in method.
  // Skipping it for OAuth would turn "connect GitHub" into an MFA bypass.
  // MFA columns are not yet on the Postgres developer_users schema.
  const mfaEnabled = Boolean((user as { mfaEnabledAt?: Date | null }).mfaEnabledAt);
  if (mfaEnabled) {
    const { createMfaChallengeToken } = await import("@/lib/mfa");
    const challengeToken = await createMfaChallengeToken(userId);
    const url = new URL("/login", request.nextUrl.origin);
    url.searchParams.set("oauth_mfa", "1");
    const response = withCleanState(NextResponse.redirect(url));
    // The challenge travels in an httpOnly cookie rather than the query string
    // so it is not written to browser history, referrers, or proxy logs.
    response.cookies.set(OAUTH_MFA_COOKIE, challengeToken, oauthCookieOptions(5 * 60));
    return response;
  }

  const { token, session } = await createDeveloperSession(userId);
  const preferredAccountId = await resolvePreferredSsoAccountId(userId, user.email);
  if (preferredAccountId) {
    await switchActiveAccount(userId, session.sessionId, preferredAccountId);
  }

  const destination = postLoginPath({
    next,
    emailVerified: isEmailVerified(user.emailVerified),
    onboardingCompleted: Boolean(user.onboardingCompletedAt)
  });
  const response = withCleanState(
    NextResponse.redirect(new URL(destination, request.nextUrl.origin))
  );
  setDeveloperSessionCookie(response, token);
  return response;
}

async function startPendingSignup(
  request: NextRequest,
  identity: NormalizedLoginIdentity,
  email: string,
  next: string | null
) {
  const pendingToken = generateSecureToken();
  const pendingId = createPublicId("pend");

  await oauthPending.createPendingSignup({
    pendingId,
    provider: "github",
    providerAccountId: identity.providerAccountId,
    email,
    emailVerified: true,
    firstName: identity.firstName ?? null,
    lastName: identity.lastName ?? null,
    tokenHash: hashEmailToken(pendingToken),
    expiresAt: new Date(Date.now() + OAUTH_PENDING_SIGNUP_TTL_MS)
  });

  const completeUrl = new URL("/auth/complete-profile", request.nextUrl.origin);
  completeUrl.searchParams.set("provider", "github");
  const safeNext = safeOAuthNextPath(next);
  if (safeNext) completeUrl.searchParams.set("next", safeNext);

  const response = withCleanState(NextResponse.redirect(completeUrl));
  response.cookies.set(
    OAUTH_PENDING_SIGNUP_COOKIE,
    `${pendingId}.${pendingToken}`,
    oauthCookieOptions(Math.floor(OAUTH_PENDING_SIGNUP_TTL_MS / 1000))
  );
  return response;
}
