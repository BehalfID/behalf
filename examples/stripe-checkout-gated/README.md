# Stripe Checkout Gating

Shows BehalfID permission checks in front of all four Stripe payment operations. No Stripe API key required — the Stripe responses are stubbed. Swap the stubs for real `stripe.*` calls after validating the gating logic.

## Operations covered

| Gate function | BehalfID action | What it protects |
|---|---|---|
| `gateCheckoutSession` | `stripe:checkout` | Creating a checkout session |
| `gateCharge` | `stripe:charge` | Direct customer charge |
| `gateSubscriptionChange` | `stripe:subscription_change` | Upgrading/downgrading/cancelling a subscription |
| `gateRefund` | `stripe:refund` | Issuing a refund |

## Setup

```bash
cp .env.example .env
# Fill in BEHALFID_API_KEY and BEHALFID_AGENT_ID
```

In the BehalfID dashboard, create permissions for:
- `stripe:checkout`
- `stripe:charge`
- `stripe:subscription_change`
- `stripe:refund`

## Run

```bash
npx tsx index.ts
```

## Expected output (all permitted)

```
[VERIFY] stripe:checkout           amount=4999   -> ALLOW  { id: 'cs_stub_123', url: '...' }
[VERIFY] stripe:charge             amount=2000   -> ALLOW  { chargeId: 'ch_stub_456', status: 'succeeded' }
[VERIFY] stripe:subscription_change              -> ALLOW  { updated: true, subscriptionId: 'sub_abc123' }
[VERIFY] stripe:refund             amount=1500   -> ALLOW  { refundId: 'rf_stub_789', status: 'succeeded' }
```

## Deny scenario

Remove the `stripe:checkout` permission from the dashboard. The checkout will be blocked with a denial reason; no execute() call is made, no Stripe API call happens.

## Plugging in a real Stripe client

```typescript
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const gated = await gateCheckoutSession(integrationConfig, {
  amountTotal: 4999,
  customerId: "cus_abc123",
  execute: async () => stripe.checkout.sessions.create({
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "payment",
    success_url: `${process.env.NEXT_PUBLIC_URL}/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/cancel`,
  }),
});

if (gated.blocked) {
  throw new Error(`Payment blocked: ${gated.reason}`);
}
return gated.result; // Stripe.Checkout.Session
```

## Important: money never moves on denial

`execute()` is only called after BehalfID confirms the action is permitted. If BehalfID is unreachable (network failure, server error), the action is blocked automatically — execute() is never called and no Stripe call is made.
