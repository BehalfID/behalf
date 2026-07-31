import { NextResponse, type NextRequest } from "next/server";
import { deleteDeveloperUser } from "@/lib/accountDeletion";
import {
  clearDeveloperSessionCookie,
  hashSessionToken,
  requireDashboardMutationOrigin,
  requireVerifiedDeveloperApi,
  verifyPassword
} from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import * as sessions from "@/lib/repositories/sessions";
import * as users from "@/lib/repositories/users";

const DELETE_CONFIRMATION = "DELETE";

export async function DELETE(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["password", "confirmation"]);
  if (unknownError) return jsonError(unknownError);

  const password = typeof body.password === "string" ? body.password : "";
  const confirmation = readString(body.confirmation);

  if (confirmation !== DELETE_CONFIRMATION) {
    return jsonError(`Type ${DELETE_CONFIRMATION} to confirm account deletion.`, 400);
  }

  const user = await users.findByUserId(auth.user.userId);
  if (!user) {
    return jsonError("Invalid password.", 401);
  }

  if (user.passwordHash) {
    if (!password || !(await verifyPassword(password, user.passwordHash))) {
      return jsonError("Invalid password.", 401);
    }
  } else if (!user.authProviders?.includes("google")) {
    return jsonError("Password is required to delete your account.", 400);
  }
  // Google-only accounts: authenticated session + DELETE confirmation is sufficient.

  const result = await deleteDeveloperUser(auth.user.userId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  const token = request.cookies.get("behalfid_developer")?.value;
  if (token) {
    await sessions.deleteByTokenHash(hashSessionToken(token));
  }

  const response = NextResponse.json({ deleted: true });
  clearDeveloperSessionCookie(response);
  return response;
}
