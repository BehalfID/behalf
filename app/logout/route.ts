import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { clearDeveloperSessionCookie, hashSessionToken } from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import DeveloperSession from "@/models/DeveloperSession";

export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const token = request.cookies.get("behalfid_developer")?.value;
  if (token) {
    await connectToDatabase();
    await DeveloperSession.deleteOne({ tokenHash: hashSessionToken(token) });
  }
  const response = NextResponse.redirect(new URL("/", request.nextUrl.origin));
  clearDeveloperSessionCookie(response);
  return response;
}
