import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import {
  hashEmailToken,
  hashPassword,
  isValidPassword,
  requireDashboardMutationOrigin
} from "@/lib/developerAuth";
import { sendEmail } from "@/lib/email";
import { passwordChangedTemplate } from "@/lib/emailTemplates";
import { checkAuthRateLimit, checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";
import DeveloperSession from "@/models/DeveloperSession";
import DeveloperUser from "@/models/DeveloperUser";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["token", "password"]);
  if (unknownError) return jsonError(unknownError);

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!token) return jsonError("Reset token is required.");
  if (!isValidPassword(password)) return jsonError("Password must be between 10 and 200 characters.");

  // Per-token rate limit: reuse general IP limit (already applied above).
  // Extra per-email rate limit applied after lookup to prevent enumeration.
  const tokenHash = hashEmailToken(token);

  await connectToDatabase();
  const user = await DeveloperUser.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetTokenExpiresAt: { $gt: new Date() }
  })
    .select("+passwordResetTokenHash +passwordResetTokenExpiresAt email userId")
    .lean();

  if (!user) {
    return jsonError("This reset link is invalid or has expired.", 400);
  }

  // Per-email rate limit check
  const authLimit = await checkAuthRateLimit(user.email);
  if (authLimit.limited) return rateLimitError();

  const newPasswordHash = await hashPassword(password);

  // Atomically update password and clear reset token.
  // Also clear any verification token (password reset implies email access).
  await DeveloperUser.updateOne(
    { userId: user.userId },
    {
      $set: { passwordHash: newPasswordHash, emailVerified: true },
      $unset: {
        passwordResetTokenHash: "",
        passwordResetTokenExpiresAt: "",
        emailVerificationTokenHash: "",
        emailVerificationTokenExpiresAt: ""
      }
    }
  );

  // Invalidate all existing sessions so compromised sessions are cleared.
  await DeveloperSession.deleteMany({ userId: user.userId });

  // Best-effort: send password changed notification.
  try {
    const template = passwordChangedTemplate();
    template.to = user.email;
    await sendEmail(template);
  } catch {
    console.error("[behalfid] Failed to send password changed notification for userId:", user.userId);
  }

  return NextResponse.json({ ok: true });
}
