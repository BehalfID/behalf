import type { AiClientId, CheckStatus } from "./primitives.js";
import type { InstallerError } from "./errors.js";
import type { ConfiguredClientRecord, RegisteredRuntimeRecord } from "./state.js";

/** Non-fatal warning produced by an installer operation. */
export interface OperationWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Result of an install operation. */
export interface InstallResult {
  success: boolean;
  /** True when BehalfID was already installed and no changes were required. */
  alreadyInstalled: boolean;
  version: string;
  configuredClients: AiClientId[];
  registeredRuntimes: string[];
  warnings: OperationWarning[];
  errors: InstallerError[];
}

/** Result of an upgrade operation. */
export interface UpgradeResult {
  success: boolean;
  previousVersion: string | null;
  currentVersion: string;
  migrated: boolean;
  configuredClients: AiClientId[];
  warnings: OperationWarning[];
  errors: InstallerError[];
}

/** Result of an uninstall operation. */
export interface UninstallResult {
  success: boolean;
  removedClients: AiClientId[];
  removedRuntimes: string[];
  stateCleared: boolean;
  warnings: OperationWarning[];
  errors: InstallerError[];
}

/** Current installation status snapshot. */
export interface StatusResult {
  installed: boolean;
  installedVersion: string | null;
  installerVersion: string;
  installedAt: string | null;
  updatedAt: string | null;
  configuredClients: ConfiguredClientRecord[];
  registeredRuntimes: RegisteredRuntimeRecord[];
}

/** A single check within a doctor report. */
export interface DoctorCheck {
  id: string;
  name: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Machine-readable health report produced by `doctor`.
 * Satisfies the architecture requirement for verification output.
 */
export interface DoctorReport {
  healthy: boolean;
  installerVersion: string;
  installedVersion: string | null;
  checkedAt: string;
  checks: DoctorCheck[];
  runtimeInstalled: boolean;
  mcpRegistration: DoctorCheck[];
  verifyEndpoint: DoctorCheck;
  packageVersions: Record<string, string>;
  configurationIntegrity: DoctorCheck[];
}
