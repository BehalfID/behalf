# Stripe Permission Gate Examples

**Status: EXPERIMENTAL — permission-check examples only**

This adapter shows how to gate Stripe API calls behind BehalfID permission checks so that agent-initiated payments require explicit authorization before any money moves.

**This is not an official Stripe integration.** It contains no Stripe API calls — only the BehalfID permission checks that should wrap them. You add your real Stripe client calls inside the `execute` callbacks.

## Why gate Stripe calls with BehalfID?

Without a permission layer, an AI agent with access to your Stripe credentials can initiate charges, issue refunds, or change subscriptions autonomously. BehalfID lets you define exactly what the agent is allowed to do (action, maximum amount, allowed vendors) and denies anything outside that scope before it reaches Stripe.

## Required permissions

Create these in the BehalfID dashboard for your agent:

| Action | Description |
|---|---|
| `stripe:checkout` | Create a checkout session |
| `stripe:charge` | Charge a customer directly |
| `stripe:subscription_change` | Upgrade, downgrade, or cancel a subscription |
| `stripe:refund` | Issue a refund |

Set `maxAmount` constraints to cap how much the agent can authorize per action.

## Installation

```bash
npm install @behalfid/sdk stripe
```

## Setup

```typescript
import { BehalfID } from "@behalfid/sdk";
import Stripe from "stripe";
import { gateCheckoutSession, gateCharge, gateRefund } from "./integrations/stripe";

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const config = {
  client: behalf,
  agentId: process.env.BEHALFID_AGENT_ID!,
};
```

## Usage

### Create a checkout session

```typescript
const gated = await gateCheckoutSession(config, {
  amountTotal: 4999,  // cents — matched against maxAmount constraint
  execute: async () =>
    stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_URL}/success`,
      cancel_url:  `${process.env.NEXT_PUBLIC_URL}/cancel`,
    }),
});

if (gated.blocked) throw new Error(`Payment blocked: ${gated.reason}`);
return gated.result; // Stripe.Checkout.Session
```

### Charge a customer

```typescript
const gated = await gateCharge(config, {
  amount: 2000,
  customerId: "cus_abc123",
  execute: async () =>
    stripe.charges.create({
      amount: 2000,
      currency: "usd",
      customer: "cus_abc123",
    }),
});
```

### Change a subscription

```typescript
const gated = await gateSubscriptionChange(config, {
  subscriptionId: "sub_abc123",
  newPriceId: "price_xyz",
  execute: async () =>
    stripe.subscriptions.update("sub_abc123", {
      items: [{ id: itemId, price: "price_xyz" }],
    }),
});
```

### Issue a refund

```typescript
const gated = await gateRefund(config, {
  chargeId: "ch_abc123",
  amount: 1500,          // partial refund — omit for full refund
  execute: async () =>
    stripe.refunds.create({ charge: "ch_abc123", amount: 1500 }),
});
```

## Response shape

```typescript
if (gated.blocked === true) {
  gated.reason    // why BehalfID denied it
  gated.risk      // "low" | "medium" | "high"
  gated.requestId // audit log ID
}

if (gated.blocked === false) {
  gated.result    // Stripe API response
  gated.requestId // audit log ID
}
```

## What still needs to happen for an official Stripe integration

- Listed in the Stripe App Marketplace with a reviewed payment flow
- Stripe-reviewed integration guide covering SCA, webhooks, and idempotency
- Dedicated `@behalfid/stripe` package on npm
