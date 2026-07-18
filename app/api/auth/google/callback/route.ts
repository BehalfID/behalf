import { NextResponse, type NextRequest } from "next/server";
import { switchActiveAccount } from "@/lib/accountContext";
import { connectToDatabase } from "@/lib/db";
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
import { resolvePreferredSsoAccountId } from "@/lib/workspaceSso";
import DeveloperUser from "@/models/DeveloperUser";
import OAuthPendingSignup from "@/models/OAuthPendingSignup";

function authErrorRedirect(request: NextRequest, message: string) {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("error", message);
  const response = NextResponse.redirect(url);
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
  await DeveloperUser.updateOne(
    { userId },
    {
      $set: {
        googleSub,
        authProviders: Array.from(providers),
        emailVerified: true
      }
    }
  );
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

  await connectToDatabase();
  const email = normalizeEmail(claims.email);

  let user = await DeveloperUser.findOne({ googleSub: claims.sub })
    .select("+googleSub authProviders email emailVerified onboardingCompletedAt userId")
    .lean();

  if (!user) {
    const byEmail = await DeveloperUser.findOne({ email })
      .select("+googleSub authProviders email emailVerified onboardingCompletedAt userId")
      .lean();
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
    const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
    setDeveloperSessionCookie(response, token);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { ...oauthCookieOptions(0), maxAge: 0 });
    return response;
  }

  const pendingToken = generateSecureToken();
  const pendingId = createPublicId("pend");
  await OAuthPendingSignup.create({
    pendingId,
    googleSub: claims.sub,
    email,
    emailVerified: true,
    firstName: claims.given_name ?? null,
    lastName: claims.family_name ?? null,
    tokenHash: hashPendingSignupToken(pendingToken),
    expiresAt: new Date(Date.now() + PENDING_SIGNUP_TTL_MS)
  });

  const completeUrl = new URL("/auth/complete-profile", request.nextUrl.origin);
  if (state.next) completeUrl.searchParams.set("next", state.next);

  const response = NextResponse.redirect(completeUrl);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { ...oauthCookieOptions(0), maxAge: 0 });
  response.cookies.set(
    GOOGLE_PENDING_SIGNUP_COOKIE,
    `${pendingId}.${pendingToken}`,
    oauthCookieOptions(Math.floor(PENDING_SIGNUP_TTL_MS / 1000))
  );
  return response;
}
