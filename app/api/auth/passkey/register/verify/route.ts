import type { NextRequest } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { finishPasskeyRegistration } from "@/lib/authProviders/passkeyService";
import {
  requireDashboardMutationOrigin,
  requireVerifiedDeveloperApi
} from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";

/** Complete WebAuthn registration and store the public credential. */
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

  const unknownError = rejectUnknownFields(body, ["response", "nickname"]);
  if (unknownError) return jsonError(unknownError);

  const response = body.response as RegistrationResponseJSON | undefined;
  if (!response || typeof response !== "object" || typeof response.id !== "string") {
    return jsonError("Invalid passkey registration response.");
  }

  const nickname = readString(body.nickname) || undefined;

  const result = await finishPasskeyRegistration({
    userId: auth.user.userId,
    response,
    nickname,
    request
  });

  if (!result.ok) {
    switch (result.code) {
      case "webauthn_unconfigured":
        return jsonError("Passkeys are not available on this deployment.", 503);
      case "passkey_requires_recovery":
        return jsonError(
          "Add a password or connect GitHub/Google before registering a passkey so you retain a recovery method.",
          409
        );
      case "invalid_challenge":
        return jsonError("This passkey registration expired or was already used. Try again.", 400);
      case "duplicate_credential":
        return jsonError("That passkey is already registered on this account.", 409);
      case "invalid_nickname":
        return jsonError("Enter a short nickname for this passkey.");
      default:
        return jsonError("Passkey registration could not be verified. Try again.", 400);
    }
  }

  return noCacheJson({
    credentialRecordId: result.credentialRecordId,
    nickname: result.nickname
  });
}
