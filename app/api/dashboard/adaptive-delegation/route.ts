import type { NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority, viewerMutationForbidden } from "@/lib/delegatedAuth";
import { listAdaptiveDelegationDashboard } from "@/lib/adaptiveDelegation/service";
import { jsonError, noCacheJson } from "@/lib/responses";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const refresh = request.nextUrl.searchParams.get("refresh") !== "false";
  const dashboard = await listAdaptiveDelegationDashboard({
    accountId: actor.accountId,
    refresh
  });

  return noCacheJson({
    ...dashboard,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (actor.authorityLevel <= 10) return viewerMutationForbidden();

  const dashboard = await listAdaptiveDelegationDashboard({
    accountId: actor.accountId,
    refresh: true
  });

  return noCacheJson({
    ...dashboard,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}
