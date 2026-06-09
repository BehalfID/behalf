import type { IntegrationConfig, VerifyInput, GatedResult } from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

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
