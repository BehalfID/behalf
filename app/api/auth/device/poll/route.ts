import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import DeviceCode from "@/models/DeviceCode";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const deviceCode = typeof body.deviceCode === "string" ? body.deviceCode : null;
  if (!deviceCode) return jsonError("deviceCode is required.");

  await connectToDatabase();
  const record = await DeviceCode.findOne({ deviceCode }).lean();

  if (!record || new Date() > new Date(record.expiresAt)) {
    return NextResponse.json({ status: "expired" });
  }

  if (record.status === "denied") return NextResponse.json({ status: "denied" });
  if (record.status === "pending") return NextResponse.json({ status: "pending" });

  return NextResponse.json({ status: "authorized", token: record.sessionToken });
}
