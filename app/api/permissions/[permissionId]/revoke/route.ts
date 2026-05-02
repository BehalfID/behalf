import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Permission from "@/models/Permission";

type RouteContext = {
  params: Promise<{ permissionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { permissionId } = await context.params;
  if (!permissionId) {
    return jsonError("permissionId is required.");
  }

  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  await connectToDatabase();

  const auth = await authenticateApiKey(request);
  if (auth.error || !auth.agent) {
    return jsonError(auth.error, 401);
  }

  const limit = await checkRateLimit(request, auth.agent.apiKeyHash);
  if (limit.limited) {
    return rateLimitError();
  }

  const permission = await Permission.findOne({
    permissionId,
    agentId: auth.agent.agentId
  });
  if (!permission) {
    return jsonError("Permission not found.", 404);
  }

  if (permission.status !== "revoked") {
    permission.status = "revoked";
    await permission.save();
  }

  emitWebhookEvent(
    createWebhookEvent(auth.agent.accountId, "permission.revoked", {
      permissionId,
      agentId: auth.agent.agentId,
      action: permission.action
    })
  );

  return NextResponse.json({ revoked: true });
}
