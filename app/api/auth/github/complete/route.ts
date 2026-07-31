import { NextResponse, type NextRequest } from "next/server";
import { createDeveloperAccount } from "@/lib/account";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import {
  clearedOAuthCookie,
  OAUTH_PENDING_SIGNUP_COOKIE,
  safeOAuthNextPath
} from "@/lib/authProviders/oauthState";
import { timingSafeEqualString } from "@/lib/crypto";
import {
  createDeveloperSession,
  hashEmailToken,
  normalizeEmail,
  requireDashboardMutationOrigin,
  setDeveloperSessionCookie
} from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { checkAuthRateLimit, checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { DuplicateKeyError } from "@/lib/repositories/errors";
import * as externalIdentities from "@/lib/repositories/externalIdentities";
import * as oauthPending from "@/lib/repositories/oauthPending";
import * as users from "@/lib/repositories/users";

const MIN_AGE_YEARS = 13;

/** Identical wording for "email taken" and "identity taken" so neither is an oracle. */
const REGISTRATION_CONFLICT =
  "Unable to complete registration. If an account already exists, sign in instead.";

function clearPendingCookie(response: NextResponse) {
  response.cookies.set(OAUTH_PENDING_SIGNUP_COOKIE, "", clearedOAuthCookie());
  return response;
}

/**
 * Finishes a GitHub-initiated registration.
 *
 * Split from the callback because the callback runs on a provider redirect
 * (a GET with no CSRF protection available), while account creation needs the
 * same age confirmation and same-origin check as password signup.
 */
export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["dateOfBirth", "next"]);
  if (unknownError) return jsonError(unknownError);

  const dateOfBirth = readString(body.dateOfBirth);
  if (!dateOfBirth) return jsonError("Date of birth is required.");
  const dobDate = new Date(dateOfBirth);
  if (Number.isNaN(dobDate.getTime())) return jsonError("Date of birth is invalid.");
  const minAgeDate = new Date();
  minAgeDate.setFullYear(minAgeDate.getFullYear() - MIN_AGE_YEARS);
  if (dobDate > minAgeDate) {
    return jsonError(`You must be at least ${MIN_AGE_YEARS} years old to create an account.`);
  }

  const rawPending = request.cookies.get(OAUTH_PENDING_SIGNUP_COOKIE)?.value;
  const [pendingId, pendingToken] = (rawPending ?? "").split(".");
  if (!pendingId || !pendingToken) {
    return clearPendingCookie(
      jsonError("GitHub sign-up session expired. Start again.", 401)
    );
  }

  const pending = await oauthPending.findByPendingId(pendingId, { includeTokenHash: true });

  if (
    !pending ||
    pending.provider !== "github" ||
    new Date(pending.expiresAt).getTime() < Date.now()
  ) {
    if (pending) await oauthPending.deleteByPendingId(pendingId);
    return clearPendingCookie(
      jsonError("GitHub sign-up session expired. Start again.", 401)
    );
  }

  if (!timingSafeEqualString(hashEmailToken(pendingToken), String(pending.tokenHash ?? ""))) {
    return clearPendingCookie(
      jsonError("GitHub sign-up session expired. Start again.", 401)
    );
  }

  const providerAccountId = String(pending.providerAccountId ?? "");
  if (!providerAccountId) {
    await oauthPending.deleteByPendingId(pendingId);
    return clearPendingCookie(
      jsonError("GitHub sign-up session expired. Start again.", 401)
    );
  }

  const email = normalizeEmail(pending.email);
  const authLimit = await checkAuthRateLimit(email);
  if (authLimit.limited) return rateLimitError();

  // The pending record was written before the user filled in their age, so both
  // the email and the GitHub identity may have been claimed in the meantime.
  const [emailTaken, identityTaken] = await Promise.all([
    users.existsByEmail(email),
    externalIdentities.existsByProviderAccount("github", providerAccountId)
  ]);
  if (emailTaken || identityTaken) {
    await oauthPending.deleteByPendingId(pendingId);
    return clearPendingCookie(jsonError(REGISTRATION_CONFLICT, 409));
  }

  const userId = createPublicId("user");
  try {
    await users.createUser({
      userId,
      email,
      // No passwordHash: this account's only credential is the GitHub identity
      // until the user sets a password from settings.
      authProviders: ["github"],
      firstName: pending.firstName || undefined,
      lastName: pending.lastName || undefined,
      dateOfBirth,
      emailVerified: true
    });
  } catch (createError) {
    if (createError instanceof DuplicateKeyError) {
      await oauthPending.deleteByPendingId(pendingId);
      return clearPendingCookie(jsonError(REGISTRATION_CONFLICT, 409));
    }
    throw createError;
  }

  try {
    await externalIdentities.createExternalIdentity({
      identityId: createPublicId("extid"),
      userId,
      provider: "github",
      providerAccountId,
      providerUsername: null,
      providerEmail: email,
      providerEmailVerified: true,
      linkedAt: new Date()
    });
  } catch (linkError) {
    // Losing the identity race leaves an account with no way in, so roll the
    // half-created account back rather than stranding it.
    await users.deleteUser(userId);
    await oauthPending.deleteByPendingId(pendingId);
    logger.warn("github_signup_identity_conflict", {
      error: linkError instanceof Error ? linkError.message : String(linkError)
    });
    return clearPendingCookie(jsonError(REGISTRATION_CONFLICT, 409));
  }

  try {
    await createDeveloperAccount(userId, email);
  } catch (accountError) {
    // Matches the Google flow: the user still has an account and can complete
    // workspace setup during onboarding.
    logger.error("github_signup_workspace_create_failed", {
      error: accountError instanceof Error ? accountError.message : String(accountError)
    });
  }

  await oauthPending.deleteByPendingId(pendingId);
  await recordIdentityAudit({
    userId,
    action: "identity_registered",
    provider: "github",
    providerAccountId,
    request,
    context: "signup"
  });

  const { token } = await createDeveloperSession(userId);
  const response = NextResponse.json({
    user: { userId, email, emailVerified: true },
    redirectTo: "/onboarding",
    next: safeOAuthNextPath(readString(body.next)) ?? null
  });
  setDeveloperSessionCookie(response, token);
  return clearPendingCookie(response);
}
