import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Permission from "@/models/Permission";

type RouteContext = {
  params: Promise<{ agentId: string; permissionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { agentId, permissionId } = await context.params;

  const permission = await Permission.findOne({ developerUserId: auth.user.userId, agentId, permissionId });
  if (!permission) return jsonError("Permission not found.", 404);
  if (permission.status !== "revoked") {
    permission.status = "revoked";
    await permission.save();
  }

  await emitWebhookEvent(
    createWebhookEvent(null, "permission.revoked", { permissionId, agentId, action: permission.action }, auth.user.userId)
  );

  return NextResponse.json({ revoked: true });
}
