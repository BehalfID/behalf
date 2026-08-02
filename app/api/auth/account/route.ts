import { NextResponse, type NextRequest } from "next/server";
import { deleteDeveloperUser } from "@/lib/accountDeletion";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import {
  clearDeveloperSessionCookie,
  hashSessionToken,
  requireDashboardMutationOrigin,
  requireVerifiedDeveloperApi
} from "@/lib/developerAuth";
import { logger } from "@/lib/logger";
import {
  clearReauthProofCookie,
  consumeAccountDeleteReauthProof,
  readReauthTokenFromRequest
} from "@/lib/reauth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import * as sessions from "@/lib/repositories/sessions";

const DELETE_CONFIRMATION = "DELETE";

export async function DELETE(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["confirmation", "reauthToken", "password"]);
  if (unknownError) return jsonError(unknownError);

  const confirmation = readString(body.confirmation);
  if (confirmation !== DELETE_CONFIRMATION) {
    return jsonError(`Type ${DELETE_CONFIRMATION} to confirm account deletion.`, 400);
  }

  // Password alone is no longer accepted — require a purpose-bound recent-auth proof.
  const reauthToken = readReauthTokenFromRequest(request, body.reauthToken);
  const consumed = await consumeAccountDeleteReauthProof({
    token: reauthToken,
    userId: auth.user.userId
  });

  if (!consumed.ok) {
    logger.warn("account_deletion_blocked", {
      userId: auth.user.userId,
      reason: consumed.reason
    });
    await recordIdentityAudit({
      userId: auth.user.userId,
      action: "account_deletion_blocked",
      provider: "password",
      providerAccountId: "reauth",
      request,
      context: consumed.reason
    });
    return jsonError(
      "Confirm your identity again before deleting this account. Your confirmation may have expired.",
      401
    );
  }

  const result = await deleteDeveloperUser(auth.user.userId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  await recordIdentityAudit({
    userId: auth.user.userId,
    action: "account_deletion_completed",
    provider:
      consumed.method === "password" || consumed.method === "passkey"
        ? consumed.method
        : consumed.method,
    providerAccountId: consumed.proofId,
    request,
    context: `method:${consumed.method}`
  });

  logger.info("account_deletion_completed", {
    userId: auth.user.userId,
    method: consumed.method,
    deletedAccountIds: result.deletedAccountIds
  });

  const token = request.cookies.get("behalfid_developer")?.value;
  if (token) {
    await sessions.deleteByTokenHash(hashSessionToken(token));
  }

  const response = NextResponse.json({ deleted: true });
  clearDeveloperSessionCookie(response);
  clearReauthProofCookie(response);
  return response;
}
