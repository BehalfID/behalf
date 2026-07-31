import type { NextRequest } from "next/server";
import { beginPasskeyAuthentication } from "@/lib/authProviders/passkeyService";
import { connectToDatabase } from "@/lib/db";
import { requireDashboardMutationOrigin } from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError, noCacheJson } from "@/lib/responses";

/**
 * Start a discoverable (usernameless) passkey authentication ceremony.
 * Public — no session required. Does not reveal whether any account exists.
 */
export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  await connectToDatabase();
  const result = await beginPasskeyAuthentication();
  if (!result.ok) {
    return jsonError("Passkeys are not available on this deployment.", 503);
  }

  return noCacheJson({
    challengeId: result.challengeId,
    options: result.options
  });
}
