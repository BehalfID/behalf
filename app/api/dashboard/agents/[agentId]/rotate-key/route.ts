import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import { accountAgentFilter } from "@/lib/accountAgents";
import { requireDeveloperApi } from "@/lib/developerAuth";
import {
  authorityForbidden,
  getEffectiveRequiredAuthority,
  getWorkspaceActor
} from "@/lib/delegatedAuth";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { createApiKey } from "@/lib/ids";
import { serverErrorResponse } from "@/lib/apiErrors";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import { updateAgent } from "@/lib/repositories/agents";
import { findActivePermissionsByAgentId } from "@/lib/repositories/permissions";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const workspace = await requireWorkspaceMutationActor(auth.user, auth.activeAccountId);
  if (workspace.error) return workspace.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const { agentId } = await context.params;

  // The new key wields every active grant on the agent. A member may only
  // obtain it if they could have granted (or revoked) each of those
  // permissions themselves; otherwise rotation would hand an engineer a
  // credential carrying owner/lead-level authority.
  if (actor.role !== "OWNER") {
    const activePermissions = await findActivePermissionsByAgentId(agentId, {
      accountId: actor.accountId
    });
    const exceeds = activePermissions.some(
      (permission) => getEffectiveRequiredAuthority(permission) > actor.authorityLevel
    );
    if (exceeds) {
      return authorityForbidden(
        "This agent holds permissions above your authority level. Ask a workspace owner, or a member with enough authority, to rotate its key."
      );
    }
  }

  const apiKey = createApiKey();

  // The hash swap is the rotation. `accountAgentFilter` keeps it scoped to the
  // actor's workspace, so another workspace's agent can never be rotated.
  let result: Awaited<ReturnType<typeof updateAgent>>;
  try {
    result = await updateAgent(accountAgentFilter(actor, agentId), {
      $set: { apiKeyHash: hashApiKey(apiKey), keyRotatedAt: new Date() },
      $unset: { lastUsedAt: "" }
    });
  } catch (error) {
    // Never let the plaintext key reach the log or the error body.
    return serverErrorResponse("agents.key_rotate", error, {
      userId: auth.user.userId,
      accountId: actor.accountId,
      agentId
    });
  }
  if (result.matchedCount !== 1) return jsonError("Agent not found.", 404);

  // Rotation has committed and the old key is already invalid. The event is a
  // notification only — `emitWebhookEvent` never throws, so a completed
  // rotation can no longer be reported to the caller as a failure.
  await emitWebhookEvent(
    createWebhookEvent(actor.accountId, "agent.key_rotated", { agentId }, auth.user.userId)
  );

  return NextResponse.json({ agentId, apiKey });
}
