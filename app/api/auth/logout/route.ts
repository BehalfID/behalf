import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { clearDeveloperSessionCookie, hashSessionToken, requireDashboardMutationOrigin } from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import DeveloperSession from "@/models/DeveloperSession";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const token = request.cookies.get("behalfid_developer")?.value;
  if (token) {
    await connectToDatabase();
    await DeveloperSession.deleteOne({ tokenHash: hashSessionToken(token) });
  }

  const response = NextResponse.json({ loggedOut: true });
  clearDeveloperSessionCookie(response);
  return response;
}
