import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { parseSiteGuardPaths } from "@/lib/siteGuard";
import { readString, rejectUnknownFields } from "@/lib/validation";
import Site from "@/models/Site";
import SiteAccessRule from "@/models/SiteAccessRule";

type RouteContext = {
  params: Promise<{ siteId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  if (!auth.activeAccountId) return jsonError("Developer account is required.", 409);

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, [
    "name",
    "agentIdentifier",
    "userAgentPattern",
    "allowedPaths",
    "blockedPaths",
    "requiresApproval",
    "notes"
  ]);
  if (unknownError) return jsonError(unknownError);

  const name = readString(body.name);
  const agentIdentifier = readString(body.agentIdentifier);
  const userAgentPattern = readString(body.userAgentPattern);
  if (!name) return jsonError("name is required.");
  if (!agentIdentifier && !userAgentPattern) return jsonError("agentIdentifier or userAgentPattern is required.");
  if (body.requiresApproval !== undefined && typeof body.requiresApproval !== "boolean") {
    return jsonError("requiresApproval must be a boolean.");
  }

  const allowed = parseSiteGuardPaths(body.allowedPaths ?? [], "allowedPaths");
  const blocked = parseSiteGuardPaths(body.blockedPaths ?? [], "blockedPaths");
  if (allowed.error || !allowed.paths) return jsonError(allowed.error ?? "allowedPaths are invalid.");
  if (blocked.error || !blocked.paths) return jsonError(blocked.error ?? "blockedPaths are invalid.");

  const { siteId } = await context.params;
  const site = await Site.findOne({
    developerUserId: auth.user.userId,
    accountId: auth.activeAccountId,
    siteId
  });
  if (!site) return jsonError("Site not found.", 404);

  const rule = await SiteAccessRule.create({
    ruleId: createPublicId("sgr"),
    siteId,
    accountId: site.accountId,
    developerUserId: site.developerUserId,
    name,
    agentIdentifier: agentIdentifier || undefined,
    userAgentPattern: userAgentPattern || undefined,
    allowedPaths: allowed.paths,
    blockedPaths: blocked.paths,
    requiresApproval: body.requiresApproval ?? false,
    notes: readString(body.notes) || undefined,
    status: "active"
  });

  return NextResponse.json({ rule }, { status: 201 });
}
