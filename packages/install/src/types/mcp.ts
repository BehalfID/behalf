/**
 * Minimal MCP configuration shapes used by the installer.
 * The manager preserves unknown fields when reading and writing.
 */

/** A single MCP server entry as commonly stored in client config files. */
export interface McpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  [key: string]: unknown;
}

/**
 * Parsed MCP configuration document.
 * Additional top-level keys are retained for round-trip safety.
 */
export interface McpConfiguration {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

/** Input used when registering a BehalfID runtime into MCP configuration. */
export interface RuntimeRegistrationInput {
  /** Logical runtime identifier (for example, "mcp-runtime"). */
  id: string;
  /** npm package name for the runtime. */
  packageName: string;
  /** Runtime package version to register. */
  version: string;
  /** MCP server name written into client configuration. */
  serverName: string;
  /** Command used to launch the runtime. */
  command: string;
  /** Arguments passed to the runtime command. */
  args: string[];
  /** Optional environment variables for the runtime process. */
  env?: Record<string, string>;
  /** Optional opaque metadata stored in installer state. */
  metadata?: Record<string, unknown>;
}

/** Backup created before mutating a configuration file. */
export interface ConfigBackup {
  /** Absolute path of the original configuration file. */
  originalPath: string;
  /** Absolute path of the backup file. */
  backupPath: string;
  /** ISO-8601 timestamp when the backup was created. */
  createdAt: string;
}
