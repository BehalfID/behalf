import { NextResponse, type NextRequest } from "next/server";
import { parseAgentMetadata } from "@/lib/agents";
import { getDeveloperAgentDetail, serializeAgent } from "@/lib/dashboardData";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import Agent from "@/models/Agent";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { agentId } = await context.params;
  const detail = await getDeveloperAgentDetail(auth.user.userId, agentId);
  if (!detail) return jsonError("Agent not found.", 404);
  return NextResponse.json(detail);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "name",
    "provider",
    "externalAgentId",
    "externalAgentLabel",
    "description",
    "connectionStatus"
  ]);
  if (unknownError) return jsonError(unknownError);

  const { agentId } = await context.params;
  const update: Record<string, string | undefined> = {};

  if (body.name !== undefined) {
    const name = readString(body.name);
    if (!name) return jsonError("name must be a non-empty string.");
    update.name = name;
  }

  const { metadata, error: metadataError } = parseAgentMetadata({ agentType: "connected", ...body });
  if (metadataError || !metadata) return jsonError(metadataError ?? "Invalid agent metadata.");

  if (body.provider !== undefined) update.provider = metadata.provider;
  if (body.externalAgentId !== undefined) update.externalAgentId = metadata.externalAgentId;
  if (body.externalAgentLabel !== undefined) update.externalAgentLabel = metadata.externalAgentLabel;
  if (body.description !== undefined) update.description = metadata.description;
  if (body.connectionStatus !== undefined) update.connectionStatus = metadata.connectionStatus;

  if (!Object.keys(update).length) {
    return jsonError("At least one editable agent field is required.");
  }

  const agent = await Agent.findOneAndUpdate(
    { developerUserId: auth.user.userId, agentId },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!agent) return jsonError("Agent not found.", 404);

  return NextResponse.json({ agent: serializeAgent(agent) });
}
