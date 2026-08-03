import type { IntegrationConfig, VerifyInput, GatedResult } from "../shared/index.js";
export type OllamaToolCall = {
    name: string;
    arguments: Record<string, unknown>;
};
export type OllamaRawToolCall = {
    id?: string;
    type?: string;
    function?: {
        name?: string;
        arguments?: string | Record<string, unknown>;
    };
    name?: string;
    arguments?: string | Record<string, unknown>;
};
export declare function normalizeOllamaToolCall(raw: OllamaRawToolCall): OllamaToolCall | null;
export declare function parseOllamaToolCalls(rawCalls: unknown): OllamaToolCall[];
export declare function buildDeniedToolMessage(reason: string): {
    role: "tool";
    content: string;
};
export declare function checkToolCall<T>(config: IntegrationConfig, toolCall: OllamaToolCall, execute: () => Promise<T>, verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>): Promise<GatedResult<T>>;
export declare function checkWebBrowse<T>(config: IntegrationConfig, url: string, execute: () => Promise<T>): Promise<GatedResult<T>>;
export declare function checkPurchase<T>(config: IntegrationConfig, options: {
    vendor: string;
    amount: number;
    execute: () => Promise<T>;
    metadata?: Record<string, unknown>;
}): Promise<GatedResult<T>>;
