/**
 * Shared type contracts for the BehalfID AI Installation Framework.
 */

export type {
  AiClientId,
  PackageManagerId,
  OperatingSystemId,
  CheckStatus,
  OutputFormat,
} from "./primitives.js";

export type {
  ClientConfigPaths,
  DetectedClient,
  DetectedEnvironment,
} from "./detection.js";

export type {
  McpServerEntry,
  McpConfiguration,
  RuntimeRegistrationInput,
  ConfigBackup,
} from "./mcp.js";

export type {
  ConfiguredClientRecord,
  RegisteredRuntimeRecord,
  InstallationState,
} from "./state.js";

export type {
  InstallOptions,
  UpgradeOptions,
  UninstallOptions,
  DoctorOptions,
  StatusOptions,
  GlobalCliOptions,
} from "./options.js";

export type {
  InstallResult,
  UpgradeResult,
  UninstallResult,
  StatusResult,
  DoctorCheck,
  DoctorReport,
  OperationWarning,
} from "./results.js";

export type { InstallerErrorCode, InstallerError } from "./errors.js";

export { INSTALLATION_STATE_SCHEMA_VERSION, BEHALF_MCP_SERVER_NAME } from "./constants.js";
