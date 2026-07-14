import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { requireHumanDeveloperApi } from "@/lib/humanAuth";
import { replacePermissionForAgent } from "@/lib/permissionMutations";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ agentId: string; permissionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireHumanDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const accountId = auth.account?.accountId ?? auth.user.primaryAccountId;
  const actor = await getWorkspaceActor(auth.user.userId, accountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, [
    "action",
    "description",
    "resource",
    "scope",
    "allowedActions",
    "blockedActions",
    "requiresApproval",
    "notes",
    "template",
    "constraints"
  ]);
  if (unknownError) return jsonError(unknownError);

  const { agentId, permissionId } = await context.params;
  const result = await replacePermissionForAgent({
    actor,
    userId: auth.user.userId,
    agentId,
    permissionId,
    body
  });
  if ("error" in result && result.error) return result.error;

  return NextResponse.json({
    ...result,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}
