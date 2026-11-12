import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { jsonError } from "@/lib/responses";

export const BILLING_OWNER_REQUIRED = "Only workspace owners can manage billing.";

/**
 * Billing actions (Stripe checkout / customer portal) act on the whole
 * workspace's subscription, payment method and invoices, so they are limited to
 * workspace OWNERs. Returns an error response when the caller may not manage
 * billing for `accountId`, or null when they may.
 */
export async function requireBillingOwner(
  userId: string,
  accountId: string | null | undefined
): Promise<Response | null> {
  const actor = await getWorkspaceActor(userId, accountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (actor.role !== "OWNER") return jsonError(BILLING_OWNER_REQUIRED, 403);
  return null;
}
