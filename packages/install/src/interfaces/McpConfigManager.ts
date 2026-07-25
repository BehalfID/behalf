import type {
  ConfigBackup,
  McpConfiguration,
  RuntimeRegistrationInput,
} from "../types/index.js";

/**
 * Reads and safely mutates MCP configuration files.
 * Must preserve unrelated settings, avoid duplicate entries, and support rollback.
 */
export interface McpConfigManager {
  /** Read and parse an MCP configuration file. */
  read(configPath: string): Promise<McpConfiguration>;

  /**
   * Write an MCP configuration file using an atomic replace when possible.
   * Callers are responsible for constructing the full desired document.
   */
  write(configPath: string, config: McpConfiguration): Promise<void>;

  /** Create a backup of an existing configuration file before mutation. */
  backup(configPath: string): Promise<ConfigBackup>;

  /** Restore a configuration file from a previously created backup. */
  restore(backup: ConfigBackup): Promise<void>;

  /**
   * Register a BehalfID runtime into the given MCP configuration file.
   * Must be idempotent: existing matching entries are updated, not duplicated.
   */
  registerRuntime(configPath: string, runtime: RuntimeRegistrationInput): Promise<void>;

  /** Remove a previously registered runtime by MCP server name. */
  unregisterRuntime(configPath: string, serverName: string): Promise<void>;

  /** Return whether the given MCP server name is already registered. */
  hasRuntime(configPath: string, serverName: string): Promise<boolean>;
}
