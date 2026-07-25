import type {
  DoctorOptions,
  DoctorReport,
  InstallOptions,
  InstallResult,
  StatusOptions,
  StatusResult,
  UninstallOptions,
  UninstallResult,
  UpgradeOptions,
  UpgradeResult,
} from "../types/index.js";

/**
 * Top-level installer API consumed by the CLI and programmatic callers.
 * Implementations own platform detection, configuration, registration,
 * verification, upgrades, rollback, and diagnostics.
 */
export interface Installer {
  install(options?: InstallOptions): Promise<InstallResult>;
  upgrade(options?: UpgradeOptions): Promise<UpgradeResult>;
  uninstall(options?: UninstallOptions): Promise<UninstallResult>;
  doctor(options?: DoctorOptions): Promise<DoctorReport>;
  status(options?: StatusOptions): Promise<StatusResult>;
}
