import { canManageAgents, getWorkspaceActor, viewerMutationForbidden } from "@/lib/delegatedAuth";
import { jsonError } from "@/lib/responses";
import type { DeveloperUserDocument } from "@/models/DeveloperUser";

export async function requireWorkspaceMutationActor(
  user: Pick<DeveloperUserDocument, "userId" | "primaryAccountId">
) {
  const actor = await getWorkspaceActor(user.userId, user.primaryAccountId);
  if (!actor) {
    return { actor: null, error: jsonError("Workspace account required.", 403) };
  }
  if (!canManageAgents(actor)) {
    return { actor: null, error: viewerMutationForbidden() };
  }
  return { actor, error: null };
}
