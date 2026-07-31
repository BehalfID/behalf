import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi, verifyPassword } from "@/lib/developerAuth";
import {
  encryptMfaSecret,
  generateBackupCodes,
  generateTotpSecret,
  verifyTotpCode,
  decryptMfaSecret
} from "@/lib/mfa";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { findByUserId, updateUser, updateUserAtomic } from "@/lib/repositories/users";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const user = await findByUserId(auth.user.userId);
  return NextResponse.json({
    mfaEnabled: Boolean(user?.mfaEnabledAt),
    email: user?.email ?? auth.user.email
  });
}

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["action", "code", "password"]);
  if (unknownError) return jsonError(unknownError);

  const action = readString(body.action);

  if (action === "enroll_start") {
    const user = await findByUserId(auth.user.userId);
    if (!user) return jsonError("Account not found.", 404);
    if (user.mfaEnabledAt) return jsonError("MFA is already enabled.");
    if (!user.passwordHash) {
      return jsonError("MFA enrollment requires a password on the account.", 400);
    }

    const { secretBase32, otpauthUrl } = generateTotpSecret();
    const labelUrl = otpauthUrl.replace(
      "BehalfID:BehalfID",
      `BehalfID:${encodeURIComponent(user.email)}`
    );
    await updateUser(user.userId, {
      mfaTotpPendingSecretEnc: encryptMfaSecret(secretBase32)
    });

    return NextResponse.json({
      secret: secretBase32,
      otpauthUrl: labelUrl
    });
  }

  if (action === "enroll_confirm") {
    const code = readString(body.code);
    const user = await findByUserId(auth.user.userId);
    if (!user?.mfaTotpPendingSecretEnc) {
      return jsonError("No MFA enrollment in progress. Start enrollment first.", 400);
    }
    const secret = decryptMfaSecret(user.mfaTotpPendingSecretEnc);
    if (!verifyTotpCode(secret, code)) {
      return jsonError("Invalid authenticator code.", 401);
    }
    const { codes, hashes } = generateBackupCodes();
    await updateUserAtomic(user.userId, {
      $set: {
        mfaTotpSecretEnc: encryptMfaSecret(secret),
        mfaEnabledAt: new Date(),
        mfaBackupCodeHashes: hashes
      },
      $unset: { mfaTotpPendingSecretEnc: 1 }
    });
    return NextResponse.json({
      enabled: true,
      backupCodes: codes
    });
  }

  if (action === "disable") {
    const code = readString(body.code);
    const password = typeof body.password === "string" ? body.password : "";
    const user = await findByUserId(auth.user.userId);
    if (!user?.mfaEnabledAt || !user.mfaTotpSecretEnc) {
      return jsonError("MFA is not enabled.", 400);
    }
    if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return jsonError("Invalid password.", 401);
    }
    const secret = decryptMfaSecret(user.mfaTotpSecretEnc);
    if (!verifyTotpCode(secret, code)) {
      return jsonError("Invalid authenticator code.", 401);
    }
    await updateUserAtomic(user.userId, {
      $unset: {
        mfaTotpSecretEnc: 1,
        mfaTotpPendingSecretEnc: 1,
        mfaBackupCodeHashes: 1,
        mfaEnabledAt: 1
      }
    });
    return NextResponse.json({ enabled: false });
  }

  return jsonError("Unknown action. Use enroll_start, enroll_confirm, or disable.");
}
