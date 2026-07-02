import { NextResponse, type NextRequest } from "next/server";
import { parseAgentMetadata } from "@/lib/agents";
import { listAccountAgents } from "@/lib/accountAgents";
import { createDeveloperAgent, serializeAgent } from "@/lib/dashboardData";
import { requireDeveloperApi, requireVerifiedDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { checkAgentLimit, quotaErrorDetails } from "@/lib/quota";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const agents = await listAccountAgents(actor);

  return noCacheJson({ agents: agents.map(serializeAgent) });
}

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const workspace = await requireWorkspaceMutationActor(auth.user, auth.activeAccountId);
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

  const agentQuota = await checkAgentLimit(auth.activeAccountId);
  if (!agentQuota.allowed) {
    return jsonError(agentQuota.reason ?? "Agent limit reached.", 402, quotaErrorDetails(agentQuota));
  }

  const { metadata, error: metadataError } = parseAgentMetadata(body);
  if (metadataError || !metadata) return jsonError(metadataError ?? "Invalid agent metadata.");

  const result = await createDeveloperAgent(auth.user.userId, auth.activeAccountId ?? undefined, { name, ...metadata });
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
