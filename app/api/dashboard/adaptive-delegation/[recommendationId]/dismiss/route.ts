import type { NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority, viewerMutationForbidden } from "@/lib/delegatedAuth";
import { dismissRecommendation } from "@/lib/adaptiveDelegation/service";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import type { AdaptiveDelegationDismissReason } from "@/lib/adaptiveDelegation/types";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ recommendationId: string }> }
) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (actor.authorityLevel <= 10) return viewerMutationForbidden();

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["reason"]);
  if (unknownError) return jsonError(unknownError);

  const reasonRaw = readString(body.reason) || "keep_manual";
  if (reasonRaw !== "keep_manual" && reasonRaw !== "never_suggest") {
    return jsonError("reason must be keep_manual or never_suggest.");
  }
  const reason = reasonRaw as AdaptiveDelegationDismissReason;

  const { recommendationId } = await context.params;
  const result = await dismissRecommendation({
    accountId: actor.accountId,
    userId: auth.user.userId,
    recommendationId,
    reason
  });
  if ("error" in result && result.error) return result.error;

  return noCacheJson({
    recommendation: result.recommendation,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}
