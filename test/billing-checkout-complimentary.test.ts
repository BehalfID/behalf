/**
 * A comped workspace must not be able to start a paid subscription for
 * entitlements it already holds.
 *
 * The route's existing guard reads `account.plan`, which stays "free" under a
 * grant because a grant never touches that column — so without a second check
 * the customer would be charged for what they were given.
 */
import { describe, expect, it, vi } from "vitest";

const checkoutMocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getStripe: vi.fn(),
  updateAccount: vi.fn(),
  checkRateLimit: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: checkoutMocks.requireDeveloperApi
}));
vi.mock("@/lib/stripe", () => ({ getStripe: checkoutMocks.getStripe }));
vi.mock("@/lib/repositories/accounts", () => ({ updateAccount: checkoutMocks.updateAccount }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: checkoutMocks.checkRateLimit,
  rateLimitError: () => new Response(null, { status: 429 })
}));

function checkoutRequest() {
  const request = new Request("http://localhost/api/billing/checkout", { method: "POST" });
  // The route reads `request.nextUrl.origin`, which a plain Request lacks.
  Object.defineProperty(request, "nextUrl", {
    value: new URL("http://localhost/api/billing/checkout")
  });
  return request as never;
}

function authFor(account: Record<string, unknown>) {
  checkoutMocks.requireDeveloperApi.mockResolvedValue({
    error: null,
    user: { userId: "user_1", email: "jason@example.test" },
    account
  });
}

describe("POST /api/billing/checkout with a complimentary grant", () => {
  it("refuses while the grant is active", async () => {
    vi.clearAllMocks();
    authFor({
      accountId: "acct_comped",
      plan: "free",
      complimentaryPlan: "pro",
      complimentaryPlanExpiresAt: null
    });
    const { POST } = await import("@/app/api/billing/checkout/route");

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("complimentary plan");
    // Refused before Stripe is touched, so no customer is created.
    expect(checkoutMocks.getStripe).not.toHaveBeenCalled();
    expect(checkoutMocks.updateAccount).not.toHaveBeenCalled();
  });

  it("allows checkout once the grant has expired", async () => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_test");
    checkoutMocks.checkRateLimit.mockResolvedValue({ limited: false });
    checkoutMocks.getStripe.mockReturnValue({
      customers: { create: vi.fn().mockResolvedValue({ id: "cus_new" }) },
      checkout: {
        sessions: { create: vi.fn().mockResolvedValue({ url: "https://stripe.test/session" }) }
      }
    });
    checkoutMocks.updateAccount.mockResolvedValue({});
    authFor({
      accountId: "acct_expired",
      plan: "free",
      complimentaryPlan: "pro",
      complimentaryPlanExpiresAt: new Date(Date.now() - 86_400_000)
    });
    const { POST } = await import("@/app/api/billing/checkout/route");

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(200);
    expect((await response.json()).url).toBe("https://stripe.test/session");
    vi.unstubAllEnvs();
  });
});
