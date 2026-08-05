/**
 * Complimentary plan grants.
 *
 * The property under test throughout is that a grant survives Stripe. Every
 * webhook branch in `app/api/billing/webhook/route.ts` ends in an unconditional
 * write to `accounts.plan`, and three of them write "free"; if a comp lived in
 * that column it would be erased by a cancelled subscription, a failed invoice,
 * or a trial ending, with no record it had existed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  activeComplimentaryPlan,
  complimentaryBadge,
  complimentaryGrantView,
  effectiveEntitlements,
  effectivePlan,
  hasActiveComplimentaryPlan,
  isComplimentaryPlan,
  planEntitlementRegressions,
  planSource
} from "@/lib/planGrants";
import { getPlanEntitlements, PLANS } from "@/lib/plans";

const HOUR = 3_600_000;

describe("effective plan resolution", () => {
  it("falls back to the billing plan when there is no grant", () => {
    expect(effectivePlan({ plan: "free" })).toBe("free");
    expect(effectivePlan({ plan: "pro" })).toBe("pro");
    expect(effectivePlan(null)).toBe("free");
    expect(effectivePlan(undefined)).toBe("free");
    expect(planSource({ plan: "pro" })).toBe("billing");
  });

  it("raises a free workspace to the granted plan", () => {
    const account = { plan: "free", complimentaryPlan: "pro" };
    expect(effectivePlan(account)).toBe("pro");
    expect(planSource(account)).toBe("complimentary");
    expect(activeComplimentaryPlan(account)).toBe("pro");
    expect(hasActiveComplimentaryPlan(account)).toBe(true);
  });

  it("treats a missing expiry as a lifetime grant", () => {
    const account = { plan: "free", complimentaryPlan: "enterprise", complimentaryPlanExpiresAt: null };
    expect(effectivePlan(account, new Date("2099-01-01T00:00:00Z"))).toBe("enterprise");
  });

  it("ignores a grant once its expiry has passed", () => {
    const account = {
      plan: "free",
      complimentaryPlan: "business",
      complimentaryPlanExpiresAt: new Date(Date.now() - HOUR)
    };
    expect(activeComplimentaryPlan(account)).toBeNull();
    expect(effectivePlan(account)).toBe("free");
    expect(planSource(account)).toBe("billing");
    expect(effectiveEntitlements(account)).toEqual(getPlanEntitlements("free"));
  });

  it("treats the expiry instant itself as expired", () => {
    const at = new Date("2026-06-01T00:00:00.000Z");
    const account = { plan: "free", complimentaryPlan: "pro", complimentaryPlanExpiresAt: at };
    expect(activeComplimentaryPlan(account, new Date(at.getTime() - 1))).toBe("pro");
    expect(activeComplimentaryPlan(account, at)).toBeNull();
  });

  it("accepts a serialized date string, as lean documents and JSON payloads produce", () => {
    const account = {
      plan: "free",
      complimentaryPlan: "pro",
      complimentaryPlanExpiresAt: "2099-01-01T00:00:00.000Z"
    };
    expect(activeComplimentaryPlan(account)).toBe("pro");
  });

  it("ignores an unreadable stored grant rather than treating it as valid", () => {
    expect(activeComplimentaryPlan({ plan: "free", complimentaryPlan: "platinum" })).toBeNull();
    expect(activeComplimentaryPlan({ plan: "free", complimentaryPlan: "" })).toBeNull();
    // "free" is not grantable: it would be a no-op that still read as a comp.
    expect(activeComplimentaryPlan({ plan: "free", complimentaryPlan: "free" })).toBeNull();
    expect(isComplimentaryPlan("free")).toBe(false);
    expect(
      activeComplimentaryPlan({
        plan: "free",
        complimentaryPlan: "pro",
        complimentaryPlanExpiresAt: "not-a-date"
      })
    ).toBe("pro");
  });

  it("keeps the paid plan when the grant does not exceed it", () => {
    const account = { plan: "business", complimentaryPlan: "pro" };
    expect(effectivePlan(account)).toBe("business");
    // The workspace is not "on a complimentary plan" — it pays for more.
    expect(planSource(account)).toBe("billing");
    expect(complimentaryBadge(account)).toBeNull();
  });
});

describe("a grant only ever adds entitlements", () => {
  it("gives a comped free workspace the granted plan's entitlements", () => {
    expect(effectiveEntitlements({ plan: "free", complimentaryPlan: "pro" })).toEqual(
      getPlanEntitlements("pro")
    );
  });

  it("never lowers an entitlement the workspace already pays for", () => {
    // "pro" is a legacy Stripe tier allowing more agents (50) than the newer
    // "team" tier (25), so plan rank and plan entitlements are not monotonic.
    // Replacing the plan wholesale would take 25 agents off a paying customer.
    expect(planEntitlementRegressions("pro", "team")).toContain("maxAgents");

    const account = { plan: "pro", complimentaryPlan: "team" };
    const entitlements = effectiveEntitlements(account);
    expect(entitlements.maxAgents).toBe(getPlanEntitlements("pro").maxAgents);
    expect(entitlements.logRetentionDays).toBe(getPlanEntitlements("pro").logRetentionDays);
  });

  it("holds for every pairing of billing plan and granted plan", () => {
    for (const billing of PLANS) {
      for (const granted of ["pro", "team", "business", "enterprise"] as const) {
        const paid = getPlanEntitlements(billing);
        const effective = effectiveEntitlements({ plan: billing, complimentaryPlan: granted });
        for (const key of Object.keys(paid) as Array<keyof typeof paid>) {
          const before = paid[key];
          const after = effective[key];
          if (typeof before === "boolean") {
            // A feature the workspace already had must never be switched off.
            if (before) expect(after, `${billing}+${granted}.${key}`).toBe(true);
            continue;
          }
          expect(after as number, `${billing}+${granted}.${key}`).toBeGreaterThanOrEqual(
            before as number
          );
        }
      }
    }
  });

  it("keeps unlimited unlimited", () => {
    const entitlements = effectiveEntitlements({ plan: "enterprise", complimentaryPlan: "pro" });
    expect(entitlements.maxAgents).toBe(Infinity);
    expect(entitlements.monthlyVerifications).toBe(Infinity);
  });
});

describe("grant detail for admin surfaces", () => {
  it("still reports an expired grant, which entitlement resolution ignores", () => {
    const account = {
      plan: "free",
      complimentaryPlan: "pro",
      complimentaryPlanReason: "Early tester",
      complimentaryPlanGrantedBy: "operator@behalfid.com",
      complimentaryPlanGrantedAt: new Date("2026-01-01T00:00:00Z"),
      complimentaryPlanExpiresAt: new Date("2026-02-01T00:00:00Z")
    };
    const view = complimentaryGrantView(account, new Date("2026-03-01T00:00:00Z"));
    expect(view).toMatchObject({ plan: "pro", reason: "Early tester", expired: true });
    expect(effectivePlan(account, new Date("2026-03-01T00:00:00Z"))).toBe("free");
  });

  it("exposes a badge only when the grant is what raises the plan", () => {
    expect(complimentaryBadge({ plan: "free", complimentaryPlan: "pro" })).toEqual({
      plan: "pro",
      expiresAt: null
    });
    expect(complimentaryBadge({ plan: "free" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stripe cannot reach a grant
// ---------------------------------------------------------------------------

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
  default: { updateOne: billingMocks.accountUpdateOne, findOne: billingMocks.accountFindOne }
}));
vi.mock("@/models/WebhookEndpoint", () => ({
  default: { updateMany: billingMocks.webhookUpdateMany }
}));

/** A comped workspace with a live subscription that is about to end badly. */
const COMPED_ACCOUNT = {
  accountId: "acct_comped",
  name: "Comped Workspace",
  plan: "pro",
  complimentaryPlan: "pro",
  complimentaryPlanReason: "Lifetime early-tester grant",
  complimentaryPlanGrantedBy: "founder",
  complimentaryPlanGrantedAt: new Date("2026-01-01T00:00:00Z"),
  complimentaryPlanExpiresAt: null,
  stripeCustomerId: "cus_test"
};

function stripeRequest() {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}"
  }) as never;
}

/** Every field the Stripe webhook wrote, merged onto the stored account. */
function accountAfterWebhook() {
  const writes = billingMocks.accountUpdateOne.mock.calls.map((call) => call[1].$set);
  return writes.reduce((acc, set) => ({ ...acc, ...set }), { ...COMPED_ACCOUNT });
}

const GRANT_FIELDS = [
  "complimentaryPlan",
  "complimentaryPlanReason",
  "complimentaryPlanGrantedBy",
  "complimentaryPlanGrantedAt",
  "complimentaryPlanExpiresAt"
];

describe("Stripe webhooks cannot clear a complimentary grant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    billingMocks.connectToDatabase.mockResolvedValue(undefined);
    billingMocks.stripeEventCreate.mockResolvedValue({});
    billingMocks.accountUpdateOne.mockResolvedValue({});
    billingMocks.accountFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(COMPED_ACCOUNT)
    });
    billingMocks.webhookUpdateMany.mockResolvedValue({});
  });

  const cancellationEvents = [
    {
      label: "a cancelled subscription",
      event: {
        id: "evt_deleted",
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_test", customer: "cus_test" } }
      }
    },
    {
      label: "a failed invoice",
      event: {
        id: "evt_failed",
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_test" } }
      }
    },
    {
      label: "a subscription that lapses to past_due",
      event: {
        id: "evt_past_due",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_test", customer: "cus_test", status: "past_due" } }
      }
    }
  ];

  it.each(cancellationEvents)("$label resets billing but not the grant", async ({ event }) => {
    billingMocks.constructEvent.mockReturnValue(event);
    const { POST } = await import("@/app/api/billing/webhook/route");

    const response = await POST(stripeRequest());
    expect(response.status).toBe(204);

    // The billing column is reset — that part is correct and unchanged.
    const writes = billingMocks.accountUpdateOne.mock.calls.map((call) => call[1].$set);
    expect(writes.some((set) => set.plan === "free")).toBe(true);

    // No branch may write any grant field, under any name.
    for (const set of writes) {
      for (const field of GRANT_FIELDS) {
        expect(Object.keys(set), `wrote ${field}`).not.toContain(field);
      }
    }

    // And the workspace keeps Pro entitlements afterwards.
    const after = accountAfterWebhook();
    expect(after.plan).toBe("free");
    expect(effectivePlan(after)).toBe("pro");
    expect(effectiveEntitlements(after)).toEqual(getPlanEntitlements("pro"));
  });

  it("keeps webhook delivery enabled for a comped workspace after a failed invoice", async () => {
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_failed_webhooks",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_test" } }
    });
    const { POST } = await import("@/app/api/billing/webhook/route");

    await POST(stripeRequest());

    // Keying this off the subscription status alone would disable delivery for
    // a workspace whose grant still entitles it to webhooks.
    expect(billingMocks.webhookUpdateMany).toHaveBeenCalledWith(
      { accountId: "acct_comped", status: "disabled" },
      { $set: { status: "active" } }
    );
  });

  it("still disables webhook delivery for an uncomped workspace", async () => {
    billingMocks.accountFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        accountId: "acct_plain",
        name: "Plain",
        plan: "pro",
        stripeCustomerId: "cus_test"
      })
    });
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_failed_plain",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_test" } }
    });
    const { POST } = await import("@/app/api/billing/webhook/route");

    await POST(stripeRequest());

    expect(billingMocks.webhookUpdateMany).toHaveBeenCalledWith(
      { accountId: "acct_plain", status: "active" },
      { $set: { status: "disabled" } }
    );
  });
});

describe("log retention honours a grant", () => {
  it("reads the window from the account, not from the billing plan", async () => {
    const { retentionSince } = await import("@/lib/quota");

    const comped = retentionSince({ plan: "free", complimentaryPlan: "pro" });
    const free = retentionSince({ plan: "free" });

    const days = (d: Date) => Math.round((Date.now() - d.getTime()) / 86_400_000);
    expect(days(free)).toBe(7);
    // Purging on the free window while showing ninety days would be an
    // irreversible loss caused by reading the wrong field.
    expect(days(comped)).toBe(90);
  });
});
