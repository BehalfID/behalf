import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { readJsonObject } from "@/lib/request";
import {
  authorizePendingDeviceCode,
  findPendingDeviceCodeByUserCode
} from "@/lib/repositories/deviceCodes";
import { jsonError } from "@/lib/responses";

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const rawCode = typeof body.userCode === "string" ? body.userCode : null;
  if (!rawCode) return jsonError("userCode is required.");

  const userCode = rawCode.toUpperCase().replace(/\s/g, "");

  await connectToDatabase();
  const pending = await findPendingDeviceCodeByUserCode(userCode);

  if (!pending) return jsonError("Invalid or expired code.", 404);
  if (new Date() > new Date(pending.expiresAt)) return jsonError("Code has expired.", 410);

  const record = await authorizePendingDeviceCode(userCode, auth.user.userId);
  if (!record) return jsonError("Invalid or expired code.", 404);

  return NextResponse.json({ authorized: true });
}
