import { NextResponse, type NextRequest } from "next/server";
import {
  createConsoleSessionValue,
  requireConsoleMutationOrigin,
  setConsoleSessionCookie,
  verifyAdminPassword
} from "@/lib/adminAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const originError = requireConsoleMutationOrigin(request);
  if (originError) {
    return originError;
  }

  const limit = await checkRateLimit(request);
  if (limit.limited) {
    return rateLimitError();
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return jsonError("Request body must be a JSON object.");
  }

  const unknownError = rejectUnknownFields(body, ["password"]);
  if (unknownError) {
    return jsonError(unknownError);
  }

  const password = readString(body.password);
  if (!verifyAdminPassword(password)) {
    return jsonError("Invalid console password.", 401);
  }

  const session = createConsoleSessionValue();
  if (!session) {
    return jsonError("Console password is not configured.", 500);
  }

  const response = NextResponse.json({ authenticated: true });
  setConsoleSessionCookie(response, session);
  return response;
}
