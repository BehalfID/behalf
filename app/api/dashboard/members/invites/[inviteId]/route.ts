import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, canManageMembers, roleDelegationForbidden } from "@/lib/delegatedAuth";
import { revokeInvite } from "@/lib/inviteAcceptance";
import { jsonError } from "@/lib/responses";

type RouteContext = {
  params: Promise<{ inviteId: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(_request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (!canManageMembers(actor)) return roleDelegationForbidden();

  const { inviteId } = await context.params;
  const revoked = await revokeInvite(actor.accountId, inviteId);
  if (!revoked) return jsonError("Invite not found or already handled.", 404);

  return NextResponse.json({ revoked: true });
}
