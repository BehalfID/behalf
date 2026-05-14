import { NextResponse, type NextRequest } from "next/server";
import { parseAgentMetadata } from "@/lib/agents";
import { createDeveloperAgent, serializeAgent } from "@/lib/dashboardData";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { checkAgentLimit } from "@/lib/quota";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const agents = await Agent.find({ developerUserId: auth.user.userId })
    .sort({ createdAt: -1 })
    .select("-_id agentId name status agentType provider externalAgentId externalAgentLabel connectionStatus description lastUsedAt keyRotatedAt createdAt updatedAt")
    .lean();

  return NextResponse.json({ agents: agents.map(serializeAgent) });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

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
    return jsonError(agentQuota.reason ?? "Agent limit reached.", 402);
  }

  const { metadata, error: metadataError } = parseAgentMetadata(body);
  if (metadataError || !metadata) return jsonError(metadataError ?? "Invalid agent metadata.");

  const result = await createDeveloperAgent(auth.user.userId, { name, ...metadata });
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
