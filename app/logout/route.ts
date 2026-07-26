import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { clearDeveloperSessionCookie, hashSessionToken } from "@/lib/developerAuth";
import { safeOAuthNextPath } from "@/lib/googleOAuthClient";
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
  const next = safeOAuthNextPath(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next ?? "/", request.nextUrl.origin));
  clearDeveloperSessionCookie(response);
  return response;
}
