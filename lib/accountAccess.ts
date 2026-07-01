import type { WorkspaceActor } from "@/lib/delegatedAuth";

/** Account-scoped query for dashboard resources tied to an account. */
export function accountScopeFilter(accountId: string) {
  return { accountId };
}

export function canAccessAccountResource(actor: WorkspaceActor, resourceAccountId?: string | null) {
  if (!resourceAccountId) return false;
  return actor.accountId === resourceAccountId;
}
