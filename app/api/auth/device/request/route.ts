import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { createPublicId, createUserCode } from "@/lib/ids";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import DeviceCode from "@/models/DeviceCode";

const DEVICE_CODE_TTL_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  await connectToDatabase();

  const deviceCode = crypto.randomBytes(32).toString("base64url");
  const userCode = createUserCode();

  await DeviceCode.create({
    codeId: createPublicId("dev"),
    deviceCode,
    userCode,
    expiresAt: new Date(Date.now() + DEVICE_CODE_TTL_MS),
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://behalfid.com";

  return NextResponse.json({
    deviceCode,
    userCode,
    verificationUri: `${appUrl}/authenticate`,
    expiresIn: Math.floor(DEVICE_CODE_TTL_MS / 1000),
    interval: 5,
  });
}
