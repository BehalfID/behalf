import type { McpTransport } from "../types.js";
export type DownstreamTool = {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
};
export type DownstreamClientOptions = {
    serverName: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    /** Extra env merged over process.env for the child. */
    inheritEnv?: boolean;
};
/**
 * Spawns a child MCP server and speaks JSON-RPC over its stdio.
 * Implements {@link McpTransport} for ToolProxy / McpRuntime.
 */
export declare class DownstreamMcpClient implements McpTransport {
    readonly serverName: string;
    private child;
    private rpc;
    private toolsCache;
    private readonly options;
    constructor(options: DownstreamClientOptions);
    start(): Promise<void>;
    listTools(): Promise<DownstreamTool[]>;
    getCachedTools(): DownstreamTool[];
    callTool(_server: string, tool: string, args?: unknown): Promise<{
        data?: unknown;
        error?: string;
    }>;
    stop(): Promise<void>;
    private ensureStarted;
}
/** Encode a namespaced tool name exposed to the agent. */
export declare function encodeToolName(serverName: string, toolName: string): string;
/** Decode a namespaced tool name; returns null if malformed. */
export declare function decodeToolName(encoded: string, expectedServer?: string): {
    server: string;
    tool: string;
} | null;
