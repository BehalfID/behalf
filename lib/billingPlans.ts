/**
 * Stripe price ↔ self-serve plan mapping for checkout and webhooks.
 *
 * Price IDs come from env (created in the Stripe Dashboard). Subscription
 * metadata `behalfPlan` is written at checkout and preferred when resolving
 * the plan on later webhook events; price ID is the fallback for portal
 * upgrades and legacy Pro-only subscriptions.
 */
import {
  isSelfServePlan,
  type Plan,
  type SelfServePlan
} from "@/lib/plans";

const PRICE_ENV: Record<SelfServePlan, string> = {
  pro: "STRIPE_PRO_PRICE_ID",
  team: "STRIPE_TEAM_PRICE_ID",
  business: "STRIPE_BUSINESS_PRICE_ID"
};

export function stripePriceIdForPlan(plan: SelfServePlan): string | null {
  const value = process.env[PRICE_ENV[plan]]?.trim();
  return value || null;
}

export function planFromStripePriceId(priceId: string | null | undefined): SelfServePlan | null {
  if (!priceId) return null;
  for (const plan of Object.keys(PRICE_ENV) as SelfServePlan[]) {
    if (stripePriceIdForPlan(plan) === priceId) return plan;
  }
  return null;
}

export function planFromBehalfMetadata(value: unknown): SelfServePlan | null {
  return isSelfServePlan(value) ? value : null;
}

type StripePriceLike = string | { id?: string | null } | null | undefined;

function priceIdFromStripePrice(price: StripePriceLike): string | null {
  if (typeof price === "string" && price.trim()) return price.trim();
  if (price && typeof price === "object" && typeof price.id === "string" && price.id.trim()) {
    return price.id.trim();
  }
  return null;
}

/**
 * Resolve the billing plan for an active Stripe subscription.
 *
 * Preference order: subscription metadata `behalfPlan`, then the first
 * subscription item's price ID. Unknown active subscriptions fall back to
 * `pro` so legacy Pro-only customers keep paid entitlements if env mapping
 * is incomplete.
 */
export function resolveSubscriptionPlan(input: {
  metadata?: Record<string, string> | null;
  items?: { data?: Array<{ price?: StripePriceLike }> | null } | null;
}): SelfServePlan {
  const fromMeta = planFromBehalfMetadata(input.metadata?.behalfPlan);
  if (fromMeta) return fromMeta;

  const priceId = priceIdFromStripePrice(input.items?.data?.[0]?.price);
  const fromPrice = planFromStripePriceId(priceId);
  if (fromPrice) return fromPrice;

  return "pro";
}

/** Paid plan when the subscription is active/trialing; otherwise free. */
export function billingPlanForSubscriptionStatus(
  status: string | null | undefined,
  subscription: {
    metadata?: Record<string, string> | null;
    items?: { data?: Array<{ price?: StripePriceLike }> | null } | null;
  }
): Plan {
  const isActive = status === "active" || status === "trialing";
  return isActive ? resolveSubscriptionPlan(subscription) : "free";
}
