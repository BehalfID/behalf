import { type NextRequest } from "next/server";
import { getRequestAccountId, requireDeveloperApi, requireVerifiedDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import {
  loadEffectiveManagedProfilePolicy,
  saveManagedProfilePolicy,
} from "@/lib/managedProfilePolicy";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readJsonObject } from "@/lib/request";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const accountId = getRequestAccountId(auth);
  if (!accountId) return jsonError("Workspace account required.", 403);

  const actor = await getWorkspaceActor(auth.user.userId, accountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const policy = await loadEffectiveManagedProfilePolicy(accountId);
  return noCacheJson({
    policy,
    canEdit: actor.role !== "VIEWER",
    workspaceAuthority: serializeWorkspaceAuthority(actor),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const accountId = getRequestAccountId(auth);
  if (!accountId) return jsonError("Workspace account required.", 403);

  const actorCheck = await requireWorkspaceMutationActor(auth.user, accountId);
  if (actorCheck.error) return actorCheck.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const result = await saveManagedProfilePolicy(accountId, body);
  if (result.error || !result.policy) {
    return jsonError(result.error ?? "Failed to save managed profile policy.", 400);
  }

  return noCacheJson({
    ok: true,
    policy: result.policy,
    workspaceAuthority: serializeWorkspaceAuthority(actorCheck.actor!),
  });
}
