import { NextResponse, type NextRequest } from "next/server";
import {
  createDeveloperSession,
  normalizeEmail,
  requireDashboardMutationOrigin,
  setDeveloperSessionCookie,
  verifyPassword
} from "@/lib/developerAuth";
import { recordAuthFailure } from "@/lib/authEvents";
import { checkAuthRateLimit, checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { isPasswordLoginBlockedBySso } from "@/lib/workspaceSso";
import { oauthOnlyLoginMessage } from "@/lib/authProviders/loginHints";
import * as users from "@/lib/repositories/users";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["email", "password"]);
  if (unknownError) return jsonError(unknownError);

  const email = normalizeEmail(readString(body.email));
  const password = typeof body.password === "string" ? body.password : "";

  // Per-email rate limit applied before any DB work to prevent brute-force
  const authLimit = await checkAuthRateLimit(email);
  if (authLimit.limited) return rateLimitError();

  if (await isPasswordLoginBlockedBySso(email)) {
    await recordAuthFailure({
      request,
      surface: "developer_login",
      reason: "sso_password_blocked",
      email
    });
    return jsonError("Password sign-in is disabled for this email domain. Use Continue with Google.", 403);
  }

  const user = await users.findByEmailWithPassword(email);
  if (!user?.passwordHash) {
    if (user) {
      await recordAuthFailure({
        request,
        surface: "developer_login",
        reason: "oauth_only_account",
        email
      });
      return jsonError(oauthOnlyLoginMessage(user.authProviders ?? undefined), 401);
    }
    await recordAuthFailure({
      request,
      surface: "developer_login",
      reason: "unknown_account",
      email
    });
    return jsonError("Invalid email or password.", 401);
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordAuthFailure({
      request,
      surface: "developer_login",
      reason: "invalid_credentials",
      email
    });
    return jsonError("Invalid email or password.", 401);
  }

  const { updateAccountLastSignIn } = await import("@/lib/authProviders/authUsage");
  await updateAccountLastSignIn({
    userId: user.userId,
    method: "password",
    request
  });
  const { recordIdentityAudit } = await import("@/lib/authProviders/identityAudit");
  const mfaEnabled = Boolean((user as { mfaEnabledAt?: Date | null }).mfaEnabledAt);
  await recordIdentityAudit({
    userId: user.userId,
    action: "password_login",
    provider: "password",
    providerAccountId: "password",
    request,
    context: mfaEnabled ? "password_mfa_pending" : "password_login"
  });

  if (mfaEnabled) {
    const { createMfaChallengeToken } = await import("@/lib/mfa");
    const challengeToken = await createMfaChallengeToken(user.userId);
    return NextResponse.json({
      mfaRequired: true,
      mfaToken: challengeToken
    });
  }

  const { token } = await createDeveloperSession(user.userId);
  const response = NextResponse.json({
    user: {
      userId: user.userId,
      email: user.email,
      emailVerified: user.emailVerified !== false
    }
  });
  setDeveloperSessionCookie(response, token);
  return response;
}
