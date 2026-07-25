import type {
  McpTransport,
  ToolExecutionResult,
} from "./types.js";

export type ArgumentTransform = (
  args: unknown,
  server: string,
  tool: string
) => unknown;

export type ToolProxyOptions = {
  transport: McpTransport;
  /** Arguments are never modified unless this is provided. */
  transformArguments?: ArgumentTransform;
};

/**
 * Proxies an authorized MCP tool call to the downstream server.
 * Callers must only invoke this after verify() has allowed the action.
 */
export class ToolProxy {
  private readonly transport: McpTransport;
  private readonly transformArguments?: ArgumentTransform;

  constructor(options: ToolProxyOptions) {
    this.transport = options.transport;
    this.transformArguments = options.transformArguments;
  }

  async execute(
    server: string,
    tool: string,
    args?: unknown
  ): Promise<ToolExecutionResult> {
    const started = Date.now();
    const callArgs = this.transformArguments
      ? this.transformArguments(args, server, tool)
      : args;

    try {
      const result = await this.transport.callTool(server, tool, callArgs);
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
