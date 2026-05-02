import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/responses";
import Permission from "@/models/Permission";

type RouteContext = {
  params: Promise<{ permissionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  await connectToDatabase();

  const { permissionId } = await context.params;
  if (!permissionId) {
    return jsonError("permissionId is required.");
  }

  const auth = await authenticateApiKey(request);
  if (auth.error || !auth.agent) {
    return jsonError(auth.error, 401);
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

  return NextResponse.json({ revoked: true });
}
