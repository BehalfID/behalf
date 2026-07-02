import { type NextRequest } from "next/server";
import { getDeveloperFromToken, isEmailVerified } from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { noCacheJson } from "@/lib/responses";

const COOKIE_NAME = "behalfid_developer";

export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const cookieValue = request.cookies?.get?.(COOKIE_NAME)?.value;
  const context = await getDeveloperFromToken(cookieValue);

  if (!context) {
    return noCacheJson({ verified: false });
  }

  return noCacheJson({ verified: isEmailVerified(context.user.emailVerified) });
}
