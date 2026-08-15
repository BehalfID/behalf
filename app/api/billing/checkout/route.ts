import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { stripePriceIdForPlan } from "@/lib/billingPlans";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { hasActiveComplimentaryPlan } from "@/lib/planGrants";
import { isSelfServePlan, type SelfServePlan } from "@/lib/plans";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import { getStripe } from "@/lib/stripe";
import { updateAccount } from "@/lib/repositories/accounts";

async function readRequestedPlan(request: NextRequest): Promise<SelfServePlan | Response> {
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const requested =
    body && typeof body === "object" && "plan" in body
      ? (body as { plan?: unknown }).plan
      : "pro";

  // Omit / nullish plan defaults to Pro (historical single-tier checkout).
  if (requested === undefined || requested === null || requested === "") {
    return "pro";
  }
  if (!isSelfServePlan(requested)) {
    return jsonError("plan must be one of: pro, team, business.", 400);
  }
  return requested;
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  if (!auth.account) {
    return jsonError("Billing account not found.", 404);
  }

  if (auth.account.plan !== "free") {
    return jsonError("Account is already on a paid plan. Use Manage subscription to change tiers.", 409);
  }

  // A comped workspace still reads as "free" here, because a grant never
  // touches `plan`. Without this check the customer could start a paid
  // subscription for entitlements they already hold and be charged for it.
  if (hasActiveComplimentaryPlan(auth.account)) {
    return jsonError(
      "This workspace has a complimentary plan. Contact BehalfID to start a paid subscription.",
      409
    );
  }

  const planOrError = await readRequestedPlan(request);
  if (planOrError instanceof Response) return planOrError;
  const plan = planOrError;

  const priceId = stripePriceIdForPlan(plan);
  if (!priceId) {
    return jsonError("Billing is not configured for this plan.", 503);
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
  const billingUrl = `${appUrl}/dashboard/billing`;

  let customerId = auth.account.stripeCustomerId;

  try {
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.user.email,
        metadata: { accountId: auth.account.accountId }
      });
      customerId = customer.id;
      await updateAccount(auth.account.accountId, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: auth.account.accountId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        accountId: auth.account.accountId,
        behalfPlan: plan
      },
      subscription_data: {
        metadata: {
          accountId: auth.account.accountId,
          behalfPlan: plan
        },
        // 7-day trial remains Pro-only; Team/Business charge immediately.
        ...(plan === "pro"
          ? {
              trial_period_days: 7,
              trial_settings: {
                end_behavior: { missing_payment_method: "cancel" as const }
              }
            }
          : {})
      },
      success_url: `${billingUrl}?success=1`,
      cancel_url: `${billingUrl}?canceled=1`
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error("[billing/checkout] Stripe API error:", err.type, err.code, err.message);
    } else {
      console.error("[billing/checkout] Unexpected error:", err);
    }
    return jsonError("Failed to create checkout session. Please try again.", 502);
  }
}
