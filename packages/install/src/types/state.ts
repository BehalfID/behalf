import type { AiClientId } from "./primitives.js";

/** Record of a client that has been configured by the installer. */
export interface ConfiguredClientRecord {
  clientId: AiClientId;
  /** Absolute path to the MCP configuration file that was modified. */
  mcpConfigPath: string;
  /** ISO-8601 timestamp when the client was configured. */
  configuredAt: string;
}

/** Record of a runtime registered by the installer. */
export interface RegisteredRuntimeRecord {
  id: string;
  packageName: string;
  version: string;
  /** MCP server name used in client configuration. */
  serverName: string;
  /** ISO-8601 timestamp when the runtime was registered. */
  registeredAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persistent installation state written by the installer.
 * Used for upgrades, diagnostics, uninstall, and idempotent re-installs.
 */
export interface InstallationState {
  /** Schema version for forward-compatible migrations. */
  schemaVersion: 1;
  /** Installed BehalfID package/runtime version. */
  installedVersion: string;
  /** Version of the installer that last wrote this state. */
  installerVersion: string;
  /** ISO-8601 timestamp of the original installation. */
  installedAt: string;
  /** ISO-8601 timestamp of the most recent state update. */
  updatedAt: string;
  configuredClients: ConfiguredClientRecord[];
  registeredRuntimes: RegisteredRuntimeRecord[];
}
