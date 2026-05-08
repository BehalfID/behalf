import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import {
  isPublicAgentCreationEnabled,
  requireSetupTokenOrConsoleSession
} from "@/lib/adminAuth";
import { getDefaultAccountId } from "@/lib/account";
import { parseAgentMetadata } from "@/lib/agents";
import { connectToDatabase } from "@/lib/db";
import { createApiKey, createPublicId } from "@/lib/ids";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";

export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  if (!isPublicAgentCreationEnabled()) {
    const authError = requireSetupTokenOrConsoleSession(request);
    if (authError) {
      return authError;
    }
  }

  await connectToDatabase();

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

  const apiKey = createApiKey();
  const agentId = createPublicId("agent");
  const accountId = await getDefaultAccountId();

  await Agent.create({
    agentId,
    accountId,
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

  return NextResponse.json(
    { agentId, apiKey, agentType: metadata.agentType, provider: metadata.provider },
    { status: 201 }
  );
}
