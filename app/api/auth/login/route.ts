import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
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
import DeveloperUser from "@/models/DeveloperUser";

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

  await connectToDatabase();
  // "+passwordHash" alone keeps the default field set; listing other fields
  // would become an inclusion projection and omit userId/email.
  const user = await DeveloperUser.findOne({ email }).select("+passwordHash +mfaEnabledAt authProviders");
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

  if (user.mfaEnabledAt) {
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
