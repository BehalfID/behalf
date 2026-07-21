import { randomUUID } from "node:crypto";
import type { Readable, Writable } from "node:stream";
import { createVerifyPollingApprovalWaiter } from "../approvalWaiter.js";
import { McpRuntime } from "../McpRuntime.js";
import type { InterceptorConfig } from "../config.js";
import { createHttpVerifyClient } from "../httpVerifyClient.js";
import type {
  McpInvocation,
  RuntimeExecuteResult,
  VerifyDecision,
} from "../types.js";
import {
  DownstreamMcpClient,
  decodeToolName,
  encodeToolName,
  type DownstreamTool,
} from "./DownstreamClient.js";
import {
  createJsonRpcLineReader,
  writeError,
  writeResult,
  type JsonRpcRequest,
} from "./jsonRpc.js";

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
export class InterceptorServer {
  private readonly config: InterceptorConfig;
  private readonly stdout: Writable;
  private readonly stdin: Readable;
  private runtime: McpRuntime | null = null;
  private downstream: DownstreamMcpClient | null = null;
  private started = false;

  constructor(options: InterceptorServerOptions) {
    this.config = options.config;
    this.stdin = options.stdin ?? (process.stdin as unknown as Readable);
    this.stdout = options.stdout ?? process.stdout;
    this.runtime = options.runtime ?? null;
    this.downstream =
      options.downstream === undefined ? null : options.downstream;
  }

  async start(): Promise<void> {
    if (this.started) return;
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
      } else {
        const verifyClient = createHttpVerifyClient({
          verifyUrl: this.config.verifyUrl,
          apiKey: this.config.apiKey,
        });
        const approvalPoll =
          process.env.BEHALFID_APPROVAL_POLL?.trim() === "0"
            ? undefined
            : createVerifyPollingApprovalWaiter({
                verifyClient,
                agentId: this.config.agentId,
                pollIntervalMs: parsePositiveInt(
                  process.env.BEHALFID_APPROVAL_POLL_MS,
                  2_000
                ),
                timeoutMs: parsePositiveInt(
                  process.env.BEHALFID_APPROVAL_TIMEOUT_MS,
                  300_000
                ),
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
    if (this.stdin === (process.stdin as unknown as Readable)) {
      process.stdin.resume();
    }
  }

  async stop(): Promise<void> {
    await this.downstream?.stop();
  }

  private async handleMessage(req: JsonRpcRequest): Promise<void> {
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
          const params = req.params as
            | { name?: string; arguments?: Record<string, unknown> }
            | undefined;
          const result = await this.callTool(
            params?.name,
            params?.arguments ?? {}
          );
          writeResult(this.stdout, req.id, result);
          break;
        }

        default:
          writeError(this.stdout, req.id, -32601, `Method not found: ${req.method}`);
      }
    } catch (err) {
      writeError(
        this.stdout,
        req.id,
        -32603,
        err instanceof Error ? err.message : "Internal error"
      );
    }
  }

  private async listExposedTools(): Promise<
    Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }>
  > {
    if (!this.downstream) return [];
    const tools =
      this.downstream.getCachedTools().length > 0
        ? this.downstream.getCachedTools()
        : await this.downstream.listTools();

    return tools.map((t: DownstreamTool) => ({
      name: encodeToolName(this.downstream!.serverName, t.name),
      description:
        t.description ??
        `Proxied MCP tool (authorized by BehalfID). Downstream: ${this.downstream!.serverName}/${t.name}`,
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    }));
  }

  private async callTool(
    toolName: string | undefined,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    if (!toolName) {
      return textError("Missing tool name");
    }
    if (!this.downstream || !this.runtime) {
      return textError(
        "Interceptor has no downstream MCP server configured (set BEHALFID_DOWNSTREAM_COMMAND)"
      );
    }

    const decoded = decodeToolName(toolName, this.downstream.serverName);
    if (!decoded) {
      return textError(`Unknown or malformed tool name: ${toolName}`);
    }

    const invocation: McpInvocation = {
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

function mapExecuteResultToMcp(
  result: RuntimeExecuteResult,
  baseUrl: string
): { content: Array<{ type: string; text: string }>; isError?: boolean } {
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
  if (
    execution.data &&
    typeof execution.data === "object" &&
    Array.isArray((execution.data as { content?: unknown }).content)
  ) {
    return execution.data as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
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

function formatSuccessPayload(data: unknown): string {
  if (data && typeof data === "object" && "content" in (data as object)) {
    // Pass through MCP tool result shape when downstream already returned it
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
  try {
    return JSON.stringify(data ?? null, null, 2);
  } catch {
    return String(data);
  }
}

function formatDenial(result: RuntimeExecuteResult, baseUrl: string): string {
  const decision: VerifyDecision | undefined = result.decision;
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

function textError(message: string): {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
} {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
