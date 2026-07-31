import { NextResponse, type NextRequest } from "next/server";
import { switchActiveAccount } from "@/lib/accountContext";
import {
  createDeveloperSession,
  generateSecureToken,
  isEmailVerified,
  normalizeEmail,
  setDeveloperSessionCookie
} from "@/lib/developerAuth";
import {
  exchangeGoogleAuthorizationCode,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_PENDING_SIGNUP_COOKIE,
  hashPendingSignupToken,
  oauthCookieOptions,
  parseOAuthStateCookie,
  PENDING_SIGNUP_TTL_MS,
  safeOAuthNextPath,
  verifyGoogleIdToken
} from "@/lib/googleOAuth";
import { createPublicId } from "@/lib/ids";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { resolveOwnedHref } from "@/lib/subdomainRouting";
import { resolvePreferredSsoAccountId } from "@/lib/workspaceSso";
import * as externalIdentities from "@/lib/repositories/externalIdentities";
import * as oauthPending from "@/lib/repositories/oauthPending";
import * as users from "@/lib/repositories/users";

function ownedRedirect(request: NextRequest, pathWithSearch: string) {
  const resolved = resolveOwnedHref(pathWithSearch, {
    hostname: request.nextUrl.hostname,
    protocol: request.nextUrl.protocol
  });
  return NextResponse.redirect(
    resolved.startsWith("http") ? resolved : new URL(pathWithSearch, request.nextUrl.origin)
  );
}

function authErrorRedirect(request: NextRequest, message: string) {
  const response = ownedRedirect(
    request,
    `/login?error=${encodeURIComponent(message)}`
  );
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { ...oauthCookieOptions(0), maxAge: 0 });
  return response;
}

function postLoginPath(options: {
  next?: string;
  emailVerified: boolean;
  onboardingCompleted: boolean;
}): string {
  const next = safeOAuthNextPath(options.next);
  if (!options.emailVerified) return "/verify-email";
  if (!options.onboardingCompleted) return "/onboarding";
  return next ?? "/dashboard";
}

async function ensureGoogleLinkedProviders(
  userId: string,
  googleSub: string,
  existingProviders: string[] | null | undefined
) {
  const providers = new Set(existingProviders?.length ? existingProviders : ["password"]);
  providers.add("google");
  await users.updateUser(userId, {
    googleSub,
    authProviders: Array.from(providers),
    emailVerified: true
  });
}

export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return authErrorRedirect(request, "Google sign-in was cancelled.");
  }
  if (!code || !stateParam) {
    return authErrorRedirect(request, "Google sign-in failed.");
  }

  const stateCookie = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const state = parseOAuthStateCookie(stateCookie);
  if (!state || stateCookie !== stateParam) {
    return authErrorRedirect(request, "Google sign-in session expired. Please try again.");
  }

  const exchanged = await exchangeGoogleAuthorizationCode({
    code,
    codeVerifier: state.v,
    requestOrigin: request.nextUrl.origin
  });
  if ("error" in exchanged) {
    return authErrorRedirect(request, exchanged.error);
  }

  const claims = await verifyGoogleIdToken(exchanged.idToken);
  if (!claims) {
    return authErrorRedirect(request, "Google identity could not be verified.");
  }

  const email = normalizeEmail(claims.email);

  let user = await users.findByGoogleSub(claims.sub);

  if (!user) {
    const byEmail = await users.findByEmail(email);
    if (byEmail && isEmailVerified(byEmail.emailVerified)) {
      await ensureGoogleLinkedProviders(byEmail.userId, claims.sub, byEmail.authProviders as string[] | undefined);
      user = { ...byEmail, googleSub: claims.sub, emailVerified: true };
    } else if (byEmail) {
      return authErrorRedirect(
        request,
        "An account with this email already exists. Verify your email or sign in with your password first."
      );
    }
  }

  if (user) {
    const { updateAccountLastSignIn } = await import("@/lib/authProviders/authUsage");
    await updateAccountLastSignIn({
      userId: user.userId,
      method: "google",
      request
    });
    const { recordIdentityAudit } = await import("@/lib/authProviders/identityAudit");
    await recordIdentityAudit({
      userId: user.userId,
      action: "identity_login",
      provider: "google",
      providerAccountId: claims.sub,
      providerUsername: email,
      request,
      context: "oauth_callback"
    });
    // Best-effort: refresh external_identities lastLoginAt when the row exists.
    try {
      await externalIdentities.touchLoginMetadata("google", claims.sub, {
        lastLoginAt: new Date(),
        providerEmail: email,
        providerEmailVerified: true
      });
    } catch {
      /* ignore */
    }

    const { token, session } = await createDeveloperSession(user.userId);
    const preferredAccountId = await resolvePreferredSsoAccountId(user.userId, email);
    if (preferredAccountId) {
      await switchActiveAccount(user.userId, session.sessionId, preferredAccountId);
    }

    const destination = postLoginPath({
      next: state.next,
      emailVerified: true,
      onboardingCompleted: Boolean(user.onboardingCompletedAt)
    });
    const response = ownedRedirect(request, destination);
    setDeveloperSessionCookie(response, token);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { ...oauthCookieOptions(0), maxAge: 0 });
    return response;
  }

  const pendingToken = generateSecureToken();
  const pendingId = createPublicId("pend");
  await oauthPending.createPendingSignup({
    pendingId,
    googleSub: claims.sub,
    provider: "google",
    providerAccountId: claims.sub,
    email,
    emailVerified: true,
    firstName: claims.given_name ?? null,
    lastName: claims.family_name ?? null,
    tokenHash: hashPendingSignupToken(pendingToken),
    expiresAt: new Date(Date.now() + PENDING_SIGNUP_TTL_MS)
  });

  const completePath = state.next
    ? `/auth/complete-profile?next=${encodeURIComponent(state.next)}`
    : "/auth/complete-profile";
  const response = ownedRedirect(request, completePath);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { ...oauthCookieOptions(0), maxAge: 0 });
  response.cookies.set(
    GOOGLE_PENDING_SIGNUP_COOKIE,
    `${pendingId}.${pendingToken}`,
    oauthCookieOptions(Math.floor(PENDING_SIGNUP_TTL_MS / 1000))
  );
  return response;
}
