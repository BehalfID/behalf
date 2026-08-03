#!/usr/bin/env node
/**
 * Local MCP inventory + wrap detection for the CLI.
 * Keep markers aligned with @behalfid/install wrap.ts.
 */

export const WRAPPED_MARKER_ENV = "BEHALFID_DOWNSTREAM_COMMAND";

export type McpServerEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: string;
  [key: string]: unknown;
};

export type WrapStatus = "wrapped" | "wrappable" | "url-only" | "advisory-behalfid" | "unknown";

export function isWrappableServerEntry(entry: McpServerEntry): boolean {
  return typeof entry.command === "string" && entry.command.trim().length > 0;
}

export function isAlreadyWrapped(entry: McpServerEntry): boolean {
  const env = entry.env;
  if (env && typeof env[WRAPPED_MARKER_ENV] === "string" && env[WRAPPED_MARKER_ENV]) {
    return true;
  }
  const args = entry.args ?? [];
  return args.some(
    (arg) =>
      typeof arg === "string" &&
      (arg.includes("@behalfid/mcp-runtime") || arg === "behalfid-mcp-runtime")
  );
}

export function classifyWrapStatus(name: string, entry: McpServerEntry): WrapStatus {
  if (name === "behalfid" || name === "behalf") return "advisory-behalfid";
  if (isAlreadyWrapped(entry)) return "wrapped";
  if (isWrappableServerEntry(entry)) return "wrappable";
  if (typeof entry.url === "string" && entry.url.trim()) return "url-only";
  return "unknown";
}

export function extractServerMap(raw: unknown): Record<string, McpServerEntry> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const root = raw as Record<string, unknown>;
  const map =
    (root.mcpServers as Record<string, unknown> | undefined) ??
    (root.servers as Record<string, unknown> | undefined) ??
    {};
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  const out: Record<string, McpServerEntry> = {};
  for (const [name, entry] of Object.entries(map)) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      out[name] = entry as McpServerEntry;
    }
  }
  return out;
}

export type InventoryResult = {
  sourcePath: string;
  servers: Array<{
    name: string;
    wrapStatus: WrapStatus;
    command?: string;
    url?: string;
  }>;
  wrappedCount: number;
  wrappableCount: number;
  urlOnlyCount: number;
  hasAdvisoryBehalfid: boolean;
};

export function buildLocalInventory(raw: unknown, sourcePath: string): InventoryResult {
  const map = extractServerMap(raw);
  const servers = Object.entries(map).map(([name, entry]) => ({
    name,
    wrapStatus: classifyWrapStatus(name, entry),
    command: entry.command,
    url: entry.url,
  }));
  return {
    sourcePath,
    servers,
    wrappedCount: servers.filter((s) => s.wrapStatus === "wrapped").length,
    wrappableCount: servers.filter((s) => s.wrapStatus === "wrappable").length,
    urlOnlyCount: servers.filter((s) => s.wrapStatus === "url-only").length,
    hasAdvisoryBehalfid: servers.some((s) => s.wrapStatus === "advisory-behalfid"),
  };
}

export function buildWrapCommand(serverNames?: string[]): string {
  const parts = ["npx", "-y", "@behalfid/install", "--wrap"];
  if (serverNames?.length) {
    parts.push("--wrap-servers", serverNames.join(","));
  }
  return parts.join(" ");
}
