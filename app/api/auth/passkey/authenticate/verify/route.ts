import { NextResponse, type NextRequest } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { finishPasskeyAuthentication } from "@/lib/authProviders/passkeyService";
import {
  createDeveloperSession,
  requireDashboardMutationOrigin,
  setDeveloperSessionCookie
} from "@/lib/developerAuth";
import { recordAuthFailure } from "@/lib/authEvents";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";
import { createMfaChallengeToken } from "@/lib/mfa";
import * as users from "@/lib/repositories/users";

/**
 * Complete passkey authentication and mint a developer session.
 * Failed assertions return a generic error (no account enumeration).
 */
export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["response"]);
  if (unknownError) return jsonError(unknownError);

  const response = body.response as AuthenticationResponseJSON | undefined;
  if (!response || typeof response !== "object" || typeof response.id !== "string") {
    return jsonError("Invalid passkey assertion.");
  }

  const result = await finishPasskeyAuthentication({ response, request });

  if (!result.ok) {
    await recordAuthFailure({
      request,
      surface: "developer_login",
      reason: "invalid_credentials"
    });
    // Generic copy — do not distinguish unknown credential from bad assertion.
    return jsonError("Passkey sign-in failed. Try again or use another method.", 401);
  }

  const user = await users.findByUserId(result.userId);
  if (!user) {
    return jsonError("Passkey sign-in failed. Try again or use another method.", 401);
  }

  // MFA columns are not yet on the Postgres developer_users schema.
  const mfaEnabled = Boolean((user as { mfaEnabledAt?: Date | null }).mfaEnabledAt);
  if (mfaEnabled) {
    const challengeToken = await createMfaChallengeToken(user.userId);
    return NextResponse.json({
      mfaRequired: true,
      mfaToken: challengeToken
    });
  }

  const { token } = await createDeveloperSession(user.userId);
  const json = NextResponse.json({
    user: {
      userId: user.userId,
      email: user.email,
      emailVerified: user.emailVerified !== false
    }
  });
  setDeveloperSessionCookie(json, token);
  return json;
}
