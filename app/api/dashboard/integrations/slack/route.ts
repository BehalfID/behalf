import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import {
  canManageMembers,
  getWorkspaceActor,
  serializeWorkspaceAuthority,
  type WorkspaceActor
} from "@/lib/delegatedAuth";
import { getAuthorityLevelForRole, resolveWorkspaceRole } from "@/lib/authority";
import { findMembershipByAccountAndUser } from "@/lib/repositories/memberships";
import { readJsonObject } from "@/lib/request";
import {
  createSlackBinding,
  disableIntegrationBinding,
  listIntegrationBindings,
  upsertIdentityMapping
} from "@/lib/repositories/integrationBindings";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";

const SLACK_MANAGE_FORBIDDEN =
  "Only workspace owners and engineering leads can manage the Slack integration.";

/**
 * A Slack identity mapping lets whoever controls that Slack user act as the
 * mapped BehalfID user when approving or denying requests. Only allow mapping
 * yourself, or a current member whose authority is below yours (owners may map
 * any member). Otherwise a lower-authority member could map their own Slack
 * account to an owner and approve anything.
 */
async function canMapSlackIdentity(actor: WorkspaceActor, targetUserId: string): Promise<boolean> {
  if (targetUserId === actor.userId) return true;
  const membership = await findMembershipByAccountAndUser(actor.accountId, targetUserId);
  if (!membership) return false;
  if (actor.role === "OWNER") return true;
  const targetLevel = getAuthorityLevelForRole(resolveWorkspaceRole(membership.role));
  return targetLevel < actor.authorityLevel;
}

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const bindings = await listIntegrationBindings(actor.accountId, "slack");
  return noCacheJson({
    bindings,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (!canManageMembers(actor)) return jsonError(SLACK_MANAGE_FORBIDDEN, 403);

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "teamId",
    "teamName",
    "channelId",
    "channelName",
    "botToken",
    "signingSecret",
    "identityMap"
  ]);
  if (unknownError) return jsonError(unknownError);

  const teamId = readString(body.teamId);
  const channelId = readString(body.channelId);
  const botToken = readString(body.botToken);
  const signingSecret = readString(body.signingSecret);
  if (!teamId || !channelId || !botToken || !signingSecret) {
    return jsonError("teamId, channelId, botToken, and signingSecret are required.");
  }

  let identityMap: Array<{ externalUserId: string; userId: string }> | undefined;
  if (body.identityMap !== undefined) {
    if (!Array.isArray(body.identityMap)) {
      return jsonError("identityMap must be an array.");
    }
    identityMap = [];
    for (const entry of body.identityMap) {
      if (!entry || typeof entry !== "object") {
        return jsonError("identityMap entries must be objects.");
      }
      const externalUserId = readString((entry as { externalUserId?: unknown }).externalUserId);
      const userId = readString((entry as { userId?: unknown }).userId);
      if (!externalUserId || !userId) {
        return jsonError("identityMap entries require externalUserId and userId.");
      }
      if (!(await canMapSlackIdentity(actor, userId))) {
        return jsonError("You cannot map a Slack identity to that user.", 403);
      }
      identityMap.push({ externalUserId, userId });
    }
  }

  try {
    const created = await createSlackBinding({
      accountId: actor.accountId,
      teamId,
      teamName: body.teamName === undefined ? undefined : readString(body.teamName) || undefined,
      channelId,
      channelName:
        body.channelName === undefined ? undefined : readString(body.channelName) || undefined,
      botToken,
      signingSecret,
      createdBy: actor.userId,
      identityMap
    });

    return NextResponse.json(
      {
        binding: {
          bindingId: created.bindingId,
          accountId: created.accountId,
          provider: created.provider,
          status: created.status,
          teamId: created.teamId,
          teamName: created.teamName,
          channelId: created.channelId,
          channelName: created.channelName,
          identityMap: created.identityMap,
          createdBy: created.createdBy
        }
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create Slack binding.";
    if (/duplicate|E11000/i.test(message)) {
      return jsonError("A Slack binding already exists for this team and channel.", 409);
    }
    return jsonError("Failed to create Slack binding.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (!canManageMembers(actor)) return jsonError(SLACK_MANAGE_FORBIDDEN, 403);

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "bindingId",
    "externalUserId",
    "userId",
    "disable"
  ]);
  if (unknownError) return jsonError(unknownError);

  const bindingId = readString(body.bindingId);
  if (!bindingId) return jsonError("bindingId is required.");

  if (body.disable === true) {
    const disabled = await disableIntegrationBinding(bindingId, actor.accountId);
    if (!disabled) return jsonError("Binding not found.", 404);
    return NextResponse.json({ binding: disabled });
  }

  const externalUserId = readString(body.externalUserId);
  const userId = readString(body.userId);
  if (!externalUserId || !userId) {
    return jsonError("externalUserId and userId are required to map identity.");
  }
  if (!(await canMapSlackIdentity(actor, userId))) {
    return jsonError("You cannot map a Slack identity to that user.", 403);
  }

  const updated = await upsertIdentityMapping(
    bindingId,
    actor.accountId,
    externalUserId,
    userId
  );
  if (!updated) return jsonError("Binding not found.", 404);

  return NextResponse.json({
    binding: {
      bindingId: updated.bindingId,
      accountId: updated.accountId,
      identityMap: updated.identityMap
    }
  });
}
