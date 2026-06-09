import type { IntegrationConfig, GatedResult } from "../shared/index.js";
export declare function gateCheckoutSession<T>(config: IntegrationConfig, options: {
    amountTotal: number;
    customerId?: string;
    metadata?: Record<string, unknown>;
    execute: () => Promise<T>;
}): Promise<GatedResult<T>>;
export declare function gateCharge<T>(config: IntegrationConfig, options: {
    amount: number;
    customerId?: string;
    metadata?: Record<string, unknown>;
    execute: () => Promise<T>;
}): Promise<GatedResult<T>>;
export declare function gateSubscriptionChange<T>(config: IntegrationConfig, options: {
    subscriptionId: string;
    newPriceId?: string;
    metadata?: Record<string, unknown>;
    execute: () => Promise<T>;
}): Promise<GatedResult<T>>;
export declare function gateRefund<T>(config: IntegrationConfig, options: {
    chargeId: string;
    amount?: number;
    metadata?: Record<string, unknown>;
    execute: () => Promise<T>;
}): Promise<GatedResult<T>>;
