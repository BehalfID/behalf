import { NextResponse, type NextRequest } from "next/server";
import { resolveApprovalDecision } from "@/lib/approvals/resolveApproval";
import { connectToDatabase } from "@/lib/db";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { verifySlackSignature } from "@/lib/integrations/collaboration/slack/signature";
import {
  findSlackBindingByTeamWithSecrets,
  resolveUserIdFromBinding
} from "@/lib/repositories/integrationBindings";
import { jsonError } from "@/lib/responses";

type SlackActionPayload = {
  type?: string;
  team?: { id?: string };
  user?: { id?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
  response_url?: string;
};

function readHeader(request: NextRequest, name: string) {
  return request.headers.get(name) ?? request.headers.get(name.toLowerCase());
}

/**
 * Slack interactive component endpoint.
 * Verifies signing secret, maps Slack user → BehalfID user, applies approval gates.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = readHeader(request, "X-Slack-Signature");
  const timestamp = readHeader(request, "X-Slack-Request-Timestamp");

  let payloadRaw: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    payloadRaw = params.get("payload");
  } else if (contentType.includes("application/json")) {
    payloadRaw = rawBody;
  }

  if (!payloadRaw) {
    return jsonError("Missing Slack payload.", 400);
  }

  let payload: SlackActionPayload;
  try {
    payload = JSON.parse(payloadRaw) as SlackActionPayload;
  } catch {
    return jsonError("Invalid Slack payload JSON.", 400);
  }

  const teamId = payload.team?.id;
  if (!teamId) return jsonError("Missing Slack team id.", 400);

  try {
    await connectToDatabase();
  } catch {
    return jsonError("Service temporarily unavailable.", 503);
  }

  const bindings = await findSlackBindingByTeamWithSecrets(teamId);
  if (!bindings.length) {
    return jsonError("No Slack integration binding found for this workspace.", 404);
  }

  const binding = bindings[0];
  const signingSecret = (binding as { signingSecret?: string }).signingSecret;
  if (!signingSecret) {
    return jsonError("Slack signing secret is not configured.", 500);
  }

  const valid = verifySlackSignature({
    signingSecret,
    signatureHeader: signature,
    timestampHeader: timestamp,
    rawBody
  });
  if (!valid) {
    return jsonError("Invalid Slack signature.", 401);
  }

  const action = payload.actions?.[0];
  const actionId = action?.action_id;
  const approvalId = action?.value;
  if (!actionId || !approvalId) {
    return jsonError("Missing approval action.", 400);
  }
  if (actionId === "approval_open_dashboard") {
    return NextResponse.json({ ok: true });
  }
  if (actionId !== "approval_approve" && actionId !== "approval_deny") {
    return jsonError("Unsupported Slack action.", 400);
  }

  const slackUserId = payload.user?.id;
  if (!slackUserId) return jsonError("Missing Slack user id.", 400);

  const userId = resolveUserIdFromBinding(binding, slackUserId);
  if (!userId) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Your Slack user is not linked to a BehalfID account. Ask an admin to map your identity."
    });
  }

  const actor = await getWorkspaceActor(userId, binding.accountId);
  if (!actor) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "You do not have access to this BehalfID workspace."
    });
  }

  const result = await resolveApprovalDecision({
    actor,
    approvalId,
    decision: actionId === "approval_approve" ? "approve" : "deny"
  });

  if (!result.ok) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: result.error
    });
  }

  // chat.update is also driven by approval.* lifecycle fan-out; acknowledge interactively.
  return NextResponse.json({
    response_type: "ephemeral",
    text:
      result.decision === "approve"
        ? `Approved ${approvalId}${result.grantExpiresAt ? ` (grant expires ${result.grantExpiresAt})` : ""}.`
        : `Denied ${approvalId}.`
  });
}
