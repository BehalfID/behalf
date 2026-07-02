import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import {
  BUILTIN_PERMISSION_PROFILES,
  createPermissionProfile,
  listPermissionProfiles
} from "@/lib/permissionProfiles";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readJsonObject } from "@/lib/request";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.user.primaryAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const profiles = await listPermissionProfiles(actor.accountId);
  return noCacheJson({
    profiles,
    builtinTemplates: BUILTIN_PERMISSION_PROFILES,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.user.primaryAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["name", "description", "permissions"]);
  if (unknownError) return jsonError(unknownError);

  const name = readString(body.name);
  const description = body.description === undefined ? undefined : readString(body.description);
  if (!name) return jsonError("name is required.");
  if (!Array.isArray(body.permissions) || body.permissions.length === 0) {
    return jsonError("permissions must be a non-empty array.");
  }

  const permissions = body.permissions.map((item) => {
    if (!isRecord(item)) return null;
    const action = readString(item.action);
    if (!action) return null;
    return {
      action,
      resource: item.resource === undefined ? undefined : readString(item.resource),
      allowedActions: Array.isArray(item.allowedActions)
        ? item.allowedActions.filter((value): value is string => typeof value === "string")
        : undefined,
      blockedActions: Array.isArray(item.blockedActions)
        ? item.blockedActions.filter((value): value is string => typeof value === "string")
        : undefined,
      requiresApproval: typeof item.requiresApproval === "boolean" ? item.requiresApproval : undefined,
      notes: item.notes === undefined ? undefined : readString(item.notes)
    };
  });
  if (permissions.some((permission) => !permission)) {
    return jsonError("Each permission must include a valid action.");
  }

  const result = await createPermissionProfile(actor, {
    name,
    description,
    permissions: permissions as NonNullable<(typeof permissions)[number]>[]
  });
  if ("error" in result && result.error) return result.error;

  return NextResponse.json({ profile: result.profile }, { status: 201 });
}
