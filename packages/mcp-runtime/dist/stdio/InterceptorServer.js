import { randomUUID } from "node:crypto";
import { createVerifyPollingApprovalWaiter } from "../approvalWaiter.js";
import { McpRuntime } from "../McpRuntime.js";
import { createHttpVerifyClient } from "../httpVerifyClient.js";
import { DownstreamMcpClient, decodeToolName, encodeToolName, } from "./DownstreamClient.js";
import { createJsonRpcLineReader, writeError, writeResult, } from "./jsonRpc.js";
/**
 * Stdio MCP server that fronts a downstream MCP process.
 * Every tools/call is authorized via {@link McpRuntime} before proxying.
 */
export class InterceptorServer {
    config;
    stdout;
    stdin;
    runtime = null;
    downstream = null;
    started = false;
    constructor(options) {
        this.config = options.config;
        this.stdin = options.stdin ?? process.stdin;
        this.stdout = options.stdout ?? process.stdout;
        this.runtime = options.runtime ?? null;
        this.downstream =
            options.downstream === undefined ? null : options.downstream;
    }
    async start() {
        if (this.started)
            return;
        this.started = true;
        if (!this.downstream && this.config.downstream) {
            this.downstream = new DownstreamMcpClient({
                serverName: this.config.downstream.serverName,
                command: this.config.downstream.command,
                args: this.config.downstream.args,
                env: this.config.downstream.env,
            });
            await this.downstream.start();
            await this.downstream.listTools();
        }
        if (!this.runtime) {
            if (!this.downstream) {
                // No downstream: still speak MCP, but expose zero tools (fail-safe).
                this.runtime = null;
            }
            else {
                const verifyClient = createHttpVerifyClient({
                    verifyUrl: this.config.verifyUrl,
                    apiKey: this.config.apiKey,
                });
                const approvalPoll = process.env.BEHALFID_APPROVAL_POLL?.trim() === "0"
                    ? undefined
                    : createVerifyPollingApprovalWaiter({
                        verifyClient,
                        agentId: this.config.agentId,
                        pollIntervalMs: parsePositiveInt(process.env.BEHALFID_APPROVAL_POLL_MS, 2_000),
                        timeoutMs: parsePositiveInt(process.env.BEHALFID_APPROVAL_TIMEOUT_MS, 300_000),
                    });
                this.runtime = new McpRuntime({
                    agentId: this.config.agentId,
                    verifyTimeoutMs: this.config.verifyTimeoutMs,
                    verifyClient,
                    transport: this.downstream,
                    ...(approvalPoll ? { waitForApproval: approvalPoll } : {}),
                });
            }
        }
        createJsonRpcLineReader(this.stdin, (msg) => this.handleMessage(msg));
        // Keep process alive on stdio
        if (this.stdin === process.stdin) {
            process.stdin.resume();
        }
    }
    async stop() {
        await this.downstream?.stop();
    }
    async handleMessage(req) {
        // Notifications — no response
        if (req.id === undefined || req.id === null) {
            return;
        }
        try {
            switch (req.method) {
                case "initialize":
                    writeResult(this.stdout, req.id, {
                        protocolVersion: "2024-11-05",
                        capabilities: { tools: {} },
                        serverInfo: {
                            name: "behalfid-mcp-runtime",
                            version: "0.1.0",
                        },
                    });
                    break;
                case "ping":
                    writeResult(this.stdout, req.id, {});
                    break;
                case "tools/list": {
                    const tools = await this.listExposedTools();
                    writeResult(this.stdout, req.id, { tools });
                    break;
                }
                case "tools/call": {
                    const params = req.params;
                    const result = await this.callTool(params?.name, params?.arguments ?? {});
                    writeResult(this.stdout, req.id, result);
                    break;
                }
                default:
                    writeError(this.stdout, req.id, -32601, `Method not found: ${req.method}`);
            }
        }
        catch (err) {
            writeError(this.stdout, req.id, -32603, err instanceof Error ? err.message : "Internal error");
        }
    }
    async listExposedTools() {
        if (!this.downstream)
            return [];
        const tools = this.downstream.getCachedTools().length > 0
            ? this.downstream.getCachedTools()
            : await this.downstream.listTools();
        return tools.map((t) => ({
            name: encodeToolName(this.downstream.serverName, t.name),
            description: t.description ??
                `Proxied MCP tool (authorized by BehalfID). Downstream: ${this.downstream.serverName}/${t.name}`,
            inputSchema: t.inputSchema ?? { type: "object", properties: {} },
        }));
    }
    async callTool(toolName, args) {
        if (!toolName) {
            return textError("Missing tool name");
        }
        if (!this.downstream || !this.runtime) {
            return textError("Interceptor has no downstream MCP server configured (set BEHALFID_DOWNSTREAM_COMMAND)");
        }
        const decoded = decodeToolName(toolName, this.downstream.serverName);
        if (!decoded) {
            return textError(`Unknown or malformed tool name: ${toolName}`);
        }
        const invocation = {
            requestId: randomUUID(),
            sessionId: process.env.BEHALFID_SESSION_ID?.trim() || randomUUID(),
            userId: process.env.BEHALFID_USER_ID?.trim() || this.config.agentId,
            agentId: this.config.agentId,
            provider: this.config.provider,
            server: decoded.server,
            tool: decoded.tool,
            arguments: args,
            metadata: {
                cwd: process.env.PWD || process.cwd(),
            },
        };
        const result = await this.runtime.execute(invocation);
        return mapExecuteResultToMcp(result, this.config.baseUrl);
    }
}
function mapExecuteResultToMcp(result, baseUrl) {
    if (result.outcome !== "allowed") {
        return {
            content: [
                {
                    type: "text",
                    text: formatDenial(result, baseUrl),
                },
            ],
            isError: true,
        };
    }
    const execution = result.execution;
    if (!execution) {
        return textError("Authorized but no execution result");
    }
    if (!execution.ok) {
        return {
            content: [
                {
                    type: "text",
                    text: execution.error ?? "Downstream tool failed",
                },
            ],
            isError: true,
        };
    }
    // Downstream MCP tools/call already returns { content, isError? }
    if (execution.data &&
        typeof execution.data === "object" &&
        Array.isArray(execution.data.content)) {
        return execution.data;
    }
    return {
        content: [
            {
                type: "text",
                text: formatSuccessPayload(execution.data),
            },
        ],
    };
}
function formatSuccessPayload(data) {
    if (data && typeof data === "object" && "content" in data) {
        // Pass through MCP tool result shape when downstream already returned it
        try {
            return JSON.stringify(data, null, 2);
        }
        catch {
            return String(data);
        }
    }
    try {
        return JSON.stringify(data ?? null, null, 2);
    }
    catch {
        return String(data);
    }
}
function formatDenial(result, baseUrl) {
    const decision = result.decision;
    const approvalUrl = `${baseUrl.replace(/\/$/, "")}/dashboard/approvals`;
    if (decision?.approvalRequired) {
        const lines = [
            "APPROVAL REQUIRED — tool was not executed.",
            "",
            `Server/tool: ${result.invocation.server}/${result.invocation.tool}`,
            `Request ID:  ${decision.requestId}`,
            ...(decision.approvalId ? [`Approval ID: ${decision.approvalId}`] : []),
            "",
            `Approve at: ${approvalUrl}`,
            "",
            "After approval, retry the same tool call.",
        ];
        return lines.join("\n");
    }
    return [
        "DENIED — tool was not executed.",
        "",
        `Outcome: ${result.outcome}`,
        `Reason:  ${result.error ?? decision?.reason ?? "blocked by BehalfID"}`,
        `Server/tool: ${result.invocation.server}/${result.invocation.tool}`,
    ].join("\n");
}
function textError(message) {
    return {
        content: [{ type: "text", text: message }],
        isError: true,
    };
}
function parsePositiveInt(raw, fallback) {
    if (!raw)
        return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
