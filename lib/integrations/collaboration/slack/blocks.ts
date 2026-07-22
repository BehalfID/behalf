import type { ApprovalLifecycleData } from "@/lib/approvals/emitLifecycle";
import { getRequiredRoleLabel } from "@/lib/authority";

export type SlackBlock = Record<string, unknown>;

function authorityLabel(level: number | undefined): string {
  if (typeof level !== "number") return "Authorized approver";
  try {
    return getRequiredRoleLabel(level);
  } catch {
    return `Authority ≥ ${level}`;
  }
}

export function buildApprovalRequestedBlocks(data: ApprovalLifecycleData): SlackBlock[] {
  const fields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `*Action*\n\`${data.action}\`` },
    { type: "mrkdwn", text: `*Kind*\n${data.kind}` }
  ];
  if (data.agentId) fields.push({ type: "mrkdwn", text: `*Agent*\n\`${data.agentId}\`` });
  if (data.vendor) fields.push({ type: "mrkdwn", text: `*Vendor*\n${data.vendor}` });
  if (typeof data.amount === "number") {
    fields.push({ type: "mrkdwn", text: `*Amount*\n${data.amount}` });
  }
  fields.push({
    type: "mrkdwn",
    text: `*Required authority*\n${authorityLabel(data.requiredAuthorityLevel)}`
  });

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Approval required", emoji: false }
    },
    { type: "section", fields },
  ];

  if (data.argumentPreview) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Preview*\n\`\`\`${data.argumentPreview.slice(0, 2800)}\`\`\``
      }
    });
  }

  blocks.push(
    {
      type: "actions",
      block_id: `approval_actions:${data.approvalId}`,
      elements: [
        {
          type: "button",
          action_id: "approval_approve",
          text: { type: "plain_text", text: "Approve", emoji: false },
          style: "primary",
          value: data.approvalId
        },
        {
          type: "button",
          action_id: "approval_deny",
          text: { type: "plain_text", text: "Deny", emoji: false },
          style: "danger",
          value: data.approvalId
        },
        {
          type: "button",
          action_id: "approval_open_dashboard",
          text: { type: "plain_text", text: "Open dashboard", emoji: false },
          url: data.dashboardUrl
        }
      ]
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Approval \`${data.approvalId}\`${data.requestId ? ` · request \`${data.requestId}\`` : ""}`
        }
      ]
    }
  );

  return blocks;
}

export function buildApprovalResolvedBlocks(
  data: ApprovalLifecycleData,
  resolvedLabel: string
): SlackBlock[] {
  const statusEmoji =
    data.status === "approved" ? "Approved" : data.status === "denied" ? "Denied" : "Used";

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Approval ${statusEmoji}`, emoji: false }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${resolvedLabel}*\nAction \`${data.action}\`${data.agentId ? ` · agent \`${data.agentId}\`` : ""}`
      }
    }
  ];

  if (data.argumentPreview) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Preview*\n\`\`\`${data.argumentPreview.slice(0, 2800)}\`\`\``
      }
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `<${data.dashboardUrl}|Open in dashboard> · \`${data.approvalId}\``
      }
    ]
  });

  return blocks;
}

export function resolvedStatusLabel(data: ApprovalLifecycleData): string {
  if (data.status === "approved") {
    return data.resolvedBy
      ? `Approved by \`${data.resolvedBy}\``
      : "Approved";
  }
  if (data.status === "denied") {
    return data.resolvedBy ? `Denied by \`${data.resolvedBy}\`` : "Denied";
  }
  if (data.status === "used") {
    return data.resolvedBy
      ? `Grant used (approved by \`${data.resolvedBy}\`)`
      : "Grant used";
  }
  return "Updated";
}
