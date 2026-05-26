import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import ApprovalRequest, { APPROVAL_GRANT_TTL_MS } from "@/models/ApprovalRequest";

type RouteContext = {
  params: Promise<{ approvalId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { approvalId } = await context.params;
  const now = new Date();
  const grantExpiresAt = new Date(now.getTime() + APPROVAL_GRANT_TTL_MS);

  const result = await ApprovalRequest.updateOne(
    { approvalId, developerUserId: auth.user.userId, status: "pending" },
    {
      $set: {
        status: "approved",
        resolvedBy: auth.user.userId,
        resolvedAt: now,
        grantExpiresAt
      }
    }
  );

  if (result.matchedCount !== 1) {
    return jsonError("Approval request not found or already resolved.", 404);
  }

  return NextResponse.json({ approved: true, grantExpiresAt: grantExpiresAt.toISOString() });
}
