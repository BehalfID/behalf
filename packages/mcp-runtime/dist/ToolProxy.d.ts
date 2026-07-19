import type { McpTransport, ToolExecutionResult } from "./types.js";
export type ArgumentTransform = (args: unknown, server: string, tool: string) => unknown;
export type ToolProxyOptions = {
    transport: McpTransport;
    /** Arguments are never modified unless this is provided. */
    transformArguments?: ArgumentTransform;
};
/**
 * Proxies an authorized MCP tool call to the downstream server.
 * Callers must only invoke this after verify() has allowed the action.
 */
export declare class ToolProxy {
    private readonly transport;
    private readonly transformArguments?;
    constructor(options: ToolProxyOptions);
    execute(server: string, tool: string, args?: unknown): Promise<ToolExecutionResult>;
}
