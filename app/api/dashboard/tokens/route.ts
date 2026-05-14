import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { hashDeveloperToken } from "@/lib/developerToken";
import { createDeveloperToken, createPublicId } from "@/lib/ids";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import DeveloperApiToken from "@/models/DeveloperApiToken";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  await connectToDatabase();

  const tokens = await DeveloperApiToken.find({ userId: auth.user.userId })
    .select("-_id tokenId name accountId lastUsedAt createdAt")
    .lean();

  return NextResponse.json({ tokens });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
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

  await connectToDatabase();

  const existing = await DeveloperApiToken.countDocuments({ userId: auth.user.userId });
  if (existing >= 10) {
    return jsonError("Maximum of 10 developer API tokens allowed. Revoke one to create another.", 402);
  }

  const plaintext = createDeveloperToken();
  const tokenHash = hashDeveloperToken(plaintext);
  const tokenId = createPublicId("tok");

  await DeveloperApiToken.create({
    tokenId,
    userId: auth.user.userId,
    accountId: auth.account.accountId,
    name,
    tokenHash
  });

  return NextResponse.json({ tokenId, name, token: plaintext }, { status: 201 });
}
