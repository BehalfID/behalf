import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { getStripe } from "@/lib/stripe";
import Account from "@/models/Account";

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  if (!auth.account) {
    return jsonError("Billing account not found.", 404);
  }

  if (auth.account.plan !== "free") {
    return jsonError("Account is already on a paid plan.", 409);
  }

  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) {
    return jsonError("Billing is not configured.", 503);
  }

  const stripe = getStripe();
  if (!stripe) {
    return jsonError("Billing is not configured.", 503);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const billingUrl = `${appUrl}/dashboard/billing`;

  let customerId = auth.account.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: auth.user.email,
      metadata: { accountId: auth.account.accountId }
    });
    customerId = customer.id;
    await Account.updateOne(
      { accountId: auth.account.accountId },
      { $set: { stripeCustomerId: customerId } }
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: auth.account.accountId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${billingUrl}?success=1`,
    cancel_url: `${billingUrl}?canceled=1`
  });

  return NextResponse.json({ url: session.url });
}
