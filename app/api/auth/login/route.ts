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
import { isPasswordLoginBlockedBySso } from "@/lib/workspaceSso";
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

  if (await isPasswordLoginBlockedBySso(email)) {
    return jsonError("Password sign-in is disabled for this email domain. Use Continue with Google.", 403);
  }

  await connectToDatabase();
  // "+passwordHash" alone keeps the default field set; listing other fields
  // would become an inclusion projection and omit userId/email.
  const user = await DeveloperUser.findOne({ email }).select("+passwordHash");
  if (!user?.passwordHash) {
    if (user) {
      return jsonError("This account uses Google sign-in. Use Continue with Google.", 401);
    }
    return jsonError("Invalid email or password.", 401);
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
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
