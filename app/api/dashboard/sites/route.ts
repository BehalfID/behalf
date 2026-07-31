import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { normalizeSiteDomain } from "@/lib/siteGuard";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { createSiteDocument, findOneSite, findSites } from "@/lib/repositories/sites";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const sites = await findSites({
    developerUserId: auth.user.userId,
    ...(auth.activeAccountId ? { accountId: auth.activeAccountId } : {})
  }, { sort: { createdAt: -1 }, select: "-_id siteId name domain status createdAt updatedAt" });

  return noCacheJson({ sites });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  if (!auth.activeAccountId) return jsonError("Developer account is required.", 409);

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["name", "domain"]);
  if (unknownError) return jsonError(unknownError);

  const name = readString(body.name);
  const domain = normalizeSiteDomain(readString(body.domain));
  if (!name) return jsonError("name is required.");
  if (!domain) return jsonError("domain must be a hostname.");

  const existing = await findOneSite({ accountId: auth.activeAccountId, domain });
  if (existing) return jsonError("A Site Guard site already uses this domain.", 409);

  const site = await createSiteDocument({
    siteId: createPublicId("site"),
    accountId: auth.activeAccountId,
    developerUserId: auth.user.userId,
    name,
    domain,
    status: "active"
  });

  return NextResponse.json({
    site: {
      siteId: site.siteId,
      name: site.name,
      domain: site.domain,
      status: site.status,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt
    }
  }, { status: 201 });
}
