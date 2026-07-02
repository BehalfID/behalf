import { type NextRequest } from "next/server";
import { loadAccountSetupState, PATCH_ALLOWED_FIELDS } from "@/lib/accountSetup";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readJsonObject } from "@/lib/request";
import { rejectUnknownFields } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const state = await loadAccountSetupState(auth.user.userId, auth.user.primaryAccountId);
  if (!state) return jsonError("User not found.", 404);

  return noCacheJson(state);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [...PATCH_ALLOWED_FIELDS]);
  if (unknownError) return jsonError(unknownError);

  const { patchAccountSetup } = await import("@/lib/accountSetup");
  const result = await patchAccountSetup(auth.user.userId, auth.user.primaryAccountId, body);
  if (result.error) return jsonError(result.error, result.status ?? 400);

  const state = await loadAccountSetupState(auth.user.userId, auth.user.primaryAccountId);
  return noCacheJson(state ?? { ok: true });
}
