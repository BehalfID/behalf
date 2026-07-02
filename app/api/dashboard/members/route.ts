import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import {
  addOrInviteMember,
  listAccountMembers
} from "@/lib/membershipManagement";
import { canManageMembers, canViewMembers, getWorkspaceActor, roleDelegationForbidden, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { isWorkspaceRole } from "@/lib/authority";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readJsonObject } from "@/lib/request";
import { readString, rejectUnknownFields } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.user.primaryAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const { members, pendingInvites } = await listAccountMembers(actor.accountId);
  const visibleMembers = canViewMembers(actor)
    ? members
    : members.filter((member) => member.userId === actor.userId);

  return noCacheJson({
    members: visibleMembers,
    pendingInvites: canManageMembers(actor) ? pendingInvites : [],
    workspaceAuthority: serializeWorkspaceAuthority(actor),
    canManageMembers: canManageMembers(actor)
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.user.primaryAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (!canManageMembers(actor)) return roleDelegationForbidden();

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["email", "role"]);
  if (unknownError) return jsonError(unknownError);

  const email = readString(body.email);
  const role = readString(body.role);
  if (!email) return jsonError("email is required.");
  if (!role || !isWorkspaceRole(role) || role === "OWNER") {
    return jsonError("role must be one of: ENGINEERING_LEAD, SENIOR_ENGINEER, ENGINEER, VIEWER.");
  }

  const result = await addOrInviteMember(actor, { email, role });
  if ("error" in result) {
    return typeof result.error === "string"
      ? jsonError(result.error, 400)
      : result.error;
  }

  return NextResponse.json(result, { status: 201 });
}
