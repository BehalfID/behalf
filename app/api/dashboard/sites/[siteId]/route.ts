import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { findAccessLogs, findKeys, findOneAndUpdateSite, findOneSite, findRules } from "@/lib/repositories/sites";

type RouteContext = {
  params: Promise<{ siteId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { siteId } = await context.params;

  const site = await findOneSite({ developerUserId: auth.user.userId, accountId: auth.activeAccountId, siteId }, { select: "-_id siteId name domain status createdAt updatedAt" });
  if (!site) return jsonError("Site not found.", 404);

  const [rules, logs, keys] = await Promise.all([
    findRules({ developerUserId: auth.user.userId, accountId: auth.activeAccountId, siteId }, { sort: { createdAt: -1 }, limit: 50, select: "-_id ruleId siteId name status agentIdentifier userAgentPattern allowedPaths blockedPaths requiresApproval notes createdAt updatedAt" }),
    findAccessLogs({ developerUserId: auth.user.userId, accountId: auth.activeAccountId, siteId }, { sort: { createdAt: -1 }, limit: 25, select: "-_id requestId ruleId path userAgent agentIdentifier allowed reason risk createdAt" }),
    findKeys({ developerUserId: auth.user.userId, accountId: auth.activeAccountId, siteId }, { sort: { createdAt: -1 }, select: "-_id keyId siteId name keyPreview status lastUsedAt createdAt updatedAt" })
  ]);

  return noCacheJson({ site, rules, logs, keys });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["name", "status"]);
  if (unknownError) return jsonError(unknownError);

  const update: Record<string, string> = {};
  if (body.name !== undefined) {
    const name = readString(body.name);
    if (!name) return jsonError("name must be a non-empty string.");
    update.name = name;
  }
  if (body.status !== undefined) {
    const status = readString(body.status);
    if (status !== "active" && status !== "disabled") return jsonError("status must be active or disabled.");
    update.status = status;
  }
  if (!Object.keys(update).length) return jsonError("At least one editable site field is required.");

  const { siteId } = await context.params;
  const site = await findOneAndUpdateSite(
    { developerUserId: auth.user.userId, accountId: auth.activeAccountId, siteId },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!site) return jsonError("Site not found.", 404);
  return NextResponse.json({ site });
}
