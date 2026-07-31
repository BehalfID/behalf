import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi, requireVerifiedDeveloperApi } from "@/lib/developerAuth";
import { hashDeveloperToken, previewDeveloperToken } from "@/lib/developerToken";
import { createDeveloperToken, createPublicId } from "@/lib/ids";
import {
  countByUserId,
  createApiToken,
  listByUserId
} from "@/lib/repositories/apiTokens";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const tokens = await listByUserId(auth.user.userId);

  return noCacheJson({ tokens });
}

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user || !auth.account) {
    return auth.error ?? jsonError("No account associated with this developer.", 402);
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["name"]);
  if (unknownError) return jsonError(unknownError);

  const name = readString(body.name);
  if (!name) return jsonError("name is required.");
  if (name.length > 120) return jsonError("name must be 120 characters or fewer.");

  const existing = await countByUserId(auth.user.userId);
  if (existing >= 10) {
    return jsonError("Maximum of 10 developer API tokens allowed. Revoke one to create another.", 402);
  }

  const plaintext = createDeveloperToken();
  const tokenHash = hashDeveloperToken(plaintext);
  const tokenId = createPublicId("tok");

  await createApiToken({
    tokenId,
    userId: auth.user.userId,
    accountId: auth.account.accountId,
    name,
    tokenPreview: previewDeveloperToken(plaintext),
    tokenHash
  });

  return NextResponse.json({
    tokenId,
    name,
    token: plaintext,
    tokenPreview: previewDeveloperToken(plaintext),
    createdAt: new Date().toISOString(),
    lastUsedAt: null
  }, { status: 201 });
}
