import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import {
  isPublicAgentCreationEnabled,
  requireSetupTokenOrConsoleSession
} from "@/lib/adminAuth";
import { getDefaultAccountId } from "@/lib/account";
import { connectToDatabase } from "@/lib/db";
import { createApiKey, createPublicId } from "@/lib/ids";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";
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

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return jsonError("Request body must be a JSON object.");
  }

  const unknownError = rejectUnknownFields(body, ["name"]);
  if (unknownError) {
    return jsonError(unknownError);
  }

  const name = readString(body.name);
  if (!name) {
    return jsonError("name is required.");
  }

  const apiKey = createApiKey();
  const agentId = createPublicId("agent");
  const accountId = await getDefaultAccountId();

  await Agent.create({
    agentId,
    accountId,
    name,
    apiKeyHash: hashApiKey(apiKey),
    status: "active"
  });

  emitWebhookEvent(
    createWebhookEvent(accountId, "agent.created", {
      agentId,
      name
    })
  );

  return NextResponse.json({ agentId, apiKey }, { status: 201 });
}
