import { NextResponse, type NextRequest } from "next/server";
import { createDeveloperAccount } from "@/lib/account";
import { connectToDatabase } from "@/lib/db";
import {
  createDeveloperSession,
  generateSecureToken,
  hashEmailToken,
  hashPassword,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  requireDashboardMutationOrigin,
  setDeveloperSessionCookie
} from "@/lib/developerAuth";
import { sendEmail } from "@/lib/email";
import { verifyEmailTemplate } from "@/lib/emailTemplates";
import { createPublicId } from "@/lib/ids";
import { checkAuthRateLimit, checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import DeveloperUser from "@/models/DeveloperUser";

const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["email", "password", "dateOfBirth"]);
  if (unknownError) return jsonError(unknownError);

  const email = normalizeEmail(readString(body.email));
  const password = typeof body.password === "string" ? body.password : "";
  const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth.trim() : "";

  if (!isValidEmail(email)) return jsonError("A valid email is required.");
  if (!isValidPassword(password)) return jsonError("Password must be between 10 and 200 characters.");

  // COPPA: must be at least 13 years old. Validate server-side regardless of client-side checks.
  if (!dateOfBirth) return jsonError("Date of birth is required.");
  const dobDate = new Date(dateOfBirth);
  if (isNaN(dobDate.getTime())) return jsonError("Date of birth is invalid.");
  const minAgeDate = new Date();
  minAgeDate.setFullYear(minAgeDate.getFullYear() - 13);
  if (dobDate > minAgeDate) return jsonError("You must be at least 13 years old to create an account.");

  // Per-email rate limit to slow automated account probing
  const authLimit = await checkAuthRateLimit(email);
  if (authLimit.limited) return rateLimitError();

  await connectToDatabase();
  const existing = await DeveloperUser.exists({ email });
  if (existing) {
    // Do not confirm whether the email is registered; direct the user to login instead.
    return jsonError("Unable to complete registration. If an account with this email exists, please sign in instead.", 409);
  }

  const verificationToken = generateSecureToken();
  const verificationTokenHash = hashEmailToken(verificationToken);

  let user;
  try {
    user = await DeveloperUser.create({
      userId: createPublicId("user"),
      email,
      passwordHash: await hashPassword(password),
      dateOfBirth,
      emailVerified: false,
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS)
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return jsonError("Unable to complete registration. If an account with this email exists, please sign in instead.", 409);
    }
    throw error;
  }

  // Best-effort: create a billing account for this developer. If it fails the user
  // is still signed up and the backfill script will create the account later.
  try {
    await createDeveloperAccount(user.userId, email);
  } catch {
    console.error("[behalfid] Failed to create developer account during signup for userId:", user.userId);
  }

  // Best-effort: send verification email. Never block signup on email failure.
  try {
    const baseUrl = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
    const template = verifyEmailTemplate(verificationUrl);
    template.to = email;
    await sendEmail(template);
  } catch {
    console.error("[behalfid] Failed to send verification email for userId:", user.userId);
  }

  const { token } = await createDeveloperSession(user.userId);
  const response = NextResponse.json(
    { user: { userId: user.userId, email: user.email }, emailVerificationSent: true },
    { status: 201 }
  );
  setDeveloperSessionCookie(response, token);
  return response;
}
