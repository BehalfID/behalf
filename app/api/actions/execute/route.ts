import { NextResponse, type NextRequest } from "next/server";
import { fetchPublicWebRead } from "@/lib/actionGateway";
import { authenticateAgent } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";
import { verifyAction } from "@/lib/verify";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";

const SUPPORTED_ACTION = "browse_web";
const SUPPORTED_RESOURCE = "web";

export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["agentId", "action", "resource", "input"]);
  if (unknownError) return jsonError(unknownError);

  const agentId = readString(body.agentId);
  const action = readString(body.action);
  const resource = readString(body.resource);

  if (!agentId) return jsonError("agentId is required.");
  if (!action) return jsonError("action is required.");
  if (!resource) return jsonError("resource is required.");
  if (!isRecord(body.input)) return jsonError("input must be an object.");

  const inputUnknownError = rejectUnknownFields(body.input, ["url"]);
  if (inputUnknownError) return jsonError(inputUnknownError);

  try {
    await connectToDatabase();
  } catch {
    return jsonError("Service temporarily unavailable.", 503);
  }

  const auth = await authenticateAgent(request, agentId);
  if (auth.error || !auth.agent) {
    return jsonError(auth.error, auth.error === "Unknown agent." ? 404 : 401);
  }

  const limit = await checkRateLimit(request, auth.agent.apiKeyHash);
  if (limit.limited) {
    return rateLimitError();
  }

  const supported = action === SUPPORTED_ACTION && resource === SUPPORTED_RESOURCE;
  let decision;
  try {
    decision = await verifyAction({
      agentId,
      accountId: auth.agent.accountId ?? undefined,
      developerUserId: auth.agent.developerUserId ?? undefined,
      agentStatus: auth.agent.status,
      action,
      vendor: resource,
      metadata: { gateway: "actions.execute", resource },
      enforcementDenyReason: supported
        ? undefined
        : "Action Gateway MVP only supports browse_web on the web resource."
    });
  } catch {
    return NextResponse.json({
      allowed: false,
      decision: "denied",
      reason: "Verification failed closed.",
      executed: false
    }, { status: 503 });
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

  if (!decision.allowed) {
    return NextResponse.json({
      requestId: decision.requestId,
      allowed: false,
      decision: "denied",
      reason: decision.reason,
      executed: false
    });
  }

  const url = readString(body.input.url);
  if (!url) return jsonError("input.url is required.");

  try {
    const result = await fetchPublicWebRead(url);
    return NextResponse.json({
      requestId: decision.requestId,
      allowed: true,
      decision: "allowed",
      reason: decision.reason,
      executed: true,
      result
    });
  } catch (error) {
    return NextResponse.json({
      requestId: decision.requestId,
      allowed: true,
      decision: "allowed",
      reason: decision.reason,
      executed: false,
      error: error instanceof Error ? error.message : "Gateway execution failed."
    }, { status: 400 });
  }
}
