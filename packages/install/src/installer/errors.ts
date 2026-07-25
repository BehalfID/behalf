import type { InstallerError, InstallerErrorCode } from "../types/index.js";

export interface InstallerExceptionOptions {
  code: InstallerErrorCode;
  message: string;
  remediation?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

/**
 * Throwable error used inside the installer framework.
 * Convert to a serializable {@link InstallerError} before returning to callers.
 */
export class InstallerException extends Error {
  readonly code: InstallerErrorCode;
  readonly remediation?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: InstallerExceptionOptions) {
    super(options.message);
    this.name = "InstallerException";
    this.code = options.code;
    this.cause = options.cause;
    if (options.remediation !== undefined) {
      this.remediation = options.remediation;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }

  toInstallerError(): InstallerError {
    return toInstallerError(this);
  }
}

/** Build a structured installer error from an exception or unknown failure. */
export function toInstallerError(
  error: unknown,
  fallbackCode: InstallerErrorCode = "INTERNAL_ERROR",
): InstallerError {
  if (error instanceof InstallerException) {
    const result: InstallerError = {
      code: error.code,
      message: error.message,
    };
    if (error.remediation !== undefined) {
      result.remediation = error.remediation;
    }
    if (error.details !== undefined) {
      result.details = error.details;
    }
    if (error.cause !== undefined) {
      result.cause = causeToString(error.cause);
    }
    return result;
  }

  if (error instanceof Error) {
    const result: InstallerError = {
      code: fallbackCode,
      message: error.message,
    };
    if (error.cause !== undefined) {
      result.cause = causeToString(error.cause);
    }
    return result;
  }

  return {
    code: fallbackCode,
    message: String(error),
  };
}

export function createInstallerError(
  code: InstallerErrorCode,
  message: string,
  options: {
    remediation?: string;
    cause?: string;
    details?: Record<string, unknown>;
  } = {},
): InstallerError {
  const result: InstallerError = { code, message };
  if (options.remediation !== undefined) {
    result.remediation = options.remediation;
  }
  if (options.cause !== undefined) {
    result.cause = options.cause;
  }
  if (options.details !== undefined) {
    result.details = options.details;
  }
  return result;
}

function causeToString(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}
