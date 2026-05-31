import { type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/responses";
import { getStripe } from "@/lib/stripe";
import Account from "@/models/Account";
import DeveloperUser from "@/models/DeveloperUser";
import StripeWebhookEvent from "@/models/StripeWebhookEvent";
import WebhookEndpoint from "@/models/WebhookEndpoint";

async function setAccountWebhookStatus(accountId: string, status: "active" | "disabled") {
  const user = await DeveloperUser.findOne({ primaryAccountId: accountId }).lean();
  if (!user) return;
  const currentStatus = status === "active" ? "disabled" : "active";
  await WebhookEndpoint.updateMany(
    { developerUserId: user.userId, status: currentStatus },
    { $set: { status } }
  );
}

async function claimStripeEvent(eventId: string, type: string) {
  try {
    await StripeWebhookEvent.create({ eventId, type, processedAt: new Date() });
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      return false;
    }
    throw error;
  }
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return jsonError("Webhook secret not configured.", 500);
  }

  const stripe = getStripe();
  if (!stripe) {
    return jsonError("Billing is not configured.", 503);
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

  const shouldProcess = await claimStripeEvent(event.id, event.type);
  if (!shouldProcess) {
    return new Response(null, { status: 204 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const accountId = asString(session.client_reference_id);
      if (!accountId) break;
      const customerId = asString(session.customer);
      const subscriptionId = asString(session.subscription);
      await Account.updateOne(
        { accountId },
        {
          $set: {
            plan: "pro",
            ...(customerId ? { stripeCustomerId: customerId } : {}),
            ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
            stripeSubscriptionStatus: "active"
          }
        }
      );
      await setAccountWebhookStatus(accountId, "active");
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      const customerId = asString(sub.customer);
      if (!customerId) break;
      const account = await Account.findOne({ stripeCustomerId: customerId });
      if (!account) break;
      const isActive = sub.status === "active" || sub.status === "trialing";
      await Account.updateOne(
        { stripeCustomerId: customerId },
        {
          $set: {
            plan: isActive ? "pro" : "free",
            stripeSubscriptionId: sub.id,
            stripeSubscriptionStatus: sub.status,
            stripeTrialEnd: typeof sub.trial_end === "number" ? new Date(sub.trial_end * 1000) : null,
          }
        }
      );
      await setAccountWebhookStatus(account.accountId, isActive ? "active" : "disabled");
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = asString(sub.customer);
      if (!customerId) break;
      const account = await Account.findOne({ stripeCustomerId: customerId });
      await Account.updateOne(
        { stripeCustomerId: customerId },
        {
          $set: {
            plan: "free",
            stripeSubscriptionStatus: "canceled",
            stripeSubscriptionId: null,
            stripeTrialEnd: null,
          }
        }
      );
      if (account) await setAccountWebhookStatus(account.accountId, "disabled");
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = asString(invoice.customer);
      if (!customerId) break;
      const account = await Account.findOne({ stripeCustomerId: customerId });
      await Account.updateOne(
        { stripeCustomerId: customerId },
        { $set: { plan: "free", stripeSubscriptionStatus: "past_due", stripeTrialEnd: null } }
      );
      if (account) await setAccountWebhookStatus(account.accountId, "disabled");
      break;
    }
  }

  return new Response(null, { status: 204 });
}
