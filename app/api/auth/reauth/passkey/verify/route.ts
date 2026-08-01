import { NextResponse, type NextRequest } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { finishPasskeyAuthentication } from "@/lib/authProviders/passkeyService";
import {
  requireDashboardMutationOrigin,
  requireVerifiedDeveloperApi
} from "@/lib/developerAuth";
import {
  ACCOUNT_DELETE_PURPOSE,
  issueReauthProof,
  logAccountDeletionReauthFailed,
  setReauthProofCookie
} from "@/lib/reauth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";

/**
 * Verify a passkey assertion for account deletion without minting a new session.
 */
export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["response"]);
  if (unknownError) return jsonError(unknownError);

  const assertion = body.response as AuthenticationResponseJSON | undefined;
  if (!assertion || typeof assertion !== "object" || typeof assertion.id !== "string") {
    return jsonError("Invalid passkey assertion.");
  }

  const result = await finishPasskeyAuthentication({ response: assertion, request });
  if (!result.ok || result.userId !== auth.user.userId) {
    await logAccountDeletionReauthFailed({
      userId: auth.user.userId,
      method: "passkey",
      reason: result.ok ? "credential_user_mismatch" : result.code,
      request
    });
    return jsonError("Passkey verification failed. Try again.", 401);
  }

  const proof = await issueReauthProof({
    userId: auth.user.userId,
    purpose: ACCOUNT_DELETE_PURPOSE,
    method: "passkey",
    sessionId: auth.session?.sessionId ?? null,
    request
  });

  const response = NextResponse.json({
    ok: true,
    reauthToken: proof.token,
    expiresAt: proof.expiresAt.toISOString(),
    method: "passkey"
  });
  setReauthProofCookie(response, proof.token);
  return response;
}
