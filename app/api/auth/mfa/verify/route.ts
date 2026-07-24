import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { recordAuthFailure } from "@/lib/authEvents";
import {
  createDeveloperSession,
  requireDashboardMutationOrigin,
  setDeveloperSessionCookie
} from "@/lib/developerAuth";
import {
  consumeBackupCode,
  decryptMfaSecret,
  verifyMfaChallengeToken,
  verifyTotpCode
} from "@/lib/mfa";
import { checkAuthRateLimit, checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import DeveloperUser from "@/models/DeveloperUser";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["mfaToken", "code", "backupCode"]);
  if (unknownError) return jsonError(unknownError);

  const mfaToken = readString(body.mfaToken);
  const code = readString(body.code);
  const backupCode = readString(body.backupCode);

  const challenge = verifyMfaChallengeToken(mfaToken);
  if (!challenge) {
    await recordAuthFailure({
      request,
      surface: "mfa",
      reason: "invalid_mfa"
    });
    return jsonError("MFA challenge expired. Sign in again.", 401);
  }

  const authLimit = await checkAuthRateLimit(`mfa:${challenge.userId}`);
  if (authLimit.limited) return rateLimitError();

  await connectToDatabase();
  const user = await DeveloperUser.findOne({ userId: challenge.userId }).select(
    "+mfaTotpSecretEnc +mfaBackupCodeHashes mfaEnabledAt email emailVerified"
  );
  if (!user?.mfaEnabledAt || !user.mfaTotpSecretEnc) {
    return jsonError("MFA is not enabled for this account.", 400);
  }

  let ok = false;
  if (backupCode) {
    const result = consumeBackupCode(user.mfaBackupCodeHashes ?? [], backupCode);
    if (result.ok) {
      ok = true;
      await DeveloperUser.updateOne(
        { userId: user.userId },
        { $set: { mfaBackupCodeHashes: result.remainingHashes } }
      );
    }
  } else if (code) {
    const secret = decryptMfaSecret(user.mfaTotpSecretEnc);
    ok = verifyTotpCode(secret, code);
  }

  if (!ok) {
    await recordAuthFailure({
      request,
      surface: "mfa",
      reason: "invalid_mfa",
      email: user.email
    });
    return jsonError("Invalid authenticator or backup code.", 401);
  }

  const { token } = await createDeveloperSession(user.userId);
  const response = NextResponse.json({
    user: {
      userId: user.userId,
      email: user.email,
      emailVerified: user.emailVerified !== false
    }
  });
  setDeveloperSessionCookie(response, token);
  return response;
}
