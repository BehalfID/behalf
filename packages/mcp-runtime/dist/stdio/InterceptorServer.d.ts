import type { Readable, Writable } from "node:stream";
import { McpRuntime } from "../McpRuntime.js";
import type { InterceptorConfig } from "../config.js";
import { DownstreamMcpClient } from "./DownstreamClient.js";
export type InterceptorServerOptions = {
    config: InterceptorConfig;
    /** Override streams for tests. */
    stdin?: Readable;
    stdout?: Writable;
    /** Injected runtime (tests). */
    runtime?: McpRuntime;
    /** Injected downstream (tests). */
    downstream?: DownstreamMcpClient | null;
};
/**
 * Stdio MCP server that fronts a downstream MCP process.
 * Every tools/call is authorized via {@link McpRuntime} before proxying.
 */
export declare class InterceptorServer {
    private readonly config;
    private readonly stdout;
    private readonly stdin;
    private runtime;
    private downstream;
    private started;
    constructor(options: InterceptorServerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    private handleMessage;
    private listExposedTools;
    private callTool;
}
