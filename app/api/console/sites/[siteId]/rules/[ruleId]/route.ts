import { NextResponse, type NextRequest } from "next/server";
import { getConsoleAuditActor, requireConsoleApi } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/consoleAdmins";
import { getConsoleAccountId } from "@/lib/consoleData";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { findOneAndUpdateRule } from "@/lib/repositories/sites";

type RouteContext = {
  params: Promise<{ siteId: string; ruleId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["status"]);
  if (unknownError) return jsonError(unknownError);
  const status = readString(body.status);
  if (status !== "active" && status !== "disabled") return jsonError("status must be active or disabled.");

  const accountId = await getConsoleAccountId();
  const { siteId, ruleId } = await context.params;
  const rule = await findOneAndUpdateRule(
    { accountId, siteId, ruleId },
    { $set: { status } },
    { returnDocument: "after" }
  );
  if (!rule) return jsonError("Site Guard rule not found.", 404);

  await recordAdminAudit({
    adminId: getConsoleAuditActor(request),
    action: "site_rule.status_updated",
    target: ruleId,
    metadata: { siteId, status }
  });

  return NextResponse.json({ rule });
}
