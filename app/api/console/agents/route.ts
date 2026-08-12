import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import { getConsoleSessionActorId, requireConsoleApi } from "@/lib/adminAuth";
import { parseAgentMetadata } from "@/lib/agents";
import { recordAdminAudit } from "@/lib/consoleAdmins";
import { getConsoleAccountId, serializeAgent } from "@/lib/consoleData";
import { createApiKey, createPublicId } from "@/lib/ids";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import { createAgent, listAgents } from "@/lib/repositories/agents";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const accountId = await getConsoleAccountId();
  const agents = await listAgents({ accountId }, { sort: { createdAt: -1 }, select: "-_id agentId name status agentType provider externalAgentId externalAgentLabel connectionStatus description lastUsedAt keyRotatedAt createdAt updatedAt" });

  return NextResponse.json({ agents: await Promise.all(agents.map((agent) => serializeAgent(agent))) });
}

export async function POST(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

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
  if (unknownError) {
    return jsonError(unknownError);
  }

  const name = readString(body.name);
  if (!name) {
    return jsonError("name is required.");
  }

  const { metadata, error: metadataError } = parseAgentMetadata(body);
  if (metadataError || !metadata) {
    return jsonError(metadataError ?? "Invalid agent metadata.");
  }

  const accountId = await getConsoleAccountId();
  const agentId = createPublicId("agent");
  const apiKey = createApiKey();
  const agent = await createAgent({
    accountId,
    agentId,
    name,
    ...metadata,
    apiKeyHash: hashApiKey(apiKey),
    status: "active"
  });

  await emitWebhookEvent(
    createWebhookEvent(accountId, "agent.created", {
      agentId,
      name,
      agentType: metadata.agentType,
      provider: metadata.provider
    })
  );

  await recordAdminAudit({
    adminId: getConsoleSessionActorId(request),
    action: "agent.created",
    target: agentId,
    metadata: { name, agentType: metadata.agentType, provider: metadata.provider }
  });

  return NextResponse.json(
    {
      agent: await serializeAgent(agent),
      apiKey
    },
    { status: 201 }
  );
}
