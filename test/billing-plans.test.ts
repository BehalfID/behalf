import { afterEach, describe, expect, it, vi } from "vitest";
import {
  billingPlanForSubscriptionStatus,
  planFromStripePriceId,
  resolveSubscriptionPlan,
  stripePriceIdForPlan
} from "@/lib/billingPlans";

describe("billing plan ↔ Stripe price mapping", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads price IDs from env per self-serve plan", () => {
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
    vi.stubEnv("STRIPE_TEAM_PRICE_ID", "price_team");
    vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_business");

    expect(stripePriceIdForPlan("pro")).toBe("price_pro");
    expect(stripePriceIdForPlan("team")).toBe("price_team");
    expect(stripePriceIdForPlan("business")).toBe("price_business");
    expect(planFromStripePriceId("price_team")).toBe("team");
    expect(planFromStripePriceId("price_unknown")).toBeNull();
  });

  it("prefers subscription metadata over price id", () => {
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
    vi.stubEnv("STRIPE_TEAM_PRICE_ID", "price_team");

    expect(
      resolveSubscriptionPlan({
        metadata: { behalfPlan: "business" },
        items: { data: [{ price: { id: "price_pro" } }] }
      })
    ).toBe("business");
  });

  it("falls back to price id, then pro for unknown active subscriptions", () => {
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
    vi.stubEnv("STRIPE_TEAM_PRICE_ID", "price_team");
    vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_business");

    expect(
      resolveSubscriptionPlan({
        metadata: {},
        items: { data: [{ price: { id: "price_team" } }] }
      })
    ).toBe("team");

    expect(resolveSubscriptionPlan({ metadata: {}, items: { data: [] } })).toBe("pro");
  });

  it("maps inactive subscription status to free", () => {
    expect(
      billingPlanForSubscriptionStatus("canceled", {
        metadata: { behalfPlan: "team" }
      })
    ).toBe("free");
    expect(
      billingPlanForSubscriptionStatus("trialing", {
        metadata: { behalfPlan: "team" }
      })
    ).toBe("team");
  });
});
