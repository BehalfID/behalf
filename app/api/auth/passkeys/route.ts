import type { NextRequest } from "next/server";
import {
  listPasskeysForUser,
  removePasskey,
  renamePasskey
} from "@/lib/authProviders/passkeyService";
import { getUsableLoginMethods } from "@/lib/authProviders/loginMethodSafety";
import { isWebAuthnConfigured } from "@/lib/authProviders/webauthnConfig";
import { connectToDatabase } from "@/lib/db";
import {
  requireDashboardMutationOrigin,
  requireDeveloperApi,
  requireVerifiedDeveloperApi,
  verifyPassword
} from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import DeveloperUser from "@/models/DeveloperUser";

/** List passkeys for the signed-in account. */
export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  await connectToDatabase();
  const [passkeys, snapshot] = await Promise.all([
    listPasskeysForUser(auth.user.userId),
    getUsableLoginMethods(auth.user.userId)
  ]);

  return noCacheJson({
    available: isWebAuthnConfigured(),
    canAdd: snapshot.nonPasskeyFactorCount >= 1 && isWebAuthnConfigured(),
    passkeys
  });
}

/** Rename a passkey. Body: { credentialRecordId, nickname } */
export async function PATCH(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["credentialRecordId", "nickname"]);
  if (unknownError) return jsonError(unknownError);

  const credentialRecordId = readString(body.credentialRecordId);
  const nickname = readString(body.nickname);
  if (!credentialRecordId) return jsonError("Passkey id is required.");

  await connectToDatabase();
  const result = await renamePasskey({
    userId: auth.user.userId,
    credentialRecordId,
    nickname,
    request
  });

  if (!result.ok) {
    if (result.code === "not_found") return jsonError("Passkey not found.", 404);
    return jsonError("Enter a short nickname for this passkey.");
  }

  return noCacheJson({ renamed: true });
}

/** Remove a passkey. Body: { credentialRecordId, password? } */
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

  const unknownError = rejectUnknownFields(body, ["credentialRecordId", "password"]);
  if (unknownError) return jsonError(unknownError);

  const credentialRecordId = readString(body.credentialRecordId);
  if (!credentialRecordId) return jsonError("Passkey id is required.");

  await connectToDatabase();
  const user = await DeveloperUser.findOne({ userId: auth.user.userId })
    .select("+passwordHash userId")
    .lean();
  if (!user) return jsonError("Account not found.", 404);

  if (user.passwordHash) {
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || !(await verifyPassword(password, user.passwordHash))) {
      return jsonError("Invalid password.", 401);
    }
  }

  const result = await removePasskey({
    userId: auth.user.userId,
    credentialRecordId,
    request
  });

  if (!result.ok) {
    if (result.code === "not_found") return jsonError("Passkey not found.", 404);
    if (result.code === "passkey_only_forbidden") {
      return jsonError(
        "Keep a password or connected provider so you can recover if this passkey is lost.",
        409
      );
    }
    return jsonError(
      "Add another sign-in method before removing this passkey.",
      409
    );
  }

  return noCacheJson({ removed: true });
}
