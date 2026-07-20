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

export {
  createDefaultInstaller,
  createCliOutput,
  createDefaultHandlerContext,
} from "./cli/index.js";
export type {
  CreateDefaultInstallerOptions,
  CliHandlerContext,
  CliOutput,
} from "./cli/index.js";

export {
  DEFAULT_INSTALLATION_SPEC,
  getDefaultInstallationSpec,
  parseInstallationSpec,
  loadInstallationSpecFromFile,
  loadBundledInstallationSpec,
  serializeInstallationSpec,
  resolveBundledSpecPath,
} from "./spec/index.js";
export type {
  InstallationSpec,
  InstallationSpecCommand,
  InstallationSpecDetection,
  InstallationSpecSchemaVersion,
} from "./spec/index.js";

export { resolvePackageVersion } from "./version.js";

export {
  BehalfInstaller,
  createBehalfInstaller,
  InstallerException,
  toInstallerError,
  createInstallerError,
  InstallTransaction,
  createDefaultRuntimeRegistration,
  DEFAULT_RUNTIME_ID,
  DEFAULT_RUNTIME_PACKAGE,
  DEFAULT_BEHALF_BASE_URL,
  DEFAULT_VERIFY_ENDPOINT,
  parseClientIdList,
  selectTargetClients,
  requireTargets,
} from "./installer/index.js";
export type {
  BehalfInstallerDependencies,
  InstallerExceptionOptions,
  RollbackResult,
  CreateDefaultRuntimeRegistrationOptions,
} from "./installer/index.js";

export {
  HostPlatformDetector,
  createHostPlatformDetector,
  pathExists,
  createCommandExists,
  detectPackageManagers,
  resolveOperatingSystem,
  cursorPaths,
  claudeCodePaths,
  claudeDesktopPaths,
  codexPaths,
  vscodePaths,
  windsurfPaths,
  detectAllClients,
  detectCursor,
  detectClaudeCode,
  detectClaudeDesktop,
  detectCodex,
  detectVscode,
  detectWindsurf,
} from "./detection/index.js";
export type {
  HostPlatformDetectorOptions,
  PathExistsFn,
  CommandExistsFn,
  DetectionPathContext,
} from "./detection/index.js";

export {
  FileMcpConfigManager,
  createFileMcpConfigManager,
  detectMcpConfigFormat,
  refineMcpConfigFormat,
  parseMcpConfigContents,
  serializeMcpConfig,
  runtimeToServerEntry,
  getServerMap,
  setServerMap,
  upsertServerEntry,
  removeServerEntry,
} from "./mcp/index.js";
export type {
  FileMcpConfigManagerOptions,
  McpConfigFormat,
} from "./mcp/index.js";

export {
  RuntimeCatalog,
  createDefaultRuntimeCatalog,
  resolveRuntimeRegistration,
  mcpRuntimeDefinition,
  MemoryRuntimeRegistrar,
  createMemoryRuntimeRegistrar,
  StateRuntimeRegistrar,
  createStateRuntimeRegistrar,
} from "./runtime/index.js";
export type {
  RuntimeDefinition,
  StateRuntimeRegistrarOptions,
} from "./runtime/index.js";

export {
  InstallationVerifier,
  createInstallationVerifier,
  createCheck,
  isHealthy,
  probeVerifyEndpoint,
} from "./verification/index.js";
export type {
  InstallationVerifierOptions,
  FetchLike,
  ProbeVerifyEndpointOptions,
} from "./verification/index.js";
