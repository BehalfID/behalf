/**
 * Tool Proxy — AI → BehalfID Proxy → MCP Server.
 *
 * Refuses to execute unless the decision allows it. Never mutates arguments
 * unless an explicit transform is configured.
 */
export class ToolProxy {
    transport;
    transformArguments;
    constructor(options) {
        this.transport = options.transport;
        this.transformArguments = options.transformArguments;
    }
    async execute(invocation, decision) {
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
            const result = await this.transport.callTool(invocation.server, invocation.tool, args);
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
