import type { McpConfiguration, McpServerEntry } from "../types/index.js";
import type { McpConfigFormat } from "./format.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toServerEntry(value: unknown): McpServerEntry {
  if (!isRecord(value)) {
    return {};
  }
  return { ...value } as McpServerEntry;
}

/** Read the server map for the active format without mutating the document. */
export function getServerMap(
  config: McpConfiguration,
  format: McpConfigFormat,
): Record<string, McpServerEntry> {
  if (format === "vscode-json") {
    const servers = config.servers;
    if (!isRecord(servers)) {
      return {};
    }
    const result: Record<string, McpServerEntry> = {};
    for (const [name, entry] of Object.entries(servers)) {
      result[name] = toServerEntry(entry);
    }
    return result;
  }

  if (format === "codex-toml") {
    const mcpServers = config.mcp_servers ?? config.mcpServers;
    if (!isRecord(mcpServers)) {
      return {};
    }
    const result: Record<string, McpServerEntry> = {};
    for (const [name, entry] of Object.entries(mcpServers)) {
      result[name] = toServerEntry(entry);
    }
    return result;
  }

  const mcpServers = config.mcpServers;
  if (!isRecord(mcpServers)) {
    return {};
  }
  const result: Record<string, McpServerEntry> = {};
  for (const [name, entry] of Object.entries(mcpServers)) {
    result[name] = toServerEntry(entry);
  }
  return result;
}

/**
 * Return a new configuration with the server map replaced for the given format.
 * Preserves unrelated top-level keys.
 */
export function setServerMap(
  config: McpConfiguration,
  format: McpConfigFormat,
  servers: Record<string, McpServerEntry>,
): McpConfiguration {
  const next: McpConfiguration = { ...config };

  if (format === "vscode-json") {
    next.servers = servers;
    return next;
  }

  if (format === "codex-toml") {
    next.mcp_servers = servers;
    // Avoid writing a duplicate JSON-style key into TOML documents.
    delete next.mcpServers;
    return next;
  }

  next.mcpServers = servers;
  return next;
}

export function upsertServerEntry(
  config: McpConfiguration,
  format: McpConfigFormat,
  serverName: string,
  entry: McpServerEntry,
): McpConfiguration {
  const servers = { ...getServerMap(config, format), [serverName]: entry };
  return setServerMap(config, format, servers);
}

export function removeServerEntry(
  config: McpConfiguration,
  format: McpConfigFormat,
  serverName: string,
): McpConfiguration {
  const servers = { ...getServerMap(config, format) };
  delete servers[serverName];
  return setServerMap(config, format, servers);
}
