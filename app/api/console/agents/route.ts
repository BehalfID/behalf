import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId, serializeAgent } from "@/lib/consoleData";
import { createApiKey, createPublicId } from "@/lib/ids";
import { jsonError } from "@/lib/responses";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const accountId = await getConsoleAccountId();
  const agents = await Agent.find({ accountId })
    .sort({ createdAt: -1 })
    .select("-_id agentId name status lastUsedAt keyRotatedAt createdAt updatedAt")
    .lean();

  return NextResponse.json({ agents });
}

export async function POST(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

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

  const accountId = await getConsoleAccountId();
  const agentId = createPublicId("agent");
  const apiKey = createApiKey();
  const agent = await Agent.create({
    accountId,
    agentId,
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

  return NextResponse.json(
    {
      agent: await serializeAgent(agent),
      apiKey
    },
    { status: 201 }
  );
}
