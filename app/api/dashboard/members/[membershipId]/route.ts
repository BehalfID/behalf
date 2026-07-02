import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, roleDelegationForbidden, canManageMembers } from "@/lib/delegatedAuth";
import { removeMember, updateMemberRole } from "@/lib/membershipManagement";
import { isWorkspaceRole } from "@/lib/authority";
import { jsonError } from "@/lib/responses";
import { readJsonObject } from "@/lib/request";
import { readString, rejectUnknownFields } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ membershipId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (!canManageMembers(actor)) return roleDelegationForbidden();

  const { membershipId } = await context.params;
  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["role"]);
  if (unknownError) return jsonError(unknownError);

  const role = readString(body.role);
  if (!role || !isWorkspaceRole(role)) {
    return jsonError("role is required.");
  }

  const result = await updateMemberRole(actor, membershipId, role);
  if ("error" in result) {
    return typeof result.error === "string" ? jsonError(result.error, 400) : result.error;
  }

  return NextResponse.json({ updated: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (!canManageMembers(actor)) return roleDelegationForbidden();

  const { membershipId } = await context.params;
  const result = await removeMember(actor, membershipId);
  if ("error" in result) {
    return typeof result.error === "string" ? jsonError(result.error, 400) : result.error;
  }

  return NextResponse.json({ removed: true });
}
