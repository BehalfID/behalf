import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import {
  createDeveloperSession,
  normalizeEmail,
  requireDashboardMutationOrigin,
  setDeveloperSessionCookie,
  verifyPassword
} from "@/lib/developerAuth";
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

  // Per-email rate limit applied before any DB work to prevent brute-force
  const authLimit = await checkAuthRateLimit(email);
  if (authLimit.limited) return rateLimitError();

  await connectToDatabase();
  const user = await DeveloperUser.findOne({ email }).select("+passwordHash");
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return jsonError("Invalid email or password.", 401);
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
