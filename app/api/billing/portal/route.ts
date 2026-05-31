import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import { getStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  if (!auth.account?.stripeCustomerId) {
    return jsonError("No active subscription found.", 404);
  }

  const stripe = getStripe();
  if (!stripe) {
    return jsonError("Billing is not configured.", 503);
  }

  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: auth.account.stripeCustomerId,
      return_url: `${appUrl}/dashboard/billing`
    });

    return NextResponse.json({ url: session.url });
  } catch {
    return jsonError("Failed to open billing portal. Please try again.", 502);
  }
}
