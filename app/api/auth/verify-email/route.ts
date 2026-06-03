import { type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { hashEmailToken } from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import DeveloperUser from "@/models/DeveloperUser";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  let token: string | undefined;
  try {
    const body = await request.json();
    token = typeof body?.token === "string" ? body.token.trim() : undefined;
  } catch {
    return jsonError("Request body must be a JSON object.");
  }

  if (!token) return jsonError("Verification token is required.");

  const tokenHash = hashEmailToken(token);

  await connectToDatabase();
  const user = await DeveloperUser.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationTokenExpiresAt: { $gt: new Date() }
  })
    .select("+emailVerificationTokenHash +emailVerificationTokenExpiresAt")
    .lean();

  if (!user) {
    return jsonError("This verification link is invalid or has expired.", 400);
  }

  await DeveloperUser.updateOne(
    { userId: user.userId },
    {
      $set: { emailVerified: true },
      $unset: { emailVerificationTokenHash: "", emailVerificationTokenExpiresAt: "" }
    }
  );

  return NextResponse.json({ ok: true });
}
