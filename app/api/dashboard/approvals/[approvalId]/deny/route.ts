import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import {
  approvalDenyForbidden,
  canDenyRequest,
  getWorkspaceActor,
  viewerMutationForbidden
} from "@/lib/delegatedAuth";
import { accountScopeFilter } from "@/lib/accountAccess";
import { jsonError } from "@/lib/responses";
import ApprovalRequest from "@/models/ApprovalRequest";

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
  if (!canDenyRequest(actor, approval)) {
    return approvalDenyForbidden();
  }

  const now = new Date();
  const result = await ApprovalRequest.updateOne(
    { approvalId, ...accountScopeFilter(actor.accountId), status: "pending" },
    {
      $set: {
        status: "denied",
        resolvedBy: auth.user.userId,
        resolvedAt: now
      }
    }
  );

  if (result.matchedCount !== 1) {
    return jsonError("Approval request not found or already resolved.", 404);
  }

  return NextResponse.json({ denied: true });
}
