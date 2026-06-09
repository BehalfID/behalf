import type { IntegrationConfig, VerifyInput, GatedResult } from "../shared/index.js";
export type OpenAIToolCall = {
    name: string;
    arguments: Record<string, unknown>;
};
export declare function checkToolCall<T>(config: IntegrationConfig, toolCall: OpenAIToolCall, execute: () => Promise<T>, verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>): Promise<GatedResult<T>>;
export declare function checkWebBrowse<T>(config: IntegrationConfig, url: string, execute: () => Promise<T>): Promise<GatedResult<T>>;
export declare function checkPurchase<T>(config: IntegrationConfig, options: {
    vendor: string;
    amount: number;
    execute: () => Promise<T>;
    metadata?: Record<string, unknown>;
}): Promise<GatedResult<T>>;
