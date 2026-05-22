import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { parseSiteGuardPaths } from "@/lib/siteGuard";
import { readString, rejectUnknownFields } from "@/lib/validation";
import SiteAccessRule from "@/models/SiteAccessRule";

type RouteContext = {
  params: Promise<{ siteId: string; ruleId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, [
    "name",
    "status",
    "agentIdentifier",
    "userAgentPattern",
    "allowedPaths",
    "blockedPaths",
    "requiresApproval",
    "notes"
  ]);
  if (unknownError) return jsonError(unknownError);

  const update: Record<string, unknown> = {};
  for (const field of ["name", "agentIdentifier", "userAgentPattern", "notes"] as const) {
    if (body[field] !== undefined) update[field] = readString(body[field]) || undefined;
  }
  if (body.name !== undefined && !update.name) return jsonError("name must be a non-empty string.");
  if (body.status !== undefined) {
    const status = readString(body.status);
    if (status !== "active" && status !== "disabled") return jsonError("status must be active or disabled.");
    update.status = status;
  }
  if (body.requiresApproval !== undefined) {
    if (typeof body.requiresApproval !== "boolean") return jsonError("requiresApproval must be a boolean.");
    update.requiresApproval = body.requiresApproval;
  }
  for (const field of ["allowedPaths", "blockedPaths"] as const) {
    if (body[field] === undefined) continue;
    const parsed = parseSiteGuardPaths(body[field], field);
    if (parsed.error || !parsed.paths) return jsonError(parsed.error ?? `${field} are invalid.`);
    update[field] = parsed.paths;
  }
  if (!Object.keys(update).length) return jsonError("At least one editable rule field is required.");

  const { siteId, ruleId } = await context.params;
  const current = await SiteAccessRule.findOne({ developerUserId: auth.user.userId, siteId, ruleId });
  if (!current) return jsonError("Site Guard rule not found.", 404);

  const nextAgentIdentifier =
    body.agentIdentifier !== undefined ? update.agentIdentifier : current.agentIdentifier;
  const nextUserAgentPattern =
    body.userAgentPattern !== undefined ? update.userAgentPattern : current.userAgentPattern;
  if (!nextAgentIdentifier && !nextUserAgentPattern) {
    return jsonError("agentIdentifier or userAgentPattern is required.");
  }

  const rule = await SiteAccessRule.findOneAndUpdate(
    { developerUserId: auth.user.userId, siteId, ruleId },
    { $set: update },
    { returnDocument: "after" }
  );
  if (!rule) return jsonError("Site Guard rule not found.", 404);

  return NextResponse.json({ rule });
}
