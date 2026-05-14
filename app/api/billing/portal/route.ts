import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  if (!auth.account?.stripeCustomerId) {
    return jsonError("No active subscription found.", 404);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const session = await stripe.billingPortal.sessions.create({
    customer: auth.account.stripeCustomerId,
    return_url: `${appUrl}/dashboard/billing`
  });

  return NextResponse.json({ url: session.url });
}
