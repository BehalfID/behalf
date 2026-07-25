import { NextResponse, type NextRequest } from "next/server";
import { fetchPublicHttpRequest, fetchPublicWebRead } from "@/lib/actionGateway";
import { agentAuthJsonError } from "@/lib/appErrors";
import { authenticateAgent } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";
import { verifyAction } from "@/lib/verify";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";

/**
 * Generalized Action Gateway (Tier 1 execution proxy).
 * Supports:
 * - browse_web + resource web (read-only GET excerpt)
 * - http_request against a public URL (method/path/body via input)
 */
export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) return rateLimitError();

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
  if (!isRecord(body.input)) return jsonError("input must be an object.");

  try {
    await connectToDatabase();
  } catch {
    return jsonError("Service temporarily unavailable.", 503);
  }

  const auth = await authenticateAgent(request, agentId);
  if (auth.error || !auth.agent) {
    return agentAuthJsonError(auth.error);
  }

  const limit = await checkRateLimit(request, auth.agent.apiKeyHash);
  if (limit.limited) return rateLimitError();

  const isBrowse = action === "browse_web" && (resource === "web" || !resource);
  const isHttpRequest = action === "http_request";
  const supported = isBrowse || isHttpRequest;

  let vendor: string | undefined = resource ?? undefined;
  if (isHttpRequest) {
    const url = readString(body.input.url);
    if (url) {
      try {
        vendor = new URL(url).hostname;
      } catch {
        vendor = resource ?? undefined;
      }
    }
  }

  let decision;
  try {
    decision = await verifyAction({
      agentId,
      accountId: auth.agent.accountId ?? undefined,
      developerUserId: auth.agent.developerUserId ?? undefined,
      agentStatus: auth.agent.status,
      action,
      vendor: vendor || undefined,
      metadata: { gateway: "gateway.execute", resource: resource || undefined },
      enforcementDenyReason: supported
        ? undefined
        : "Gateway supports browse_web and http_request only."
    });
  } catch {
    return NextResponse.json(
      {
        allowed: false,
        decision: "denied",
        reason: "Verification failed closed.",
        executed: false
      },
      { status: 503 }
    );
  }

  await emitWebhookEvent(
    createWebhookEvent(
      auth.agent.accountId,
      decision.allowed
        ? "verification.allowed"
        : decision.approvalRequired
          ? "verification.approval_required"
          : "verification.denied",
      {
        requestId: decision.requestId,
        agentId,
        action,
        allowed: decision.allowed,
        approvalRequired: decision.approvalRequired ?? false,
        ...(decision.approvalId ? { approvalId: decision.approvalId } : {}),
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
      decision: decision.approvalRequired ? "approval_required" : "denied",
      reason: decision.reason,
      executed: false,
      ...(decision.approvalId ? { approvalId: decision.approvalId } : {})
    });
  }

  try {
    if (isBrowse) {
      const inputUnknownError = rejectUnknownFields(body.input, ["url"]);
      if (inputUnknownError) return jsonError(inputUnknownError);
      const url = readString(body.input.url);
      if (!url) return jsonError("input.url is required.");
      const result = await fetchPublicWebRead(url);
      return NextResponse.json({
        requestId: decision.requestId,
        allowed: true,
        decision: "allowed",
        reason: decision.reason,
        executed: true,
        result
      });
    }

    const inputUnknownError = rejectUnknownFields(body.input, [
      "method",
      "url",
      "headers",
      "body",
      "maxBytes"
    ]);
    if (inputUnknownError) return jsonError(inputUnknownError);

    const url = readString(body.input.url);
    const method = readString(body.input.method) || "GET";
    if (!url) return jsonError("input.url is required.");

    let headers: Record<string, string> | undefined;
    if (body.input.headers !== undefined) {
      if (!isRecord(body.input.headers)) return jsonError("input.headers must be an object.");
      headers = {};
      for (const [key, value] of Object.entries(body.input.headers)) {
        if (typeof value !== "string") return jsonError("input.headers values must be strings.");
        headers[key] = value;
      }
    }

    const result = await fetchPublicHttpRequest({
      method,
      url,
      headers,
      body: body.input.body === undefined ? undefined : String(body.input.body),
      maxBytes: typeof body.input.maxBytes === "number" ? body.input.maxBytes : undefined
    });

    return NextResponse.json({
      requestId: decision.requestId,
      allowed: true,
      decision: "allowed",
      reason: decision.reason,
      executed: true,
      result
    });
  } catch (execError) {
    return NextResponse.json(
      {
        requestId: decision.requestId,
        allowed: true,
        decision: "allowed",
        reason: decision.reason,
        executed: false,
        error: execError instanceof Error ? execError.message : "Gateway execution failed."
      },
      { status: 400 }
    );
  }
}
