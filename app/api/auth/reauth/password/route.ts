import { NextResponse, type NextRequest } from "next/server";
import {
  requireDashboardMutationOrigin,
  requireVerifiedDeveloperApi,
  verifyPassword
} from "@/lib/developerAuth";
import {
  ACCOUNT_DELETE_PURPOSE,
  issueReauthProof,
  logAccountDeletionReauthFailed,
  setReauthProofCookie
} from "@/lib/reauth";
import { checkAuthRateLimit, checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";
import * as users from "@/lib/repositories/users";

/**
 * Password step-up for account deletion. Generic errors avoid revealing whether
 * a password hash exists.
 */
export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const authLimit = await checkAuthRateLimit(`reauth-password:${auth.user.userId}`);
  if (authLimit.limited) return rateLimitError();

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["password"]);
  if (unknownError) return jsonError(unknownError);

  const password = typeof body.password === "string" ? body.password : "";
  const user = await users.findByUserId(auth.user.userId);

  // Uniform failure for missing hash, wrong password, or empty password.
  if (!user?.passwordHash || !password || !(await verifyPassword(password, user.passwordHash))) {
    await logAccountDeletionReauthFailed({
      userId: auth.user.userId,
      method: "password",
      reason: "invalid_password",
      request
    });
    return jsonError("Identity confirmation failed. Try again.", 401);
  }

  const proof = await issueReauthProof({
    userId: auth.user.userId,
    purpose: ACCOUNT_DELETE_PURPOSE,
    method: "password",
    sessionId: auth.session?.sessionId ?? null,
    request
  });

  const response = NextResponse.json({
    ok: true,
    reauthToken: proof.token,
    expiresAt: proof.expiresAt.toISOString(),
    method: "password"
  });
  setReauthProofCookie(response, proof.token);
  return response;
}
