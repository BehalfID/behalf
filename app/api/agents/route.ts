import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { createApiKey, createPublicId } from "@/lib/ids";
import { jsonError } from "@/lib/responses";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";
import Agent from "@/models/Agent";

export async function POST(request: NextRequest) {
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

  await Agent.create({
    agentId,
    name,
    apiKeyHash: hashApiKey(apiKey)
  });

  return NextResponse.json({ agentId, apiKey }, { status: 201 });
}
