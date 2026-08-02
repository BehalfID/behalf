import type { NextRequest } from "next/server";
import { beginPasskeyAuthentication } from "@/lib/authProviders/passkeyService";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import {
  requireDashboardMutationOrigin,
  requireVerifiedDeveloperApi
} from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError, noCacheJson } from "@/lib/responses";

/** Start a user-bound passkey ceremony for account-deletion reauth. */
export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  await recordIdentityAudit({
    userId: auth.user.userId,
    action: "account_deletion_reauth_started",
    provider: "passkey",
    providerAccountId: "passkey",
    request,
    context: "account_delete"
  });

  const started = await beginPasskeyAuthentication({ userId: auth.user.userId });
  if (!started.ok) {
    return jsonError("Passkeys are not available on this deployment.", 503);
  }

  return noCacheJson({ options: started.options });
}
