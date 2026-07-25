import { basename, normalize } from "node:path";

/** Supported on-disk MCP configuration formats. */
export type McpConfigFormat = "mcpServers-json" | "vscode-json" | "codex-toml";

/**
 * Infer configuration format from the file path.
 * Content-based overrides can refine this after a successful read.
 */
export function detectMcpConfigFormat(configPath: string): McpConfigFormat {
  const normalized = normalize(configPath).replace(/\\/g, "/").toLowerCase();
  const fileName = basename(normalized);

  if (fileName.endsWith(".toml") || normalized.includes("/.codex/")) {
    return "codex-toml";
  }

  if (normalized.includes("/.vscode/") && fileName === "mcp.json") {
    return "vscode-json";
  }

  // VS Code user-level mcp.json under .../Code/User/mcp.json
  if (normalized.includes("/user/mcp.json") && normalized.includes("/code/")) {
    return "vscode-json";
  }

  return "mcpServers-json";
}

/**
 * Refine format using document shape when path detection is ambiguous.
 * Prefer explicit keys already present in the file.
 */
export function refineMcpConfigFormat(
  pathFormat: McpConfigFormat,
  document: Record<string, unknown>,
): McpConfigFormat {
  if (pathFormat === "codex-toml") {
    return "codex-toml";
  }

  const hasServers = isRecord(document.servers);
  const hasMcpServers = isRecord(document.mcpServers);

  if (hasServers && !hasMcpServers) {
    return "vscode-json";
  }
  if (hasMcpServers && !hasServers) {
    return "mcpServers-json";
  }

  return pathFormat;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
