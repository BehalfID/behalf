import { makeDenyResponse, safeVerify } from "../shared/index.js";
async function gateStripeAction(config, action, execute, overrides) {
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
    return Object.freeze({ blocked: false, result, requestId: verifyResult.requestId });
}
export async function gateCheckoutSession(config, options) {
    return gateStripeAction(config, "stripe:checkout", options.execute, {
        amount: options.amountTotal,
        metadata: { customerId: options.customerId, ...options.metadata },
    });
}
export async function gateCharge(config, options) {
    return gateStripeAction(config, "stripe:charge", options.execute, {
        amount: options.amount,
        metadata: { customerId: options.customerId, ...options.metadata },
    });
}
export async function gateSubscriptionChange(config, options) {
    return gateStripeAction(config, "stripe:subscription_change", options.execute, {
        metadata: {
            subscriptionId: options.subscriptionId,
            newPriceId: options.newPriceId,
            ...options.metadata,
        },
    });
}
export async function gateRefund(config, options) {
    return gateStripeAction(config, "stripe:refund", options.execute, {
        amount: options.amount,
        metadata: { chargeId: options.chargeId, ...options.metadata },
    });
}
