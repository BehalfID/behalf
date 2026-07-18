import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { canManageMembers, getWorkspaceActor } from "@/lib/delegatedAuth";
import { getPlanEntitlements, normalizePlan } from "@/lib/plans";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";
import { readWorkspaceSso, validateSsoDomainList } from "@/lib/workspaceSso";
import Account from "@/models/Account";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user || !auth.activeAccountId) return auth.error;

  const entitlements = getPlanEntitlements(auth.account?.plan);
  const sso = readWorkspaceSso(auth.account);
  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);

  return noCacheJson({
    available: entitlements.googleWorkspaceSsoEnabled,
    canEdit: Boolean(actor && canManageMembers(actor) && entitlements.googleWorkspaceSsoEnabled),
    sso,
    plan: normalizePlan(auth.account?.plan)
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user || !auth.activeAccountId) return auth.error;

  const entitlements = getPlanEntitlements(auth.account?.plan);
  if (!entitlements.googleWorkspaceSsoEnabled) {
    return jsonError("Workspace Google SSO requires a Pro plan or higher.", 403);
  }

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor || !canManageMembers(actor)) {
    return jsonError("Only Owners and Engineering Leads can manage SSO settings.", 403);
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["enabled", "enforce", "allowedEmailDomains"]);
  if (unknownError) return jsonError(unknownError);

  const enabled = typeof body.enabled === "boolean" ? body.enabled : Boolean(auth.account && readWorkspaceSso(auth.account).enabled);
  const enforce = typeof body.enforce === "boolean" ? body.enforce : Boolean(auth.account && readWorkspaceSso(auth.account).enforce);

  const current = readWorkspaceSso(auth.account);
  const domainsInput =
    body.allowedEmailDomains !== undefined ? body.allowedEmailDomains : current.allowedEmailDomains;
  const validated = validateSsoDomainList(domainsInput, { enforce: enabled && enforce });
  if (!validated.ok) return jsonError(validated.error);

  if (enabled && validated.domains.length === 0) {
    return jsonError("Add at least one company email domain before enabling Google SSO.");
  }

  await connectToDatabase();
  const updated = await Account.findOneAndUpdate(
    { accountId: auth.activeAccountId },
    {
      $set: {
        sso: {
          provider: "google",
          enabled,
          enforce: enabled ? enforce : false,
          allowedEmailDomains: validated.domains
        }
      }
    },
    { returnDocument: "after" }
  ).lean();

  return noCacheJson({
    ok: true,
    available: true,
    canEdit: true,
    sso: readWorkspaceSso(updated),
    plan: normalizePlan(updated?.plan ?? auth.account?.plan)
  });
}
