import { NextResponse, type NextRequest } from "next/server";
import { agentAuthJsonError } from "@/lib/appErrors";
import { authenticateAgent } from "@/lib/auth";
import {
  agentCannotGrantPermissions,
  getWorkspaceActor,
  serializeWorkspaceAuthority
} from "@/lib/delegatedAuth";
import { connectToDatabase } from "@/lib/db";
import { requireHumanDeveloperApi } from "@/lib/humanAuth";
import { createPermissionForAgent } from "@/lib/permissionMutations";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "agentId",
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
  if (unknownError) {
    return jsonError(unknownError);
  }

  const agentId = readString(body.agentId);
  const action = readString(body.action);

  if (!agentId) {
    return jsonError("agentId is required.");
  }

  if (!action) {
    return jsonError("action is required.");
  }

  await connectToDatabase();

  const humanAuth = await requireHumanDeveloperApi(request);
  if (humanAuth.user && !humanAuth.error) {
    const accountId = humanAuth.account?.accountId ?? humanAuth.user.primaryAccountId;
    const actor = await getWorkspaceActor(humanAuth.user.userId, accountId);
    if (!actor) return jsonError("Workspace account required.", 403);

    const result = await createPermissionForAgent({
      actor,
      userId: humanAuth.user.userId,
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

  const auth = await authenticateAgent(request, agentId);
  if (auth.error || !auth.agent) {
    return agentAuthJsonError(auth.error);
  }

  return agentCannotGrantPermissions();
}
