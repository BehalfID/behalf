import type { IntegrationConfig, VerifyInput, GatedResult } from "../shared/index.js";
export type AnthropicToolUseBlock = {
    id: string;
    name: string;
    input: Record<string, unknown>;
};
export type AnthropicToolResult<T> = {
    tool_use_id: string;
} & GatedResult<T>;
export declare function checkToolUse<T>(config: IntegrationConfig, toolUseBlock: AnthropicToolUseBlock, execute: () => Promise<T>, verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>): Promise<AnthropicToolResult<T>>;
export declare function buildDeniedToolResult(toolUseId: string, reason: string): {
    type: "tool_result";
    tool_use_id: string;
    content: string;
    is_error: boolean;
};
