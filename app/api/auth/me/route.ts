import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { readJsonObject } from "@/lib/request";
import * as users from "@/lib/repositories/users";

const VALID_USE_CASES = ["personal", "website", "sdk"] as const;

type MeUserSource = NonNullable<Awaited<ReturnType<typeof requireDeveloperApi>>["user"]> & {
  mfaEnabledAt?: Date | null;
};

/**
 * Explicit allowlist. The session user is the full repository row, which also
 * carries credential material (password hash, encrypted TOTP secret, MFA
 * backup-code hashes, reset/verification token hashes) that must never leave
 * the server.
 */
function toPublicUser(user: MeUserSource) {
  return {
    userId: user.userId,
    email: user.email,
    emailVerified: user.emailVerified !== false,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    jobTitle: user.jobTitle ?? null,
    primaryAccountId: user.primaryAccountId ?? null,
    authProviders: user.authProviders ?? [],
    onboardingUseCase: user.onboardingUseCase ?? null,
    onboardingCompletedAt: user.onboardingCompletedAt ?? null,
    mfaEnabled: Boolean(user.mfaEnabledAt),
    createdAt: user.createdAt
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  return noCacheJson({ user: toPublicUser(auth.user as MeUserSource) });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["onboardingUseCase"]);
  if (unknownError) return jsonError(unknownError);

  const onboardingUseCase = readString(body.onboardingUseCase);
  if (!(VALID_USE_CASES as readonly string[]).includes(onboardingUseCase)) {
    return jsonError("onboardingUseCase must be one of: personal, website, sdk.");
  }

  await users.updateUser(auth.user.userId, { onboardingUseCase });
  return NextResponse.json({ ok: true });
}
