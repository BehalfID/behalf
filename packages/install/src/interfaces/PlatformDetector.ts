import type {
  DetectedClient,
  DetectedEnvironment,
  OperatingSystemId,
  PackageManagerId,
} from "../types/index.js";

/**
 * Detects host OS, package managers, and installed AI clients.
 * Implementations must be read-only and never modify configuration.
 */
export interface PlatformDetector {
  /** Detect the current operating system. */
  detectOs(): OperatingSystemId;

  /** Detect available package managers on PATH. */
  detectPackageManagers(): Promise<PackageManagerId[]>;

  /** Detect installed AI coding clients and their config locations. */
  detectClients(): Promise<DetectedClient[]>;

  /** Collect a full environment snapshot for install/doctor flows. */
  detectEnvironment(): Promise<DetectedEnvironment>;
}
