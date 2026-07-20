import type { AiClientId, DetectedClient, OperationWarning } from "../types/index.js";
import { createInstallerError, InstallerException } from "./errors.js";

const KNOWN_CLIENT_IDS = new Set<AiClientId>([
  "cursor",
  "claude-code",
  "claude-desktop",
  "codex",
  "vscode",
  "windsurf",
]);

/**
 * Parse a comma-separated client list from CLI input into validated ids.
 */
export function parseClientIdList(value: string | undefined): AiClientId[] | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const ids: AiClientId[] = [];
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    if (!KNOWN_CLIENT_IDS.has(trimmed as AiClientId)) {
      throw new InstallerException({
        code: "DETECTION_FAILED",
        message: `Unknown AI client id: ${trimmed}`,
        remediation:
          "Use one of: cursor, claude-code, claude-desktop, codex, vscode, windsurf",
        details: { clientId: trimmed },
      });
    }
    ids.push(trimmed as AiClientId);
  }

  return ids.length > 0 ? ids : undefined;
}

/**
 * Select installed clients that have an MCP config path, optionally filtered by id.
 */
export function selectTargetClients(
  clients: DetectedClient[],
  filter?: AiClientId[],
): { targets: DetectedClient[]; warnings: OperationWarning[] } {
  const warnings: OperationWarning[] = [];
  const filterSet = filter !== undefined ? new Set(filter) : undefined;

  if (filterSet) {
    for (const requested of filterSet) {
      const match = clients.find((client) => client.id === requested);
      if (!match) {
        warnings.push({
          code: "CLIENT_NOT_DETECTED",
          message: `Requested client "${requested}" was not detected on this machine.`,
          details: { clientId: requested },
        });
        continue;
      }
      if (!match.installed) {
        warnings.push({
          code: "CLIENT_NOT_INSTALLED",
          message: `Requested client "${requested}" was detected but does not appear to be installed.`,
          details: { clientId: requested },
        });
      }
    }
  }

  const targets: DetectedClient[] = [];

  for (const client of clients) {
    if (filterSet && !filterSet.has(client.id)) {
      continue;
    }
    if (!client.installed) {
      continue;
    }

    const mcpConfigPath = client.configPaths.mcpConfigPath;
    if (!mcpConfigPath) {
      warnings.push({
        code: "CLIENT_MISSING_MCP_PATH",
        message: `Client "${client.id}" is installed but no MCP configuration path was found.`,
        details: { clientId: client.id },
      });
      continue;
    }

    targets.push(client);
  }

  return { targets, warnings };
}

export function requireTargets(targets: DetectedClient[]): void {
  if (targets.length === 0) {
    throw new InstallerException({
      code: "DETECTION_FAILED",
      message: "No supported AI clients with MCP configuration paths were found.",
      remediation:
        "Install a supported AI client (Cursor, Claude Code, Claude Desktop, Codex, VS Code, or Windsurf), or pass --clients explicitly after the client is available.",
    });
  }
}

/** Re-export for callers that need a structured error without throwing. */
export { createInstallerError };
