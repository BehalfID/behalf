import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import {
  approvalForbidden,
  canApproveRequest,
  getWorkspaceActor,
  viewerMutationForbidden
} from "@/lib/delegatedAuth";
import { accountScopeFilter } from "@/lib/accountAccess";
import { jsonError } from "@/lib/responses";
import ApprovalRequest, { APPROVAL_GRANT_TTL_MS } from "@/models/ApprovalRequest";

type RouteContext = {
  params: Promise<{ approvalId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { approvalId } = await context.params;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (actor.authorityLevel <= 10) return viewerMutationForbidden();

  const approval = await ApprovalRequest.findOne({
    approvalId,
    ...accountScopeFilter(actor.accountId),
    status: "pending"
  }).lean();
  if (!approval) {
    return jsonError("Approval request not found or already resolved.", 404);
  }
  if (!canApproveRequest(actor, approval)) {
    return approvalForbidden();
  }

  const now = new Date();
  const grantExpiresAt = new Date(now.getTime() + APPROVAL_GRANT_TTL_MS);

  const result = await ApprovalRequest.updateOne(
    { approvalId, ...accountScopeFilter(actor.accountId), status: "pending" },
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
