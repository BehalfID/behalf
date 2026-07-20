/**
 * @behalfid/install — BehalfID AI Installation Framework
 *
 * Universal installer surface for AI coding agents. Agents invoke this package;
 * BehalfID owns platform detection, configuration, registration, verification,
 * upgrades, rollback, and diagnostics.
 */

export {
  BEHALF_MCP_SERVER_NAME,
  INSTALLATION_STATE_SCHEMA_VERSION,
} from "./types/index.js";

export type {
  AiClientId,
  PackageManagerId,
  OperatingSystemId,
  CheckStatus,
  OutputFormat,
  ClientConfigPaths,
  DetectedClient,
  DetectedEnvironment,
  McpServerEntry,
  McpConfiguration,
  RuntimeRegistrationInput,
  ConfigBackup,
  ConfiguredClientRecord,
  RegisteredRuntimeRecord,
  InstallationState,
  InstallOptions,
  UpgradeOptions,
  UninstallOptions,
  DoctorOptions,
  StatusOptions,
  GlobalCliOptions,
  InstallResult,
  UpgradeResult,
  UninstallResult,
  StatusResult,
  DoctorCheck,
  DoctorReport,
  OperationWarning,
  InstallerErrorCode,
  InstallerError,
} from "./types/index.js";

export type {
  PlatformDetector,
  McpConfigManager,
  RuntimeRegistrar,
  StateManager,
  Verifier,
  Installer,
} from "./interfaces/index.js";

export {
  atomicWriteFile,
  createInstallationState,
  parseInstallationState,
  FileStateManager,
  BEHALF_CONFIG_DIR_NAME,
  INSTALLATION_STATE_FILE_NAME,
  resolveBehalfConfigDir,
  resolveInstallationStatePath,
} from "./state/index.js";
export type { FileStateManagerOptions } from "./state/index.js";

export { createCliProgram, runCli } from "./cli.js";
export type { CreateCliProgramOptions } from "./cli.js";

export { resolvePackageVersion } from "./version.js";
