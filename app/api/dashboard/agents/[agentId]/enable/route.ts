import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { updateAccountAgent } from "@/lib/accountAgents";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

async function mutateAgentStatus(
  request: NextRequest,
  context: RouteContext,
  status: "active" | "disabled",
  eventName: "agent.enabled" | "agent.disabled"
) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const workspace = await requireWorkspaceMutationActor(auth.user);
  if (workspace.error) return workspace.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const { agentId } = await context.params;
  const result = await updateAccountAgent(actor, agentId, { status });
  if (result.matchedCount !== 1) return jsonError("Agent not found.", 404);
  await emitWebhookEvent(createWebhookEvent(actor.accountId, eventName, { agentId }, auth.user.userId));
  return NextResponse.json({ [status === "active" ? "enabled" : "disabled"]: true });
}

export async function POST(request: NextRequest, context: RouteContext) {
  return mutateAgentStatus(request, context, "active", "agent.enabled");
}
