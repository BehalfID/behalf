import type { NextRequest } from "next/server";
import { beginPasskeyRegistration } from "@/lib/authProviders/passkeyService";
import {
  requireDashboardMutationOrigin,
  requireVerifiedDeveloperApi
} from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError, noCacheJson } from "@/lib/responses";

/** Start WebAuthn registration for the signed-in user. */
export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const displayName = [auth.user.firstName, auth.user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const result = await beginPasskeyRegistration({
    userId: auth.user.userId,
    email: auth.user.email,
    displayName: displayName || auth.user.email
  });

  if (!result.ok) {
    if (result.code === "webauthn_unconfigured") {
      return jsonError("Passkeys are not available on this deployment.", 503);
    }
    return jsonError(
      "Add a password or connect GitHub/Google before registering a passkey so you retain a recovery method.",
      409
    );
  }

  return noCacheJson({
    challengeId: result.challengeId,
    options: result.options
  });
}
