import { NextResponse, type NextRequest } from "next/server";
import { loadAccountSetupState, patchAccountSetup, PATCH_ALLOWED_FIELDS } from "@/lib/accountSetup";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { canManageMembers, getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { getQuotas, isSameBillingPeriod, type Plan } from "@/lib/plans";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readJsonObject } from "@/lib/request";
import { accountDeletionSupportMessage } from "@/lib/support";
import { rejectUnknownFields } from "@/lib/validation";

/**
 * Read-only usage summary for the settings page. Mirrors the quota data used
 * by billing surfaces without touching enforcement in lib/quota.ts.
 */
function apiUsageSummary(account: {
  plan?: string | null;
  verificationCount?: number | null;
  verificationPeriodStart?: Date | string | null;
} | null): string {
  if (!account) return "Usage data unavailable";

  const plan: Plan = account.plan === "pro" || account.plan === "enterprise" ? account.plan : "free";
  const quotas = getQuotas(plan);

  const periodStart = account.verificationPeriodStart ? new Date(account.verificationPeriodStart) : null;
  const inCurrentPeriod = periodStart !== null && !Number.isNaN(periodStart.getTime()) && isSameBillingPeriod(periodStart);
  // The counter is reset lazily on the next verification, so a stale period means zero usage this month.
  const used = inCurrentPeriod ? account.verificationCount ?? 0 : 0;

  const limit = Number.isFinite(quotas.verificationsPerMonth)
    ? quotas.verificationsPerMonth.toLocaleString()
    : "Unlimited";

  return `${used.toLocaleString()} / ${limit} monthly verifications used`;
}

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  const setup = await loadAccountSetupState(auth.user.userId, auth.activeAccountId);

  return noCacheJson({
    email: auth.user.email,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
    apiUsage: apiUsageSummary(auth.account),
    dangerZone: accountDeletionSupportMessage(),
    delegatedPermissions: actor
      ? {
          role: actor.role,
          roleLabel: serializeWorkspaceAuthority(actor).roleLabel,
          authorityLevel: actor.authorityLevel
        }
      : null,
    profile: setup?.profile ?? null,
    account: setup?.account ?? null,
    onboardingCompletedAt: setup?.onboardingCompletedAt ?? null,
    canEditAccountFields: actor ? canManageMembers(actor) : false
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [...PATCH_ALLOWED_FIELDS]);
  if (unknownError) return jsonError(unknownError);

  const result = await patchAccountSetup(auth.user.userId, auth.activeAccountId, body);
  if (result.error) return jsonError(result.error, result.status ?? 400);

  const setup = await loadAccountSetupState(auth.user.userId, auth.activeAccountId);
  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);

  return noCacheJson({
    ok: true,
    profile: setup?.profile ?? null,
    account: setup?.account ?? null,
    delegatedPermissions: actor
      ? {
          role: actor.role,
          roleLabel: serializeWorkspaceAuthority(actor).roleLabel,
          authorityLevel: actor.authorityLevel
        }
      : null,
    canEditAccountFields: actor ? canManageMembers(actor) : false
  });
}
