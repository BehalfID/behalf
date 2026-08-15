import { beforeEach, describe, expect, it, vi } from "vitest";

const billingMocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  constructEvent: vi.fn(),
  stripeEventCreate: vi.fn(),
  accountUpdateOne: vi.fn(),
  accountFindOne: vi.fn(),
  webhookUpdateMany: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: billingMocks.connectToDatabase }));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: billingMocks.constructEvent } })
}));
vi.mock("@/models/StripeWebhookEvent", () => ({
  default: { create: billingMocks.stripeEventCreate }
}));
vi.mock("@/models/Account", () => ({
  default: {
    updateOne: billingMocks.accountUpdateOne,
    findOne: billingMocks.accountFindOne
  }
}));
vi.mock("@/models/WebhookEndpoint", () => ({
  default: { updateMany: billingMocks.webhookUpdateMany }
}));

// Analytics attribution resolves the workspace owner; mocked so the webhook
// route under test never reaches a live datastore for a side-effect lookup.
vi.mock("@/lib/repositories/memberships", () => ({
  findMembershipsByAccountId: vi.fn().mockResolvedValue([])
}));
vi.mock("@/lib/analytics/server", () => ({
  trackServerEvent: vi.fn().mockResolvedValue(undefined)
}));

function stripeRequest() {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}"
  }) as never;
}

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    billingMocks.connectToDatabase.mockResolvedValue(undefined);
    billingMocks.stripeEventCreate.mockResolvedValue({});
    billingMocks.accountUpdateOne.mockResolvedValue({});
    billingMocks.accountFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ accountId: "acct_test" })
    });
    billingMocks.webhookUpdateMany.mockResolvedValue({});
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_test",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_test", customer: "cus_test", status: "active" } }
    });
  });

  it("claims Stripe event IDs before applying side effects", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");

    const response = await POST(stripeRequest());

    expect(response.status).toBe(204);
    expect(billingMocks.stripeEventCreate).toHaveBeenCalledWith({
      eventId: "evt_test",
      type: "customer.subscription.updated",
      processedAt: expect.any(Date)
    });
    expect(billingMocks.accountUpdateOne).toHaveBeenCalledWith(
      { stripeCustomerId: "cus_test" },
      expect.objectContaining({
        $set: expect.objectContaining({
          plan: "pro",
          stripeSubscriptionId: "sub_test",
          stripeSubscriptionStatus: "active"
        })
      })
    );
  });

  it("assigns team when checkout metadata requests the team plan", async () => {
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_checkout_team",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "acct_team",
          customer: "cus_team",
          subscription: "sub_team",
          metadata: { behalfPlan: "team", accountId: "acct_team" }
        }
      }
    });
    const { POST } = await import("@/app/api/billing/webhook/route");

    const response = await POST(stripeRequest());

    expect(response.status).toBe(204);
    expect(billingMocks.accountUpdateOne).toHaveBeenCalledWith(
      { accountId: "acct_team" },
      expect.objectContaining({
        $set: expect.objectContaining({
          plan: "team",
          stripeCustomerId: "cus_team",
          stripeSubscriptionId: "sub_team",
          stripeSubscriptionStatus: "active"
        })
      })
    );
  });

  it("maps subscription updates to the price-matched plan", async () => {
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
    vi.stubEnv("STRIPE_TEAM_PRICE_ID", "price_team");
    vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_business");
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_sub_business",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_biz",
          customer: "cus_test",
          status: "active",
          items: { data: [{ price: { id: "price_business" }, current_period_end: 1_800_000_000 }] }
        }
      }
    });
    const { POST } = await import("@/app/api/billing/webhook/route");

    const response = await POST(stripeRequest());

    expect(response.status).toBe(204);
    expect(billingMocks.accountUpdateOne).toHaveBeenCalledWith(
      { stripeCustomerId: "cus_test" },
      expect.objectContaining({
        $set: expect.objectContaining({
          plan: "business",
          stripeSubscriptionStatus: "active"
        })
      })
    );
    vi.unstubAllEnvs();
  });

  it("ignores duplicate Stripe events without repeating side effects", async () => {
    billingMocks.stripeEventCreate.mockRejectedValue({ code: 11000 });
    const { POST } = await import("@/app/api/billing/webhook/route");

    const response = await POST(stripeRequest());

    expect(response.status).toBe(204);
    expect(billingMocks.accountUpdateOne).not.toHaveBeenCalled();
    expect(billingMocks.webhookUpdateMany).not.toHaveBeenCalled();
  });

  it("safely acknowledges unknown event types", async () => {
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_unknown",
      type: "billing_portal.session.created",
      data: { object: {} }
    });
    const { POST } = await import("@/app/api/billing/webhook/route");

    const response = await POST(stripeRequest());

    expect(response.status).toBe(204);
    expect(billingMocks.accountUpdateOne).not.toHaveBeenCalled();
  });

  it("does not mutate accounts when checkout sessions are missing account references", async () => {
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_checkout_missing",
      type: "checkout.session.completed",
      data: { object: { customer: "cus_test", subscription: "sub_test" } }
    });
    const { POST } = await import("@/app/api/billing/webhook/route");

    const response = await POST(stripeRequest());

    expect(response.status).toBe(204);
    expect(billingMocks.accountUpdateOne).not.toHaveBeenCalled();
    expect(billingMocks.webhookUpdateMany).not.toHaveBeenCalled();
  });

  it("disables webhooks when subscription updates downgrade an account", async () => {
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_sub_past_due",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_test", customer: "cus_test", status: "past_due" } }
    });
    const { POST } = await import("@/app/api/billing/webhook/route");

    const response = await POST(stripeRequest());

    expect(response.status).toBe(204);
    expect(billingMocks.accountUpdateOne).toHaveBeenCalledWith(
      { stripeCustomerId: "cus_test" },
      expect.objectContaining({
        $set: expect.objectContaining({
          plan: "free",
          stripeSubscriptionStatus: "past_due"
        })
      })
    );
    expect(billingMocks.webhookUpdateMany).toHaveBeenCalledWith(
      { accountId: "acct_test", status: "active" },
      { $set: { status: "disabled" } }
    );
  });

  it("failed payments disable paid limits and webhooks", async () => {
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_invoice_failed",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_test" } }
    });
    const { POST } = await import("@/app/api/billing/webhook/route");

    const response = await POST(stripeRequest());

    expect(response.status).toBe(204);
    expect(billingMocks.accountUpdateOne).toHaveBeenCalledWith(
      { stripeCustomerId: "cus_test" },
      { $set: { plan: "free", stripeSubscriptionStatus: "past_due", stripeTrialEnd: null, stripeCurrentPeriodEnd: null } }
    );
    expect(billingMocks.webhookUpdateMany).toHaveBeenCalledWith(
      { accountId: "acct_test", status: "active" },
      { $set: { status: "disabled" } }
    );
  });
});
