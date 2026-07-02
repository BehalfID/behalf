import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import Site from "@/models/Site";
import SiteGuardKey from "@/models/SiteGuardKey";

type RouteContext = {
  params: Promise<{ siteId: string; keyId: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  if (!auth.activeAccountId) return jsonError("Developer account is required.", 409);
  const { siteId, keyId } = await context.params;

  const site = await Site.findOne({ developerUserId: auth.user.userId, accountId: auth.activeAccountId, siteId }).lean();
  if (!site) return jsonError("Site not found.", 404);

  const key = await SiteGuardKey.findOneAndUpdate(
    { developerUserId: auth.user.userId, accountId: auth.activeAccountId, siteId, keyId, status: "active" },
    { $set: { status: "revoked" } },
    { returnDocument: "after" }
  ).select("-_id keyId siteId name keyPreview status updatedAt");

  if (!key) return jsonError("Site Guard key not found or already revoked.", 404);

  return NextResponse.json({ key });
}
