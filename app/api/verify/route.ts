import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import { isRecord, parseOptionalAmount, readString, rejectUnknownFields } from "@/lib/validation";
import { verifyAction } from "@/lib/verify";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";

export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return jsonError("Request body must be a JSON object.");
  }

  const unknownError = rejectUnknownFields(body, [
    "agentId",
    "action",
    "amount",
    "vendor",
    "metadata"
  ]);
  if (unknownError) {
    return jsonError(unknownError);
  }

  const agentId = readString(body.agentId);
  const action = readString(body.action);
  const vendor = body.vendor === undefined ? undefined : readString(body.vendor);

  if (!agentId) {
    return jsonError("agentId is required.");
  }

  if (!action) {
    return jsonError("action is required.");
  }

  if (body.vendor !== undefined && !vendor) {
    return jsonError("vendor must be a non-empty string.");
  }

  const { amount, error: amountError } = parseOptionalAmount(body.amount);
  if (amountError) {
    return jsonError(amountError);
  }

  if (
    body.metadata !== undefined &&
    (!isRecord(body.metadata) || JSON.stringify(body.metadata).length > 2048)
  ) {
    return jsonError("metadata must be an object under 2KB.");
  }

  await connectToDatabase();

  const auth = await authenticateAgent(request, agentId);
  if (auth.error || !auth.agent) {
    return jsonError(auth.error, auth.error === "Unknown agent." ? 404 : 401);
  }

  const limit = await checkRateLimit(request, auth.agent.apiKeyHash);
  if (limit.limited) {
    return rateLimitError();
  }

  const decision = await verifyAction({
    agentId,
    accountId: auth.agent.accountId ?? undefined,
    agentStatus: auth.agent.status,
    action,
    amount,
    vendor,
    metadata: body.metadata
  });

  emitWebhookEvent(
    createWebhookEvent(
      auth.agent.accountId,
      decision.allowed ? "verification.allowed" : "verification.denied",
      {
        requestId: decision.requestId,
        agentId,
        action,
        allowed: decision.allowed,
        risk: decision.risk,
        permissionId: decision.permissionId
      }
    )
  );

  return NextResponse.json({
    requestId: decision.requestId,
    allowed: decision.allowed,
    reason: decision.reason,
    risk: decision.risk
  });
}
