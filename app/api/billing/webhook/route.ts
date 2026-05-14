import { type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/responses";
import { stripe } from "@/lib/stripe";
import Account from "@/models/Account";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return jsonError("Webhook secret not configured.", 500);
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return jsonError("Missing stripe-signature header.", 400);
  }

  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch {
    return jsonError("Webhook signature verification failed.", 400);
  }

  await connectToDatabase();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const accountId = session.client_reference_id;
      if (!accountId) break;
      await Account.updateOne(
        { accountId },
        {
          $set: {
            plan: "pro",
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            stripeSubscriptionStatus: "active"
          }
        }
      );
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      const account = await Account.findOne({ stripeCustomerId: sub.customer as string });
      if (!account) break;
      const isActive = sub.status === "active" || sub.status === "trialing";
      await Account.updateOne(
        { stripeCustomerId: sub.customer as string },
        {
          $set: {
            plan: isActive ? "pro" : "free",
            stripeSubscriptionId: sub.id,
            stripeSubscriptionStatus: sub.status
          }
        }
      );
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await Account.updateOne(
        { stripeCustomerId: sub.customer as string },
        {
          $set: {
            plan: "free",
            stripeSubscriptionStatus: "canceled",
            stripeSubscriptionId: null
          }
        }
      );
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      await Account.updateOne(
        { stripeCustomerId: invoice.customer as string },
        { $set: { stripeSubscriptionStatus: "past_due" } }
      );
      break;
    }
  }

  return new Response(null, { status: 204 });
}
