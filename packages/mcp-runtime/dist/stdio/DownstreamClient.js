import { spawn } from "node:child_process";
import { JsonRpcStdioClient } from "./jsonRpc.js";
/**
 * Spawns a child MCP server and speaks JSON-RPC over its stdio.
 * Implements {@link McpTransport} for ToolProxy / McpRuntime.
 */
export class DownstreamMcpClient {
    serverName;
    child = null;
    rpc = null;
    toolsCache = null;
    options;
    constructor(options) {
        this.serverName = options.serverName;
        this.options = options;
    }
    async start() {
        if (this.rpc)
            return;
        const childEnv = {
            ...(this.options.inheritEnv === false ? {} : process.env),
            ...this.options.env,
        };
        const child = spawn(this.options.command, this.options.args ?? [], {
            stdio: ["pipe", "pipe", "pipe"],
            env: childEnv,
            shell: false,
        });
        this.child = child;
        this.rpc = new JsonRpcStdioClient(child.stdin, child.stdout);
        child.stderr.on("data", () => {
            // Swallow child stderr to avoid corrupting parent MCP stdout framing.
        });
        child.on("exit", () => {
            this.rpc?.close();
            this.rpc = null;
            this.child = null;
            this.toolsCache = null;
        });
        await this.rpc.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "behalfid-mcp-runtime", version: "0.1.0" },
        });
        this.rpc.notify("notifications/initialized");
    }
    async listTools() {
        await this.ensureStarted();
        const result = (await this.rpc.request("tools/list", {}));
        const tools = Array.isArray(result?.tools) ? result.tools : [];
        this.toolsCache = tools;
        return tools;
    }
    getCachedTools() {
        return this.toolsCache ?? [];
    }
    async callTool(_server, tool, args) {
        try {
            await this.ensureStarted();
            const result = await this.rpc.request("tools/call", {
                name: tool,
                arguments: args && typeof args === "object" && !Array.isArray(args)
                    ? args
                    : {},
            });
            return { data: result };
        }
        catch (err) {
            return {
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    async stop() {
        this.rpc?.close();
        this.rpc = null;
        if (this.child && !this.child.killed) {
            this.child.kill();
        }
        this.child = null;
        this.toolsCache = null;
    }
    async ensureStarted() {
        if (!this.rpc) {
            await this.start();
        }
    }
}
/** Encode a namespaced tool name exposed to the agent. */
export function encodeToolName(serverName, toolName) {
    return `${serverName}__${toolName}`;
}
/** Decode a namespaced tool name; returns null if malformed. */
export function decodeToolName(encoded, expectedServer) {
    const idx = encoded.indexOf("__");
    if (idx <= 0 || idx === encoded.length - 2)
        return null;
    const server = encoded.slice(0, idx);
    const tool = encoded.slice(idx + 2);
    if (!tool)
        return null;
    if (expectedServer && server !== expectedServer)
        return null;
    return { server, tool };
}
