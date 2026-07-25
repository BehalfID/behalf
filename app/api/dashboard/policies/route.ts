import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import {
  getWorkspaceActor,
  serializeWorkspaceAuthority,
  viewerMutationForbidden
} from "@/lib/delegatedAuth";
import { createPublicId } from "@/lib/ids";
import { invalidatePolicyDocumentCache } from "@/lib/policyEngine/loadPolicy";
import { readJsonObject } from "@/lib/request";
import {
  deletePolicyDocument,
  findPolicyByAccountId,
  toStoredPolicyDocument,
  upsertPolicyDocument,
  validatePolicyRules
} from "@/lib/repositories/policyDocuments";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const doc = await findPolicyByAccountId(actor.accountId);
  return noCacheJson({
    policy: doc ? toStoredPolicyDocument(doc) : null,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (actor.authorityLevel <= 10) return viewerMutationForbidden();

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["name", "enabled", "rules"]);
  if (unknownError) return jsonError(unknownError);

  const name = body.name === undefined ? undefined : readString(body.name);
  const enabled = body.enabled === undefined ? true : body.enabled === true;
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return jsonError("enabled must be a boolean.");
  }

  const { rules, error: rulesError } = validatePolicyRules(body.rules);
  if (rulesError) return jsonError(rulesError);

  const existing = await findPolicyByAccountId(actor.accountId);
  const saved = await upsertPolicyDocument({
    accountId: actor.accountId,
    policyId: existing?.policyId ?? createPublicId("pol"),
    name: name || undefined,
    enabled,
    rules,
    updatedBy: actor.userId
  });

  invalidatePolicyDocumentCache(actor.accountId);

  return NextResponse.json({ policy: toStoredPolicyDocument(saved) });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (actor.authorityLevel <= 10) return viewerMutationForbidden();

  await deletePolicyDocument(actor.accountId);
  invalidatePolicyDocumentCache(actor.accountId);
  return NextResponse.json({ deleted: true });
}
