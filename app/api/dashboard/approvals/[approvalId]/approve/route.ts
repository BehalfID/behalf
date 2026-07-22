import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import {
  getWorkspaceActor,
  viewerMutationForbidden
} from "@/lib/delegatedAuth";
import { resolveApprovalDecision } from "@/lib/approvals/resolveApproval";
import { jsonError } from "@/lib/responses";

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

  const result = await resolveApprovalDecision({
    actor,
    approvalId,
    decision: "approve"
  });

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return NextResponse.json({
    approved: true,
    grantExpiresAt: result.grantExpiresAt
  });
}
