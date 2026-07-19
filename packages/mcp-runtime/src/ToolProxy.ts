import type {
  McpTransport,
  RuntimeDecision,
  ToolExecutionResult,
  ToolInvocation,
} from "./types.js";

export type ArgumentTransform = (
  args: Record<string, unknown> | undefined,
  invocation: ToolInvocation,
  decision: RuntimeDecision
) => Record<string, unknown> | undefined;

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
export class ToolProxy {
  private readonly transport: McpTransport;
  private readonly transformArguments?: ArgumentTransform;

  constructor(options: ToolProxyOptions) {
    this.transport = options.transport;
    this.transformArguments = options.transformArguments;
  }

  async execute(
    invocation: ToolInvocation,
    decision: RuntimeDecision
  ): Promise<ToolExecutionResult> {
    if (!decision.allowed) {
      return {
        ok: false,
        error: `Refused: decision is ${decision.type}`,
        durationMs: 0,
      };
    }

    const started = Date.now();
    const args = this.transformArguments
      ? this.transformArguments(invocation.arguments, invocation, decision)
      : invocation.arguments;

    try {
      const result = await this.transport.callTool(
        invocation.server,
        invocation.tool,
        args
      );
      const durationMs = Date.now() - started;
      if (result.error) {
        return { ok: false, error: result.error, durationMs };
      }
      return { ok: true, data: result.data, durationMs };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      };
    }
  }
}
