import type { IntegrationConfig, VerifyInput, DenyResponse } from "../shared/index.js";
export type LlamaIndexToolLike<TInput = Record<string, unknown>, TOutput = unknown> = {
    metadata: {
        name: string;
        description: string;
        parameters?: Record<string, unknown>;
    };
    call(input: TInput): Promise<TOutput>;
};
export type LlamaToolResult<TOutput> = TOutput | DenyResponse;
export declare function wrapLlamaToolWithBehalfID<TInput = Record<string, unknown>, TOutput = unknown>(config: IntegrationConfig, tool: LlamaIndexToolLike<TInput, TOutput>, verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>): LlamaIndexToolLike<TInput, LlamaToolResult<TOutput>>;
