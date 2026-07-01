import { NextResponse, type NextRequest } from "next/server";
import { parseAgentMetadata } from "@/lib/agents";
import { createDeveloperAgent, serializeAgent } from "@/lib/dashboardData";
import { requireDeveloperApi, requireVerifiedDeveloperApi } from "@/lib/developerAuth";
import { accountScopeFilter } from "@/lib/accountAccess";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { checkAgentLimit, quotaErrorDetails } from "@/lib/quota";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.user.primaryAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const agents = await Agent.find({ ...accountScopeFilter(actor.accountId) })
    .sort({ createdAt: -1 })
    .select("-_id agentId name status agentType provider externalAgentId externalAgentLabel connectionStatus description lastUsedAt keyRotatedAt createdAt updatedAt")
    .lean();

  return noCacheJson({ agents: agents.map(serializeAgent) });
}

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const workspace = await requireWorkspaceMutationActor(auth.user);
  if (workspace.error) return workspace.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, [
    "name",
    "agentType",
    "provider",
    "externalAgentId",
    "externalAgentLabel",
    "connectionStatus",
    "description"
  ]);
  if (unknownError) return jsonError(unknownError);

  const name = readString(body.name);
  if (!name) return jsonError("name is required.");

  const agentQuota = await checkAgentLimit(auth.user.primaryAccountId);
  if (!agentQuota.allowed) {
    return jsonError(agentQuota.reason ?? "Agent limit reached.", 402, quotaErrorDetails(agentQuota));
  }

  const { metadata, error: metadataError } = parseAgentMetadata(body);
  if (metadataError || !metadata) return jsonError(metadataError ?? "Invalid agent metadata.");

  const result = await createDeveloperAgent(auth.user.userId, auth.user.primaryAccountId ?? undefined, { name, ...metadata });
  await emitWebhookEvent(
    createWebhookEvent(null, "agent.created", {
      agentId: result.agent.agentId,
      name,
      agentType: metadata.agentType,
      provider: metadata.provider
    }, auth.user.userId)
  );
  return NextResponse.json(result, { status: 201 });
}
