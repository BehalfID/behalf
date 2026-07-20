import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import type { McpConfiguration, McpServerEntry, RuntimeRegistrationInput } from "../types/index.js";
import type { McpConfigFormat } from "./format.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse raw file contents into an MCP configuration document. */
export function parseMcpConfigContents(
  raw: string,
  format: McpConfigFormat,
): McpConfiguration {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  if (format === "codex-toml") {
    const parsed = parseToml(trimmed);
    if (!isRecord(parsed)) {
      throw new Error("TOML MCP configuration must parse to an object");
    }
    return parsed as McpConfiguration;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`MCP configuration is not valid JSON: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("MCP configuration must be a JSON object");
  }

  return parsed as McpConfiguration;
}

/** Serialize an MCP configuration document for the target format. */
export function serializeMcpConfig(
  config: McpConfiguration,
  format: McpConfigFormat,
): string {
  if (format === "codex-toml") {
    return `${stringifyToml(config)}\n`;
  }

  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Build the on-disk server entry for a runtime registration. */
export function runtimeToServerEntry(
  runtime: RuntimeRegistrationInput,
  format: McpConfigFormat,
): McpServerEntry {
  const entry: McpServerEntry = {
    command: runtime.command,
    args: [...runtime.args],
  };

  if (runtime.env !== undefined) {
    entry.env = { ...runtime.env };
  }

  // VS Code Copilot often expects an explicit type for stdio servers.
  if (format === "vscode-json") {
    entry.type = "stdio";
  }

  return entry;
}
