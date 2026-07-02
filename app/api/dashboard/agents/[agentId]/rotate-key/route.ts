import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import { accountAgentFilter } from "@/lib/accountAgents";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { createApiKey } from "@/lib/ids";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const workspace = await requireWorkspaceMutationActor(auth.user);
  if (workspace.error) return workspace.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.user.primaryAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const { agentId } = await context.params;
  const apiKey = createApiKey();
  const result = await Agent.updateOne(accountAgentFilter(actor, agentId), {
    $set: { apiKeyHash: hashApiKey(apiKey), keyRotatedAt: new Date() },
    $unset: { lastUsedAt: "" }
  });
  if (result.matchedCount !== 1) return jsonError("Agent not found.", 404);

  await emitWebhookEvent(
    createWebhookEvent(actor.accountId, "agent.key_rotated", { agentId }, auth.user.userId)
  );

  return NextResponse.json({ agentId, apiKey });
}
