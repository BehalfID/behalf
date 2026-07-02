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

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const workspace = await requireWorkspaceMutationActor(auth.user, auth.activeAccountId);
  if (workspace.error) return workspace.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const { agentId } = await context.params;
  const result = await updateAccountAgent(actor, agentId, { status: "disabled" });
  if (result.matchedCount !== 1) return jsonError("Agent not found.", 404);
  await emitWebhookEvent(createWebhookEvent(actor.accountId, "agent.disabled", { agentId }, auth.user.userId));
  return NextResponse.json({ disabled: true });
}
