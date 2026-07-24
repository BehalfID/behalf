import { jsonAppError } from "@/lib/appErrors";
import { canManageAgents, getWorkspaceActor, viewerMutationForbidden } from "@/lib/delegatedAuth";
import type { DeveloperUserDocument } from "@/models/DeveloperUser";

export async function requireWorkspaceMutationActor(
  user: Pick<DeveloperUserDocument, "userId" | "primaryAccountId">,
  activeAccountId?: string | null
) {
  const accountId = activeAccountId ?? user.primaryAccountId;
  const actor = await getWorkspaceActor(user.userId, accountId);
  if (!actor) {
    return {
      actor: null,
      error: jsonAppError("Workspace account required.", 403, "WORKSPACE_ACCOUNT_REQUIRED")
    };
  }
  if (!canManageAgents(actor)) {
    return { actor: null, error: viewerMutationForbidden() };
  }
  return { actor, error: null };
}
