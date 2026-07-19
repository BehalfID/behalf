/**
 * Normalize a raw MCP host config object (e.g. parsed `.mcp.json`) into
 * {@link McpAuditConfiguration}.
 *
 * This helper is read-only — it does not read or write files.
 */
export function normalizeMcpConfig(raw, options = {}) {
    if (raw === null || raw === undefined) {
        return {
            servers: [],
            sourcePath: options.sourcePath,
            trustedServers: options.trustedServers,
            failOpenDefault: options.failOpenDefault,
        };
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return {
            servers: [
                {
                    name: "",
                    configPath: options.sourcePath,
                    raw: { invalidRoot: true },
                },
            ],
            sourcePath: options.sourcePath,
            trustedServers: options.trustedServers,
            failOpenDefault: options.failOpenDefault,
        };
    }
    const root = raw;
    const mcpServers = root.mcpServers;
    if (mcpServers === undefined) {
        return {
            servers: [],
            sourcePath: options.sourcePath,
            trustedServers: options.trustedServers,
            failOpenDefault: options.failOpenDefault ??
                (typeof root.failOpenDefault === "boolean"
                    ? root.failOpenDefault
                    : undefined),
        };
    }
    if (typeof mcpServers !== "object" || mcpServers === null || Array.isArray(mcpServers)) {
        return {
            servers: [
                {
                    name: "",
                    configPath: options.sourcePath,
                    raw: { malformedMcpServers: true },
                },
            ],
            sourcePath: options.sourcePath,
            trustedServers: options.trustedServers,
            failOpenDefault: options.failOpenDefault,
        };
    }
    const servers = [];
    for (const [name, value] of Object.entries(mcpServers)) {
        servers.push(normalizeServer(name, value, options.sourcePath));
    }
    return {
        servers,
        sourcePath: options.sourcePath,
        trustedServers: options.trustedServers,
        failOpenDefault: options.failOpenDefault ??
            (typeof root.failOpenDefault === "boolean" ? root.failOpenDefault : undefined),
    };
}
function normalizeServer(name, value, sourcePath) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {
            name,
            configPath: sourcePath,
            raw: { malformed: true },
        };
    }
    const entry = value;
    const env = typeof entry.env === "object" && entry.env !== null && !Array.isArray(entry.env)
        ? Object.fromEntries(Object.entries(entry.env).map(([k, v]) => [
            k,
            typeof v === "string" ? v : String(v),
        ]))
        : undefined;
    const args = Array.isArray(entry.args)
        ? entry.args.map((a) => String(a))
        : entry.args !== undefined
            ? entry.args
            : undefined;
    return {
        name,
        configPath: sourcePath,
        type: typeof entry.type === "string" ? entry.type : undefined,
        command: typeof entry.command === "string" ? entry.command : undefined,
        args,
        url: typeof entry.url === "string" ? entry.url : undefined,
        env,
        trusted: typeof entry.trusted === "boolean" ? entry.trusted : undefined,
        approved: typeof entry.approved === "boolean" ? entry.approved : undefined,
        failOpen: typeof entry.failOpen === "boolean" ? entry.failOpen : undefined,
        raw: entry,
    };
}
