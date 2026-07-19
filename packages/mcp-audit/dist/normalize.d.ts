import type { McpAuditConfiguration } from "./types.js";
/**
 * Normalize a raw MCP host config object (e.g. parsed `.mcp.json`) into
 * {@link McpAuditConfiguration}.
 *
 * This helper is read-only — it does not read or write files.
 */
export declare function normalizeMcpConfig(raw: unknown, options?: {
    sourcePath?: string;
    trustedServers?: string[];
    failOpenDefault?: boolean;
}): McpAuditConfiguration;
