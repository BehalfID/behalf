import { NextResponse, type NextRequest } from "next/server";
import { requireHumanDeveloperApi } from "@/lib/humanAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { createPermissionForAgent } from "@/lib/permissionMutations";
import { jsonError } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";
import { readJsonObject } from "@/lib/request";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireHumanDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { agentId } = await context.params;
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

  const result = await createPermissionForAgent({
    actor,
    userId: auth.user.userId,
    agentId,
    body
  });
  if ("error" in result && result.error) return result.error;

  return NextResponse.json(
    {
      permissionId: result.permissionId,
      status: result.status,
      requiredAuthorityLevel: result.requiredAuthorityLevel,
      workspaceAuthority: serializeWorkspaceAuthority(actor)
    },
    { status: 201 }
  );
}
