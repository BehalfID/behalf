import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { createDeveloperSession } from "@/lib/developerAuth";
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

  // Fast-path for non-authorized states: read without deleting.
  const record = await DeviceCode.findOne({ deviceCode }).lean();

  if (!record || new Date() > new Date(record.expiresAt)) {
    return NextResponse.json({ status: "expired" });
  }

  if (record.status === "denied") return NextResponse.json({ status: "denied" });
  if (record.status === "pending") return NextResponse.json({ status: "pending" });

  // status === "authorized": atomically claim the record with findOneAndDelete so
  // concurrent polls cannot both succeed.  If null is returned, another request
  // already claimed it — treat as expired from the caller's perspective.
  //
  // The session token is created here (not at authorize-time) so that no plaintext
  // secret is ever written to the DeviceCode collection; only a hash is stored in
  // DeveloperSession, matching the invariant used everywhere else in this codebase.
  const claimed = await DeviceCode.findOneAndDelete({ deviceCode, status: "authorized" });
  if (!claimed?.userId) {
    return NextResponse.json({ status: "expired" });
  }

  const { token } = await createDeveloperSession(claimed.userId as string);
  return NextResponse.json({ status: "authorized", token });
}
