import type { McpTransport, RuntimeDecision, ToolExecutionResult, ToolInvocation } from "./types.js";
export type ArgumentTransform = (args: Record<string, unknown> | undefined, invocation: ToolInvocation, decision: RuntimeDecision) => Record<string, unknown> | undefined;
export type ToolProxyOptions = {
    transport: McpTransport;
    /**
     * Optional argument transform. Arguments are never modified unless this
     * (or an explicit policy-driven transform) is provided.
     */
    transformArguments?: ArgumentTransform;
};
/**
 * Tool Proxy — AI → BehalfID Proxy → MCP Server.
 *
 * Refuses to execute unless the decision allows it. Never mutates arguments
 * unless an explicit transform is configured.
 */
export declare class ToolProxy {
    private readonly transport;
    private readonly transformArguments?;
    constructor(options: ToolProxyOptions);
    execute(invocation: ToolInvocation, decision: RuntimeDecision): Promise<ToolExecutionResult>;
}
