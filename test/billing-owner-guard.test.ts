/**
 * Stripe checkout / customer-portal sessions act on the workspace's whole
 * subscription, payment method and invoices: only workspace OWNERs may open them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  getStripe: vi.fn(),
  checkRateLimit: vi.fn(),
  portalCreate: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({ requireDeveloperApi: mocks.requireDeveloperApi }));
vi.mock("@/lib/delegatedAuth", () => ({ getWorkspaceActor: mocks.getWorkspaceActor }));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.getStripe }));
vi.mock("@/lib/repositories/accounts", () => ({ updateAccount: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitError: () => new Response(null, { status: 429 })
}));

function post(path: string) {
  const request = new Request(`http://localhost${path}`, { method: "POST" });
  Object.defineProperty(request, "nextUrl", { value: new URL(`http://localhost${path}`) });
  return request as never;
}

function actor(role: string) {
  return { userId: "user_1", accountId: "acct_1", role, authorityLevel: role === "OWNER" ? 100 : 10 };
}

describe("billing routes require a workspace OWNER", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireDeveloperApi.mockResolvedValue({
      error: null,
      user: { userId: "user_1" },
      account: { accountId: "acct_1", plan: "free", stripeCustomerId: "cus_1" }
    });
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.portalCreate.mockResolvedValue({ url: "https://billing.stripe.test/session" });
    mocks.getStripe.mockReturnValue({ billingPortal: { sessions: { create: mocks.portalCreate } } });
  });

  for (const role of ["VIEWER", "ENGINEER", "ENGINEERING_LEAD"]) {
    it(`refuses the billing portal for ${role}`, async () => {
      mocks.getWorkspaceActor.mockResolvedValue(actor(role));
      const { POST } = await import("@/app/api/billing/portal/route");
      const response = await POST(post("/api/billing/portal"));
      expect(response.status).toBe(403);
      expect(mocks.portalCreate).not.toHaveBeenCalled();
    });

    it(`refuses checkout for ${role}`, async () => {
      mocks.getWorkspaceActor.mockResolvedValue(actor(role));
      const { POST } = await import("@/app/api/billing/checkout/route");
      const response = await POST(post("/api/billing/checkout"));
      expect(response.status).toBe(403);
      expect(mocks.getStripe).not.toHaveBeenCalled();
    });
  }

  it("refuses when the caller is not a member of the workspace", async () => {
    mocks.getWorkspaceActor.mockResolvedValue(null);
    const { POST } = await import("@/app/api/billing/portal/route");
    expect((await POST(post("/api/billing/portal"))).status).toBe(403);
    expect(mocks.portalCreate).not.toHaveBeenCalled();
  });

  it("opens the portal for an OWNER", async () => {
    mocks.getWorkspaceActor.mockResolvedValue(actor("OWNER"));
    const { POST } = await import("@/app/api/billing/portal/route");
    const response = await POST(post("/api/billing/portal"));
    expect(response.status).toBe(200);
    expect(mocks.portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1" })
    );
  });
});
