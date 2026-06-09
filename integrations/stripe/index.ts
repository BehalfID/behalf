/**
 * BehalfID permission gates for Stripe-style payment workflows.
 *
 * Status: EXPERIMENTAL — permission-check examples only.
 *
 * IMPORTANT: This module is NOT an official Stripe integration. It contains
 * NO Stripe API calls. It shows where to insert BehalfID checks in a payment
 * workflow so that agent-initiated payments require explicit permission before
 * any money moves. Add your real Stripe client calls inside the `execute`
 * callbacks.
 *
 * Required BehalfID permission actions (configure in the dashboard):
 *   "stripe:checkout"            — create a checkout session
 *   "stripe:charge"              — charge a customer directly
 *   "stripe:subscription_change" — upgrade/downgrade/cancel a subscription
 *   "stripe:refund"              — issue a refund
 *
 * Install: npm install @behalfid/sdk
 * Docs:    integrations/stripe/README.md
 */

import type {
  IntegrationConfig,
  VerifyInput,
  GatedResult,
} from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

// ─── Internal gate ────────────────────────────────────────────────────────────

async function gateStripeAction<T>(
  config: IntegrationConfig,
  action: string,
  execute: () => Promise<T>,
  overrides?: Partial<Omit<VerifyInput, "agentId" | "action">>
): Promise<GatedResult<T>> {
  const verifyResult = await safeVerify(config, {
    agentId: config.agentId,
    action,
    vendor: "stripe.com",
    ...overrides,
  });

  if (verifyResult.allowed !== true) {
    return makeDenyResponse(verifyResult);
  }

  const result = await execute();
  return Object.freeze({ blocked: false as const, result, requestId: verifyResult.requestId });
}

// ─── Per-operation gates ──────────────────────────────────────────────────────

/**
 * Gate a Stripe checkout session creation.
 *
 * Enforces any maxAmount constraint set in the BehalfID permission before
 * the session is created. If denied or if the permission check fails,
 * execute is never called.
 *
 * @example
 * const gated = await gateCheckoutSession(config, {
 *   amountTotal: 4999,
 *   execute: async () => stripe.checkout.sessions.create({
 *     line_items: [{ price: priceId, quantity: 1 }],
 *     mode: "payment",
 *     success_url: `${process.env.NEXT_PUBLIC_URL}/success`,
 *     cancel_url:  `${process.env.NEXT_PUBLIC_URL}/cancel`,
 *   }),
 * });
 * if (gated.blocked) throw new Error(`Payment blocked: ${gated.reason}`);
 * return gated.result; // Stripe.Checkout.Session
 */
export async function gateCheckoutSession<T>(
  config: IntegrationConfig,
  options: {
    amountTotal: number;
    customerId?: string;
    metadata?: Record<string, unknown>;
    execute: () => Promise<T>;
  }
): Promise<GatedResult<T>> {
  return gateStripeAction(config, "stripe:checkout", options.execute, {
    amount: options.amountTotal,
    metadata: { customerId: options.customerId, ...options.metadata },
  });
}

/**
 * Gate a direct Stripe charge.
 *
 * @example
 * const gated = await gateCharge(config, {
 *   amount: 2000,
 *   customerId: "cus_abc123",
 *   execute: async () => stripe.charges.create({
 *     amount: 2000,
 *     currency: "usd",
 *     customer: "cus_abc123",
 *   }),
 * });
 */
export async function gateCharge<T>(
  config: IntegrationConfig,
  options: {
    amount: number;
    customerId?: string;
    metadata?: Record<string, unknown>;
    execute: () => Promise<T>;
  }
): Promise<GatedResult<T>> {
  return gateStripeAction(config, "stripe:charge", options.execute, {
    amount: options.amount,
    metadata: { customerId: options.customerId, ...options.metadata },
  });
}

/**
 * Gate a subscription change (upgrade, downgrade, or cancellation).
 *
 * @example
 * const gated = await gateSubscriptionChange(config, {
 *   subscriptionId: "sub_abc123",
 *   newPriceId: "price_xyz",
 *   execute: async () => stripe.subscriptions.update("sub_abc123", {
 *     items: [{ id: itemId, price: "price_xyz" }],
 *   }),
 * });
 */
export async function gateSubscriptionChange<T>(
  config: IntegrationConfig,
  options: {
    subscriptionId: string;
    newPriceId?: string;
    metadata?: Record<string, unknown>;
    execute: () => Promise<T>;
  }
): Promise<GatedResult<T>> {
  return gateStripeAction(config, "stripe:subscription_change", options.execute, {
    metadata: {
      subscriptionId: options.subscriptionId,
      newPriceId: options.newPriceId,
      ...options.metadata,
    },
  });
}

/**
 * Gate a refund issuance.
 *
 * @example
 * const gated = await gateRefund(config, {
 *   chargeId: "ch_abc123",
 *   amount: 1500,
 *   execute: async () => stripe.refunds.create({
 *     charge: "ch_abc123",
 *     amount: 1500,
 *   }),
 * });
 */
export async function gateRefund<T>(
  config: IntegrationConfig,
  options: {
    chargeId: string;
    amount?: number;
    metadata?: Record<string, unknown>;
    execute: () => Promise<T>;
  }
): Promise<GatedResult<T>> {
  return gateStripeAction(config, "stripe:refund", options.execute, {
    amount: options.amount,
    metadata: { chargeId: options.chargeId, ...options.metadata },
  });
}
