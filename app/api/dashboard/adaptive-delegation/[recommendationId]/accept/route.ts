import type { NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority, viewerMutationForbidden } from "@/lib/delegatedAuth";
import { acceptRecommendation } from "@/lib/adaptiveDelegation/service";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ recommendationId: string }> }
) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (actor.authorityLevel <= 10) return viewerMutationForbidden();

  let agentIds: string[] | undefined;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const { body, error } = await readJsonObject(request);
    if (error) return error;
    if (body) {
      const unknownError = rejectUnknownFields(body, ["agentIds"]);
      if (unknownError) return jsonError(unknownError);
      if (body.agentIds !== undefined) {
        if (
          !Array.isArray(body.agentIds) ||
          body.agentIds.some((value) => typeof value !== "string" || !value.trim())
        ) {
          return jsonError("agentIds must be an array of non-empty strings.");
        }
        agentIds = body.agentIds.map((value: string) => value.trim());
      }
    }
  }

  const { recommendationId } = await context.params;
  const result = await acceptRecommendation({
    actor,
    userId: auth.user.userId,
    recommendationId,
    agentIds
  });
  if ("error" in result && result.error) return result.error;

  return noCacheJson({
    recommendation: result.recommendation,
    permissionId: result.permissionId,
    profileId: "profileId" in result ? result.profileId : undefined,
    agentIds: "agentIds" in result ? result.agentIds : undefined,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}
