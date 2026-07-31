import { NextResponse, type NextRequest } from "next/server";
import { unlinkIdentity } from "@/lib/authProviders/externalIdentityService";
import { oauthErrorMessage } from "@/lib/authProviders/oauthErrors";
import { getLoginProvider } from "@/lib/authProviders/providers/registry";
import { connectToDatabase } from "@/lib/db";
import {
  requireDashboardMutationOrigin,
  requireVerifiedDeveloperApi,
  verifyPassword
} from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";
import DeveloperUser from "@/models/DeveloperUser";
import type { ExternalIdentityProvider } from "@/models/ExternalIdentity";

/**
 * Disconnects a login provider from the signed-in account.
 *
 * Requires the account password when one exists. This mirrors how MFA enrolment
 * and account deletion already gate sensitive account-security changes in this
 * codebase: a stolen session alone must not be enough to strip a factor.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { provider: providerParam } = await context.params;
  const provider = getLoginProvider(providerParam);
  if (!provider) {
    return jsonError("Unknown sign-in provider.", 404);
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;

  if (body) {
    const unknownError = rejectUnknownFields(body, ["password"]);
    if (unknownError) return jsonError(unknownError);
  }

  await connectToDatabase();
  const user = await DeveloperUser.findOne({ userId: auth.user.userId })
    .select("+passwordHash userId")
    .lean();
  if (!user) {
    return jsonError("Account not found.", 404);
  }

  if (user.passwordHash) {
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password || !(await verifyPassword(password, user.passwordHash))) {
      return jsonError("Invalid password.", 401);
    }
  }
  // Passwordless accounts have no second credential to re-confirm with. The
  // unlink still cannot strand them: unlinkIdentity refuses to remove the last
  // remaining sign-in method.

  const result = await unlinkIdentity({
    userId: auth.user.userId,
    provider: provider.id as ExternalIdentityProvider,
    request,
    context: "settings"
  });

  if (!result.ok) {
    if (result.code === "not_linked") {
      return jsonError("That provider is not connected to your account.", 404);
    }
    if (result.code === "passkey_only_forbidden") {
      return jsonError(oauthErrorMessage("passkey_only_forbidden"), 409);
    }
    return jsonError(oauthErrorMessage("unlink_last_method"), 409);
  }

  return NextResponse.json({ unlinked: provider.id });
}
