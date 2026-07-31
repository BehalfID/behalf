import { type NextRequest } from "next/server";
import { jsonError } from "@/lib/responses";
import { findOneAccount, updateAccountByFilter } from "@/lib/repositories/accounts";
import { createStripeEventIfAbsent } from "@/lib/repositories/stripeEvents";
import { updateEndpoints } from "@/lib/repositories/webhooks";
import { getStripe } from "@/lib/stripe";

async function setAccountWebhookStatus(accountId: string, status: "active" | "disabled") {
  const currentStatus = status === "active" ? "disabled" : "active";
  await updateEndpoints(
    { accountId, status: currentStatus },
    { $set: { status } }
  );
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

  const shouldProcess = await createStripeEventIfAbsent(event.id, event.type);
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
      await updateAccountByFilter(
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
      const account = await findOneAccount({ stripeCustomerId: customerId });
      if (!account) break;
      const isActive = sub.status === "active" || sub.status === "trialing";
      const periodEnd = sub.items?.data?.[0]?.current_period_end;
      await updateAccountByFilter(
        { stripeCustomerId: customerId },
        {
          $set: {
            plan: isActive ? "pro" : "free",
            stripeSubscriptionId: sub.id,
            stripeSubscriptionStatus: sub.status,
            stripeTrialEnd: typeof sub.trial_end === "number" ? new Date(sub.trial_end * 1000) : null,
            stripeCurrentPeriodEnd: typeof periodEnd === "number" ? new Date(periodEnd * 1000) : null,
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
      const account = await findOneAccount({ stripeCustomerId: customerId });
      await updateAccountByFilter(
        { stripeCustomerId: customerId },
        {
          $set: {
            plan: "free",
            stripeSubscriptionStatus: "canceled",
            stripeSubscriptionId: null,
            stripeTrialEnd: null,
            stripeCurrentPeriodEnd: null,
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
      const account = await findOneAccount({ stripeCustomerId: customerId });
      await updateAccountByFilter(
        { stripeCustomerId: customerId },
        { $set: { plan: "free", stripeSubscriptionStatus: "past_due", stripeTrialEnd: null, stripeCurrentPeriodEnd: null } }
      );
      if (account) await setAccountWebhookStatus(account.accountId, "disabled");
      break;
    }
  }

  return new Response(null, { status: 204 });
}
