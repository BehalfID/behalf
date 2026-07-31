import { NextResponse, type NextRequest } from "next/server";
import { clearDeveloperSessionCookie, hashSessionToken, requireDashboardMutationOrigin } from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import * as sessions from "@/lib/repositories/sessions";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const token = request.cookies.get("behalfid_developer")?.value;
  if (token) {
    await sessions.deleteByTokenHash(hashSessionToken(token));
  }

  const response = NextResponse.json({ loggedOut: true });
  clearDeveloperSessionCookie(response);
  return response;
}
