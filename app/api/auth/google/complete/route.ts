import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createDeveloperAccount } from "@/lib/account";
import { connectToDatabase } from "@/lib/db";
import {
  createDeveloperSession,
  normalizeEmail,
  requireDashboardMutationOrigin,
  setDeveloperSessionCookie
} from "@/lib/developerAuth";
import {
  GOOGLE_PENDING_SIGNUP_COOKIE,
  hashPendingSignupToken,
  oauthCookieOptions,
  safeOAuthNextPath
} from "@/lib/googleOAuth";
import { createPublicId } from "@/lib/ids";
import { checkAuthRateLimit, checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import DeveloperUser from "@/models/DeveloperUser";
import OAuthPendingSignup from "@/models/OAuthPendingSignup";

function clearPendingCookie(response: NextResponse) {
  response.cookies.set(GOOGLE_PENDING_SIGNUP_COOKIE, "", { ...oauthCookieOptions(0), maxAge: 0 });
}

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["dateOfBirth", "next"]);
  if (unknownError) return jsonError(unknownError);

  const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth.trim() : "";
  if (!dateOfBirth) return jsonError("Date of birth is required.");
  const dobDate = new Date(dateOfBirth);
  if (isNaN(dobDate.getTime())) return jsonError("Date of birth is invalid.");
  const minAgeDate = new Date();
  minAgeDate.setFullYear(minAgeDate.getFullYear() - 13);
  if (dobDate > minAgeDate) return jsonError("You must be at least 13 years old to create an account.");

  const rawPending = request.cookies.get(GOOGLE_PENDING_SIGNUP_COOKIE)?.value;
  if (!rawPending) {
    return jsonError("Google sign-up session expired. Please start again.", 401);
  }
  const [pendingId, pendingToken] = rawPending.split(".");
  if (!pendingId || !pendingToken) {
    return jsonError("Google sign-up session expired. Please start again.", 401);
  }

  await connectToDatabase();
  const pending = await OAuthPendingSignup.findOne({ pendingId })
    .select("+tokenHash pendingId googleSub email emailVerified firstName lastName expiresAt")
    .lean();

  if (!pending || new Date(pending.expiresAt).getTime() < Date.now()) {
    if (pending) await OAuthPendingSignup.deleteOne({ pendingId });
    const response = jsonError("Google sign-up session expired. Please start again.", 401);
    clearPendingCookie(response);
    return response;
  }

  const expectedHash = hashPendingSignupToken(pendingToken);
  const storedHash = typeof pending.tokenHash === "string" ? pending.tokenHash : "";
  const a = Buffer.from(expectedHash);
  const b = Buffer.from(storedHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return jsonError("Google sign-up session expired. Please start again.", 401);
  }

  const email = normalizeEmail(pending.email);
  const authLimit = await checkAuthRateLimit(email);
  if (authLimit.limited) return rateLimitError();

  const existing = await DeveloperUser.exists({ $or: [{ email }, { googleSub: pending.googleSub }] });
  if (existing) {
    await OAuthPendingSignup.deleteOne({ pendingId });
    const response = jsonError(
      "Unable to complete registration. If an account with this email exists, please sign in instead.",
      409
    );
    clearPendingCookie(response);
    return response;
  }

  let user;
  try {
    user = await DeveloperUser.create({
      userId: createPublicId("user"),
      email,
      googleSub: pending.googleSub,
      authProviders: ["google"],
      firstName: pending.firstName || undefined,
      lastName: pending.lastName || undefined,
      dateOfBirth,
      emailVerified: true
    });
  } catch (createError) {
    if (
      typeof createError === "object" &&
      createError !== null &&
      "code" in createError &&
      createError.code === 11000
    ) {
      await OAuthPendingSignup.deleteOne({ pendingId });
      const response = jsonError(
        "Unable to complete registration. If an account with this email exists, please sign in instead.",
        409
      );
      clearPendingCookie(response);
      return response;
    }
    throw createError;
  }

  try {
    await createDeveloperAccount(user.userId, email);
  } catch {
    console.error("[behalfid] Failed to create developer account during Google signup for userId:", user.userId);
  }

  await OAuthPendingSignup.deleteOne({ pendingId });

  const { token } = await createDeveloperSession(user.userId);
  const next = safeOAuthNextPath(readString(body.next));
  const response = NextResponse.json({
    user: {
      userId: user.userId,
      email: user.email,
      emailVerified: true
    },
    redirectTo: "/onboarding",
    next: next ?? null
  });
  setDeveloperSessionCookie(response, token);
  clearPendingCookie(response);
  return response;
}
