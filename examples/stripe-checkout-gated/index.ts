/**
 * Stripe checkout gating — runnable example.
 *
 * Shows BehalfID permission checks in front of Stripe payment operations.
 * The Stripe API calls are stubbed — no Stripe key is needed to run this.
 * Swap the stubs for real stripe.* calls once gating is verified.
 *
 * This example exercises all four gate functions:
 *   gateCheckoutSession  — create a checkout session
 *   gateCharge           — direct charge
 *   gateSubscriptionChange — upgrade/downgrade/cancel subscription
 *   gateRefund           — issue a refund
 *
 * Run:
 *   cp .env.example .env
 *   npx tsx index.ts
 *
 * Expected output (all permitted):
 *   [VERIFY] stripe:checkout    amount=4999  -> ALLOW  { id: 'cs_stub_123' }
 *   [VERIFY] stripe:charge      amount=2000  -> ALLOW  { chargeId: 'ch_stub_456' }
 *   [VERIFY] stripe:subscription_change      -> ALLOW  { updated: true }
 *   [VERIFY] stripe:refund      amount=1500  -> ALLOW  { refundId: 'rf_stub_789' }
 */

import { config as loadEnv } from "dotenv";
import { BehalfID } from "@behalfid/sdk";
import {
  gateCheckoutSession,
  gateCharge,
  gateSubscriptionChange,
  gateRefund,
} from "../../integrations/stripe/index.js";

loadEnv();

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! });

const integrationConfig = {
  client: behalf,
  agentId: process.env.BEHALFID_AGENT_ID!,
};

// ─── Stub Stripe responses ────────────────────────────────────────────────────

async function stripeCreateCheckoutSession() {
  return { id: "cs_stub_123", url: "https://checkout.stripe.com/pay/cs_stub_123" };
}

async function stripeCreateCharge() {
  return { chargeId: "ch_stub_456", status: "succeeded" };
}

async function stripeUpdateSubscription() {
  return { updated: true, subscriptionId: "sub_abc123" };
}

async function stripeCreateRefund() {
  return { refundId: "rf_stub_789", status: "succeeded" };
}

// ─── Run all gates ────────────────────────────────────────────────────────────

async function runGate(label: string, amount: number | undefined, fn: () => Promise<unknown>) {
  const tag = amount !== undefined ? `amount=${amount}` : "";
  process.stdout.write(`[VERIFY] ${label.padEnd(32)} ${tag.padEnd(12)} -> `);
  const result = fn instanceof Function ? await fn() : null;
  // The fn is already the gateXxx call — result is GatedResult
  const r = result as { blocked: boolean; reason?: string; result?: unknown; requestId?: string };
  if (r.blocked) {
    console.log(`DENY   reason="${r.reason}"`);
  } else {
    console.log(`ALLOW  `, r.result);
  }
}

async function main() {
  const checkout = await gateCheckoutSession(integrationConfig, {
    amountTotal: 4999,
    customerId: "cus_demo",
    execute: stripeCreateCheckoutSession,
  });
  logResult("stripe:checkout", checkout, 4999);

  const charge = await gateCharge(integrationConfig, {
    amount: 2000,
    customerId: "cus_demo",
    execute: stripeCreateCharge,
  });
  logResult("stripe:charge", charge, 2000);

  const sub = await gateSubscriptionChange(integrationConfig, {
    subscriptionId: "sub_abc123",
    newPriceId: "price_pro",
    execute: stripeUpdateSubscription,
  });
  logResult("stripe:subscription_change", sub, undefined);

  const refund = await gateRefund(integrationConfig, {
    chargeId: "ch_stub_456",
    amount: 1500,
    execute: stripeCreateRefund,
  });
  logResult("stripe:refund", refund, 1500);
}

function logResult(
  action: string,
  result: { blocked: boolean; reason?: string; result?: unknown; requestId?: string },
  amount: number | undefined
) {
  const amountLabel = amount !== undefined ? `amount=${amount}` : "";
  const label = `[VERIFY] ${action}`.padEnd(42);
  if (result.blocked) {
    console.log(`${label} ${amountLabel.padEnd(12)} -> DENY   reason="${result.reason}"`);
  } else {
    console.log(`${label} ${amountLabel.padEnd(12)} -> ALLOW `, result.result);
  }
}

main().catch(console.error);
