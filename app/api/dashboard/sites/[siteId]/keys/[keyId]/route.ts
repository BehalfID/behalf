import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { findOneAndUpdateKey, findOneSite } from "@/lib/repositories/sites";

type RouteContext = {
  params: Promise<{ siteId: string; keyId: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  if (!auth.activeAccountId) return jsonError("Developer account is required.", 409);
  const { siteId, keyId } = await context.params;

  const site = await findOneSite({ developerUserId: auth.user.userId, accountId: auth.activeAccountId, siteId });
  if (!site) return jsonError("Site not found.", 404);

  const key = await findOneAndUpdateKey(
    { developerUserId: auth.user.userId, accountId: auth.activeAccountId, siteId, keyId, status: "active" },
    { $set: { status: "revoked" } },
    { returnDocument: "after" }
  );

  if (!key) return jsonError("Site Guard key not found or already revoked.", 404);

  return NextResponse.json({ key });
}
