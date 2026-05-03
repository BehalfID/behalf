import { NextResponse, type NextRequest } from "next/server";
import { createDeveloperAgent, serializeAgent } from "@/lib/dashboardData";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const agents = await Agent.find({ developerUserId: auth.user.userId })
    .sort({ createdAt: -1 })
    .select("-_id agentId name status lastUsedAt keyRotatedAt createdAt updatedAt")
    .lean();

  return NextResponse.json({ agents: agents.map(serializeAgent) });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["name"]);
  if (unknownError) return jsonError(unknownError);

  const name = readString(body.name);
  if (!name) return jsonError("name is required.");

  const result = await createDeveloperAgent(auth.user.userId, name);
  await emitWebhookEvent(
    createWebhookEvent(null, "agent.created", { agentId: result.agent.agentId, name }, auth.user.userId)
  );
  return NextResponse.json(result, { status: 201 });
}
