import { type NextRequest } from "next/server";
import { completeAccountSetup, loadAccountSetupState, PATCH_ALLOWED_FIELDS } from "@/lib/accountSetup";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readJsonObject } from "@/lib/request";
import { rejectUnknownFields } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [...PATCH_ALLOWED_FIELDS]);
  if (unknownError) return jsonError(unknownError);

  const result = await completeAccountSetup(auth.user.userId, auth.user.primaryAccountId, body);
  if (result.error) return jsonError(result.error, result.status ?? 400);

  const state = await loadAccountSetupState(auth.user.userId, auth.user.primaryAccountId);
  return noCacheJson({
    ...state,
    nextRoute: result.nextRoute
  });
}
