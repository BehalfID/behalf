import { NextResponse, type NextRequest } from "next/server";
import { switchActiveAccount } from "@/lib/accountContext";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { readJsonObject } from "@/lib/request";
import { readString, rejectUnknownFields } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user || !auth.session) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["accountId"]);
  if (unknownError) return jsonError(unknownError);

  const accountId = readString(body.accountId);
  if (!accountId) return jsonError("accountId is required.");

  const result = await switchActiveAccount(auth.user.userId, auth.session.sessionId, accountId);
  if ("error" in result) {
    return jsonError(result.error, 403);
  }

  return NextResponse.json({ ok: true, activeAccountId: result.accountId });
}
