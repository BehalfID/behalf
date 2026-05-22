import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { createPublicId, createSiteGuardKey } from "@/lib/ids";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { hashSiteGuardKey, previewSiteGuardKey } from "@/lib/siteGuardKey";
import { readString, rejectUnknownFields } from "@/lib/validation";
import Site from "@/models/Site";
import SiteGuardKey from "@/models/SiteGuardKey";

type RouteContext = {
  params: Promise<{ siteId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  if (!auth.user.primaryAccountId) return jsonError("Developer account is required.", 409);
  const { siteId } = await context.params;

  const site = await Site.findOne({ developerUserId: auth.user.userId, accountId: auth.user.primaryAccountId, siteId }).lean();
  if (!site) return jsonError("Site not found.", 404);

  const keys = await SiteGuardKey.find({ developerUserId: auth.user.userId, accountId: auth.user.primaryAccountId, siteId })
    .sort({ createdAt: -1 })
    .select("-_id keyId siteId name keyPreview status lastUsedAt createdAt updatedAt")
    .lean();

  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  if (!auth.user.primaryAccountId) return jsonError("Developer account is required.", 409);

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["name"]);
  if (unknownError) return jsonError(unknownError);

  const name = readString(body.name);
  if (!name) return jsonError("name is required.");
  if (name.length > 120) return jsonError("name must be 120 characters or fewer.");

  const { siteId } = await context.params;
  const site = await Site.findOne({ developerUserId: auth.user.userId, accountId: auth.user.primaryAccountId, siteId }).lean();
  if (!site) return jsonError("Site not found.", 404);

  const rawKey = createSiteGuardKey();
  const keyDoc = await SiteGuardKey.create({
    keyId: createPublicId("sgk"),
    siteId,
    accountId: auth.user.primaryAccountId,
    developerUserId: auth.user.userId,
    name,
    keyHash: hashSiteGuardKey(rawKey),
    keyPreview: previewSiteGuardKey(rawKey),
    status: "active"
  });

  return NextResponse.json({
    key: {
      keyId: keyDoc.keyId,
      siteId: keyDoc.siteId,
      name: keyDoc.name,
      keyPreview: keyDoc.keyPreview,
      status: keyDoc.status,
      createdAt: keyDoc.createdAt,
      updatedAt: keyDoc.updatedAt
    },
    rawKey
  }, { status: 201 });
}
