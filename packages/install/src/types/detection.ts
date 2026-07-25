import type { AiClientId, OperatingSystemId, PackageManagerId } from "./primitives.js";

/** Known configuration locations for a detected AI client. */
export interface ClientConfigPaths {
  /** User-level configuration directory, when present. */
  userConfigDir?: string;
  /** Primary MCP configuration file path, when present. */
  mcpConfigPath?: string;
  /** Workspace-level configuration directory, when present. */
  workspaceConfigDir?: string;
}

/** Result of detecting a single AI client on the host. */
export interface DetectedClient {
  id: AiClientId;
  /** Human-readable client name. */
  name: string;
  /** Whether the client appears to be installed. */
  installed: boolean;
  configPaths: ClientConfigPaths;
}

/** Snapshot of the host environment relevant to installation. */
export interface DetectedEnvironment {
  os: OperatingSystemId;
  arch: string;
  nodeVersion: string;
  packageManagers: PackageManagerId[];
  clients: DetectedClient[];
  homeDir: string;
  cwd: string;
}
