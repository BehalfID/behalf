import { NextResponse, type NextRequest } from "next/server";
import { getConsoleAuditActor, requireConsoleApi } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/consoleAdmins";
import { getConsoleAccountId } from "@/lib/consoleData";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { findOneAndUpdateSite } from "@/lib/repositories/sites";

type RouteContext = {
  params: Promise<{ siteId: string }>;
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
  const { siteId } = await context.params;
  const site = await findOneAndUpdateSite(
    { accountId, siteId },
    { $set: { status } },
    { returnDocument: "after" }
  );
  if (!site) return jsonError("Site not found.", 404);

  await recordAdminAudit({
    adminId: getConsoleAuditActor(request),
    action: "site.status_updated",
    target: siteId,
    metadata: { status }
  });

  return NextResponse.json({ site });
}
