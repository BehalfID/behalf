import type { WebhookEventType } from "@/lib/webhooks";
import { dispatchSlackApprovalEvent } from "@/lib/integrations/collaboration/slack/dispatcher";

/**
 * Fan-out collaboration notifications for approval lifecycle events.
 */
export async function dispatchCollaborationEvent(input: {
  accountId?: string | null;
  type: WebhookEventType | string;
  data: Record<string, unknown>;
}) {
  if (!input.accountId) return;
  await dispatchSlackApprovalEvent({
    accountId: input.accountId,
    type: input.type,
    data: input.data
  });
}
