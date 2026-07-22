import type { NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority, viewerMutationForbidden } from "@/lib/delegatedAuth";
import { postponeRecommendation } from "@/lib/adaptiveDelegation/service";
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

  let days: number | undefined;
  if (request.headers.get("content-length") !== "0") {
    const { body, error } = await readJsonObject(request);
    if (error) return error;
    if (body) {
      const unknownError = rejectUnknownFields(body, ["days"]);
      if (unknownError) return jsonError(unknownError);
      if (body.days !== undefined) {
        if (!Number.isInteger(body.days) || Number(body.days) < 1 || Number(body.days) > 90) {
          return jsonError("days must be an integer between 1 and 90.");
        }
        days = Number(body.days);
      }
    }
  }

  const { recommendationId } = await context.params;
  const result = await postponeRecommendation({
    accountId: actor.accountId,
    userId: auth.user.userId,
    recommendationId,
    days
  });
  if ("error" in result && result.error) return result.error;

  return noCacheJson({
    recommendation: result.recommendation,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}
