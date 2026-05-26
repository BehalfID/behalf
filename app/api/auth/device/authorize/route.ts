import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import DeviceCode from "@/models/DeviceCode";

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
  const record = await DeviceCode.findOne({ userCode, status: "pending" });

  if (!record) return jsonError("Invalid or expired code.", 404);
  if (new Date() > new Date(record.expiresAt)) return jsonError("Code has expired.", 410);

  // Store only the userId — never store a plaintext session token in the database.
  // The session token is created later (at poll time) so it follows the same
  // hash-before-store invariant as every other secret in this codebase.
  record.status = "authorized";
  record.userId = auth.user.userId;
  record.sessionToken = null;
  await record.save();

  return NextResponse.json({ authorized: true });
}
