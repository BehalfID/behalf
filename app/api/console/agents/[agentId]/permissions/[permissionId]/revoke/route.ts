import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import { jsonError } from "@/lib/responses";
import Permission from "@/models/Permission";

type RouteContext = {
  params: Promise<{ agentId: string; permissionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { agentId, permissionId } = await context.params;
  const accountId = await getConsoleAccountId();
  const permission = await Permission.findOne({ accountId, agentId, permissionId });
  if (!permission) {
    return jsonError("Permission not found.", 404);
  }

  if (permission.status !== "revoked") {
    permission.status = "revoked";
    await permission.save();
  }

  return NextResponse.json({ revoked: true });
}
