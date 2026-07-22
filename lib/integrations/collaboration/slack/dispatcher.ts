import type { ApprovalLifecycleData } from "@/lib/approvals/emitLifecycle";
import type { WebhookEventType } from "@/lib/webhooks";
import {
  findMessageRefByApproval,
  findSlackBindingsWithSecrets,
  upsertMessageRef
} from "@/lib/repositories/integrationBindings";
import {
  buildApprovalRequestedBlocks,
  buildApprovalResolvedBlocks,
  resolvedStatusLabel
} from "@/lib/integrations/collaboration/slack/blocks";

type SlackApiResult = { ok: boolean; ts?: string; error?: string };

async function slackApi(
  botToken: string,
  method: string,
  body: Record<string, unknown>
): Promise<SlackApiResult> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  });
  const json = (await response.json()) as { ok?: boolean; ts?: string; error?: string };
  return {
    ok: Boolean(json.ok),
    ts: typeof json.ts === "string" ? json.ts : undefined,
    error: json.error
  };
}

function isApprovalLifecycleData(data: Record<string, unknown>): data is ApprovalLifecycleData {
  return (
    typeof data.approvalId === "string" &&
    typeof data.action === "string" &&
    typeof data.status === "string" &&
    typeof data.dashboardUrl === "string"
  );
}

/**
 * Fan-out approval lifecycle events to configured Slack channels.
 * Never throws — collaboration delivery must not fail the primary path.
 */
export async function dispatchSlackApprovalEvent(input: {
  accountId: string;
  type: WebhookEventType | string;
  data: Record<string, unknown>;
}) {
  try {
    if (!input.accountId) return;
    if (
      input.type !== "approval.requested" &&
      input.type !== "approval.approved" &&
      input.type !== "approval.denied" &&
      input.type !== "approval.used"
    ) {
      return;
    }
    if (!isApprovalLifecycleData(input.data)) return;

    const bindings = await findSlackBindingsWithSecrets(input.accountId);
    if (!bindings.length) return;

    const data = input.data;

    if (input.type === "approval.requested") {
      const blocks = buildApprovalRequestedBlocks(data);
      const text = `Approval required: ${data.action}`;
      for (const binding of bindings) {
        const botToken = (binding as { botToken?: string }).botToken;
        if (!botToken) continue;
        const posted = await slackApi(botToken, "chat.postMessage", {
          channel: binding.channelId,
          text,
          blocks
        });
        if (posted.ok && posted.ts) {
          await upsertMessageRef({
            accountId: input.accountId,
            bindingId: binding.bindingId,
            approvalId: data.approvalId,
            channelId: binding.channelId,
            messageTs: posted.ts,
            status: "pending"
          });
        }
      }
      return;
    }

    const ref = await findMessageRefByApproval(input.accountId, data.approvalId, "slack");
    if (!ref) return;

    const binding = bindings.find((item) => item.bindingId === ref.bindingId) ?? bindings[0];
    const botToken = binding ? (binding as { botToken?: string }).botToken : undefined;
    if (!binding || !botToken) return;

    const label = resolvedStatusLabel(data);
    const blocks = buildApprovalResolvedBlocks(data, label);
    await slackApi(botToken, "chat.update", {
      channel: ref.channelId,
      ts: ref.messageTs,
      text: label,
      blocks
    });
    await upsertMessageRef({
      accountId: input.accountId,
      bindingId: binding.bindingId,
      approvalId: data.approvalId,
      channelId: ref.channelId,
      messageTs: ref.messageTs,
      status: data.status
    });
  } catch {
    // Swallow — Slack outages must not break approvals.
  }
}
