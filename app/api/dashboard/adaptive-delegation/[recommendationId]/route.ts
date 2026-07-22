import type { NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { markRecommendationViewed } from "@/lib/adaptiveDelegation/service";
import Agent from "@/models/Agent";
import { jsonError, noCacheJson } from "@/lib/responses";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ recommendationId: string }> }
) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const { recommendationId } = await context.params;
  const viewed = await markRecommendationViewed({
    accountId: actor.accountId,
    recommendationId,
    actorUserId: auth.user.userId
  });
  if ("error" in viewed && viewed.error) return viewed.error;

  const agent = await Agent.findOne({
    accountId: actor.accountId,
    agentId: viewed.recommendation?.agentId
  })
    .select("name")
    .lean<{ name?: string } | null>();

  return noCacheJson({
    recommendation: {
      ...viewed.recommendation,
      agentName: agent?.name ?? viewed.recommendation?.agentName ?? null
    },
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}
