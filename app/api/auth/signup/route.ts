import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import {
  createDeveloperSession,
  hashPassword,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  requireDashboardMutationOrigin,
  setDeveloperSessionCookie
} from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
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

  const unknownError = rejectUnknownFields(body, ["email", "password"]);
  if (unknownError) return jsonError(unknownError);

  const email = normalizeEmail(readString(body.email));
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidEmail(email)) return jsonError("A valid email is required.");
  if (!isValidPassword(password)) return jsonError("Password must be between 10 and 200 characters.");

  // Per-email rate limit to slow automated account probing
  const authLimit = await checkAuthRateLimit(email);
  if (authLimit.limited) return rateLimitError();

  await connectToDatabase();
  const existing = await DeveloperUser.exists({ email });
  if (existing) {
    // Do not confirm whether the email is registered; direct the user to login instead.
    return jsonError("Unable to complete registration. If an account with this email exists, please sign in instead.", 409);
  }

  let user;
  try {
    user = await DeveloperUser.create({
      userId: createPublicId("user"),
      email,
      passwordHash: await hashPassword(password)
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
  const { token } = await createDeveloperSession(user.userId);
  const response = NextResponse.json({ user: { userId: user.userId, email: user.email } }, { status: 201 });
  setDeveloperSessionCookie(response, token);
  return response;
}
