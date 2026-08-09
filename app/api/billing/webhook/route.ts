import { type NextRequest } from "next/server";
import { jsonError } from "@/lib/responses";
import { findOneAccount, updateAccountByFilter } from "@/lib/repositories/accounts";
import { createStripeEventIfAbsent } from "@/lib/repositories/stripeEvents";
import { updateEndpoints } from "@/lib/repositories/webhooks";
import { getStripe } from "@/lib/stripe";
import { effectiveEntitlements } from "@/lib/planGrants";
import { findMembershipsByAccountId } from "@/lib/repositories/memberships";
import { trackServerEvent, type AnalyticsProperties } from "@/lib/analytics/server";

/**
 * Analytics identity for an account-level billing fact.
 *
 * Analytics identifies people, but a subscription belongs to a workspace, so
 * the event is attributed to the workspace OWNER — the same stable developer
 * user id the browser sends to setIdentity, which is what joins the two sides.
 * Returns null when no owner can be resolved, in which case the event is
 * skipped rather than attributed to a guessed id.
 */
async function resolveOwnerUserId(accountId: string): Promise<string | null> {
  try {
    const memberships = await findMembershipsByAccountId(accountId);
    const owner = memberships?.find((membership) => membership.role === "OWNER");
    return owner?.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Billing analytics must never change, fail, or stall the webhook's outcome.
 * The send is awaited (a serverless handler must not freeze mid-send) but
 * bounded, so a slow owner lookup or ingest call cannot hold up Stripe's
 * delivery — Stripe retries on a slow response, which would double-process.
 */
const ANALYTICS_BUDGET_MS = 2_000;

async function trackBillingEvent(
  accountId: string | null | undefined,
  event: string,
  properties: AnalyticsProperties
) {
  if (!accountId) return;
  const send = (async () => {
    const userId = await resolveOwnerUserId(accountId);
    if (!userId) return;
    await trackServerEvent(event, { ...properties, account_id: accountId }, {
      userId,
      set: typeof properties.plan === "string" ? { plan: properties.plan } : undefined
    });
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      send,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ANALYTICS_BUDGET_MS);
      })
    ]);
  } catch {
    // trackServerEvent already swallows; this is belt-and-braces.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function setAccountWebhookStatus(accountId: string, status: "active" | "disabled") {
  const currentStatus = status === "active" ? "disabled" : "active";
  await updateEndpoints(
    { accountId, status: currentStatus },
    { $set: { status } }
  );
}

/**
 * Whether webhook delivery should stay on once this event's plan change lands.
 *
 * Resolved from the account's *effective* entitlements, not from the Stripe
 * subscription status. A workspace holding a complimentary plan is entitled to
 * webhooks whether or not it has a live subscription, so keying this off
 * `isActive` alone would silently disable delivery for a comped workspace on a
 * cancellation or a failed invoice. The grant fields on `account` are untouched
 * by this handler, so overlaying the new billing plan is enough.
 */
function webhooksStayEnabled(
  account: { complimentaryPlan?: string | null; complimentaryPlanExpiresAt?: Date | null } | null,
  nextBillingPlan: string
) {
  return effectiveEntitlements({ ...(account ?? {}), plan: nextBillingPlan }).webhooksEnabled;
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
      await trackBillingEvent(accountId, "subscription_started", { plan: "pro" });
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
      await setAccountWebhookStatus(
        account.accountId,
        webhooksStayEnabled(account, isActive ? "pro" : "free") ? "active" : "disabled"
      );
      await trackBillingEvent(account.accountId, "subscription_updated", {
        plan: isActive ? "pro" : "free",
        status: sub.status
      });
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
      if (account) {
        await setAccountWebhookStatus(
          account.accountId,
          webhooksStayEnabled(account, "free") ? "active" : "disabled"
        );
        await trackBillingEvent(account.accountId, "subscription_canceled", { plan: "free" });
      }
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
      if (account) {
        await setAccountWebhookStatus(
          account.accountId,
          webhooksStayEnabled(account, "free") ? "active" : "disabled"
        );
        await trackBillingEvent(account.accountId, "payment_failed", { plan: "free" });
      }
      break;
    }
  }

  return new Response(null, { status: 204 });
}
