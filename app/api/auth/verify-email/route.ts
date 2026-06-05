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
  let code: string | undefined;
  try {
    const body = await request.json();
    token = typeof body?.token === "string" ? body.token.trim() : undefined;
    code = typeof body?.code === "string" ? body.code.trim() : undefined;
  } catch {
    return jsonError("Request body must be a JSON object.");
  }

  if (!token && !code) return jsonError("Verification token or code is required.");

  await connectToDatabase();

  let user;

  if (token) {
    const tokenHash = hashEmailToken(token);
    user = await DeveloperUser.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationTokenExpiresAt: { $gt: new Date() }
    })
      .select("+emailVerificationTokenHash +emailVerificationTokenExpiresAt")
      .lean();
  } else if (code) {
    const normalized = code.replace(/-/g, "").toUpperCase();
    const codeHash = hashEmailToken(normalized);
    user = await DeveloperUser.findOne({
      emailVerificationCodeHash: codeHash,
      emailVerificationTokenExpiresAt: { $gt: new Date() }
    })
      .select("+emailVerificationCodeHash +emailVerificationTokenExpiresAt")
      .lean();
  }

  if (!user) {
    return jsonError("This verification link or code is invalid or has expired.", 400);
  }

  await DeveloperUser.updateOne(
    { userId: user.userId },
    {
      $set: { emailVerified: true },
      $unset: {
        emailVerificationTokenHash: "",
        emailVerificationTokenExpiresAt: "",
        emailVerificationCodeHash: ""
      }
    }
  );

  return NextResponse.json({ ok: true });
}
