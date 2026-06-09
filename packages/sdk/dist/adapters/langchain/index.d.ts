import type { IntegrationConfig, VerifyInput, DenyResponse } from "../shared/index.js";
export type LangChainToolLike<TInput = string, TOutput = string> = {
    name: string;
    description: string;
    call(input: TInput): Promise<TOutput>;
};
export type WrappedToolResult<TOutput> = TOutput | DenyResponse;
export declare function wrapToolWithBehalfID<TInput = string, TOutput = string>(config: IntegrationConfig, tool: LangChainToolLike<TInput, TOutput>, verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>): LangChainToolLike<TInput, WrappedToolResult<TOutput>>;
export declare function wrapToolsWithBehalfID<TInput = string, TOutput = string>(config: IntegrationConfig, tools: LangChainToolLike<TInput, TOutput>[], verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>): LangChainToolLike<TInput, WrappedToolResult<TOutput>>[];
