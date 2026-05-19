import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { authenticateDeveloperToken } from "@/lib/developerToken";
import { checkAndIncrementVerifications } from "@/lib/quota";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { isRecord, parseOptionalAmount, readString, rejectUnknownFields } from "@/lib/validation";
import { verifyAction } from "@/lib/verify";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";

export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "agentId",
    "action",
    "amount",
    "vendor",
    "resource",
    "metadata"
  ]);
  if (unknownError) {
    return jsonError(unknownError);
  }

  const agentId = readString(body.agentId);
  const action = readString(body.action);
  const vendor = body.vendor === undefined ? readString(body.resource) || undefined : readString(body.vendor);

  if (!agentId) {
    return jsonError("agentId is required.");
  }

  if (!action) {
    return jsonError("action is required.");
  }

  if ((body.vendor !== undefined || body.resource !== undefined) && !vendor) {
    return jsonError("resource must be a non-empty string.");
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

  try {
    await connectToDatabase();
  } catch {
    return jsonError("Service temporarily unavailable.", 503);
  }

  const auth = await authenticateAgent(request, agentId);
  if (auth.error || !auth.agent) {
    return jsonError(auth.error, auth.error === "Unknown agent." ? 404 : 401);
  }

  const { tokenDoc, error: tokenError } = await authenticateDeveloperToken(request);
  if (tokenError) {
    return jsonError(tokenError, 401);
  }
  if (tokenDoc && auth.agent.accountId !== tokenDoc.accountId) {
    return jsonError("Agent does not belong to this developer account.", 403);
  }

  const limit = await checkRateLimit(request, auth.agent.apiKeyHash);
  if (limit.limited) {
    return rateLimitError();
  }

  const quota = await checkAndIncrementVerifications(auth.agent.accountId);
  if (!quota.allowed) {
    return jsonError(quota.reason ?? "Verification quota exceeded.", 429);
  }

  let decision;
  try {
    decision = await verifyAction({
      agentId,
      accountId: auth.agent.accountId ?? undefined,
      developerUserId: auth.agent.developerUserId ?? undefined,
      agentStatus: auth.agent.status,
      action,
      amount,
      vendor,
      metadata: body.metadata
    });
  } catch {
    return jsonError("Verification failed closed.", 503);
  }

  await emitWebhookEvent(
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
      },
      auth.agent.developerUserId
    )
  );

  return NextResponse.json({
    requestId: decision.requestId,
    allowed: decision.allowed,
    reason: decision.reason,
    risk: decision.risk
  });
}
