/** Stable error codes returned by installer operations. */
export type InstallerErrorCode =
  | "DETECTION_FAILED"
  | "CONFIG_READ_FAILED"
  | "CONFIG_WRITE_FAILED"
  | "CONFIG_BACKUP_FAILED"
  | "CONFIG_INVALID"
  | "RUNTIME_REGISTRATION_FAILED"
  | "STATE_READ_FAILED"
  | "STATE_WRITE_FAILED"
  | "STATE_INVALID"
  | "VERIFY_FAILED"
  | "PACKAGE_INSTALL_FAILED"
  | "ROLLBACK_FAILED"
  | "UNSUPPORTED_PLATFORM"
  | "NOT_INSTALLED"
  | "ALREADY_INSTALLED"
  | "INTERNAL_ERROR";

/**
 * Stable warning codes returned alongside successful or failed operations.
 * Warnings are non-fatal; they appear in `warnings[]` rather than `errors[]`.
 */
export type InstallerWarningCode =
  | "CLIENT_NOT_DETECTED"
  | "CLIENT_NOT_INSTALLED"
  | "CLIENT_MISSING_MCP_PATH"
  | "RUNTIME_ALREADY_REGISTERED"
  | "SERVER_WRAP_SKIPPED"
  | "NO_SERVERS_WRAPPED"
  /** Soft uninstall no-op when nothing is installed (success: true). */
  | "NOT_INSTALLED";

/** Structured installer error suitable for human and JSON output. */
export interface InstallerError {
  code: InstallerErrorCode;
  message: string;
  /** Optional remediation guidance for the operator or AI agent. */
  remediation?: string;
  cause?: string;
  details?: Record<string, unknown>;
}
