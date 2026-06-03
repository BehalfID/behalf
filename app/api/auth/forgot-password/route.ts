import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import {
  generateSecureToken,
  hashEmailToken,
  isValidEmail,
  normalizeEmail,
  requireDashboardMutationOrigin
} from "@/lib/developerAuth";
import { sendEmail } from "@/lib/email";
import { resetPasswordTemplate } from "@/lib/emailTemplates";
import { checkAuthRateLimit, checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import DeveloperUser from "@/models/DeveloperUser";

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 60 minutes

// Always return the same shape regardless of whether the email exists to prevent enumeration.
const SUCCESS_RESPONSE = { ok: true };

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["email"]);
  if (unknownError) return jsonError(unknownError);

  const email = normalizeEmail(readString(body.email));
  if (!isValidEmail(email)) return NextResponse.json(SUCCESS_RESPONSE);

  // Per-email rate limit
  const authLimit = await checkAuthRateLimit(email);
  if (authLimit.limited) return rateLimitError();

  await connectToDatabase();
  const user = await DeveloperUser.findOne({ email }).select("userId email").lean();

  // Always return success — do not reveal whether the email exists.
  if (!user) return NextResponse.json(SUCCESS_RESPONSE);

  const resetToken = generateSecureToken();
  const resetTokenHash = hashEmailToken(resetToken);

  await DeveloperUser.updateOne(
    { userId: user.userId },
    {
      $set: {
        passwordResetTokenHash: resetTokenHash,
        passwordResetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS)
      }
    }
  );

  try {
    const baseUrl = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    const template = resetPasswordTemplate(resetUrl);
    template.to = email;
    await sendEmail(template);
  } catch {
    console.error("[behalfid] Failed to send password reset email for userId:", user.userId);
  }

  return NextResponse.json(SUCCESS_RESPONSE);
}
