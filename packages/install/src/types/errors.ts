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

/** Structured installer error suitable for human and JSON output. */
export interface InstallerError {
  code: InstallerErrorCode;
  message: string;
  /** Optional remediation guidance for the operator or AI agent. */
  remediation?: string;
  cause?: string;
  details?: Record<string, unknown>;
}
