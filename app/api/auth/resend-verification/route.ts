import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import {
  generateSecureToken,
  getDeveloperFromToken,
  hashEmailToken,
  isEmailVerified,
  requireDashboardMutationOrigin
} from "@/lib/developerAuth";
import { sendEmail } from "@/lib/email";
import { verifyEmailTemplate } from "@/lib/emailTemplates";
import { createUserCode } from "@/lib/ids";
import { checkAuthRateLimit, checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import DeveloperUser from "@/models/DeveloperUser";

const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const COOKIE_NAME = "behalfid_developer";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const cookieValue = request.cookies?.get?.(COOKIE_NAME)?.value;
  const context = await getDeveloperFromToken(cookieValue);
  if (!context) {
    return NextResponse.json({ ok: true });
  }
  const user = context.user;

  if (isEmailVerified(user.emailVerified)) {
    return NextResponse.json({ ok: true });
  }

  const authLimit = await checkAuthRateLimit(user.email);
  if (authLimit.limited) return rateLimitError();

  const verificationToken = generateSecureToken();
  const verificationTokenHash = hashEmailToken(verificationToken);
  const verificationCode = createUserCode();
  const verificationCodeHash = hashEmailToken(verificationCode.replace("-", ""));

  await connectToDatabase();
  await DeveloperUser.updateOne(
    { userId: user.userId },
    {
      $set: {
        emailVerificationTokenHash: verificationTokenHash,
        emailVerificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
        emailVerificationCodeHash: verificationCodeHash
      }
    }
  );

  try {
    const baseUrl = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
    const template = verifyEmailTemplate(verificationUrl, verificationCode);
    template.to = user.email;
    await sendEmail(template);
  } catch {
    console.error("[behalfid] Failed to resend verification email for userId:", user.userId);
  }

  return NextResponse.json({ ok: true });
}
