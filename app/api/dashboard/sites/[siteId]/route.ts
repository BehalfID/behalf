import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import Site from "@/models/Site";
import SiteAccessLog from "@/models/SiteAccessLog";
import SiteAccessRule from "@/models/SiteAccessRule";

type RouteContext = {
  params: Promise<{ siteId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { siteId } = await context.params;

  const site = await Site.findOne({ developerUserId: auth.user.userId, siteId })
    .select("-_id siteId name domain status createdAt updatedAt")
    .lean();
  if (!site) return jsonError("Site not found.", 404);

  const [rules, logs] = await Promise.all([
    SiteAccessRule.find({ developerUserId: auth.user.userId, siteId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-_id ruleId siteId name status agentIdentifier userAgentPattern allowedPaths blockedPaths requiresApproval notes createdAt updatedAt")
      .lean(),
    SiteAccessLog.find({ developerUserId: auth.user.userId, siteId })
      .sort({ createdAt: -1 })
      .limit(25)
      .select("-_id requestId ruleId path userAgent agentIdentifier allowed reason risk createdAt")
      .lean()
  ]);

  return NextResponse.json({ site, rules, logs });
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
  const site = await Site.findOneAndUpdate(
    { developerUserId: auth.user.userId, siteId },
    { $set: update },
    { returnDocument: "after" }
  ).select("-_id siteId name domain status createdAt updatedAt");

  if (!site) return jsonError("Site not found.", 404);
  return NextResponse.json({ site });
}
