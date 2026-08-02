import type { NextRequest } from "next/server";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import { requireVerifiedDeveloperApi } from "@/lib/developerAuth";
import { listAccountDeleteReauthMethods } from "@/lib/reauth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { noCacheJson } from "@/lib/responses";

/** Usable reauthentication methods for account deletion. */
export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const result = await listAccountDeleteReauthMethods(auth.user.userId);
  if (result.blockedReason) {
    await recordIdentityAudit({
      userId: auth.user.userId,
      action: "account_deletion_blocked",
      provider: "password",
      providerAccountId: "none",
      request,
      context: "no_usable_reauth_method"
    });
  }

  return noCacheJson({
    purpose: "account_delete",
    methods: result.methods,
    blockedReason: result.blockedReason,
    ttlSeconds: 8 * 60
  });
}
