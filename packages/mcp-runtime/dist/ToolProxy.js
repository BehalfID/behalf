/**
 * Proxies an authorized MCP tool call to the downstream server.
 * Callers must only invoke this after verify() has allowed the action.
 */
export class ToolProxy {
    transport;
    transformArguments;
    constructor(options) {
        this.transport = options.transport;
        this.transformArguments = options.transformArguments;
    }
    async execute(server, tool, args) {
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
        }
        catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - started,
            };
        }
    }
}
