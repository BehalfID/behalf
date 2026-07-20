import type { AiClientId, OutputFormat } from "./primitives.js";

/** Shared CLI options available to all commands. */
export interface GlobalCliOptions {
  /** Emit machine-readable JSON instead of human-readable text. */
  json?: boolean;
  /** Output format override. Defaults to "json" when `json` is true. */
  format?: OutputFormat;
}

/** Options for `install`. */
export interface InstallOptions extends GlobalCliOptions {
  /** Limit installation to specific clients. When omitted, all detected clients are considered. */
  clients?: AiClientId[];
  /** Preview actions without writing files. */
  dryRun?: boolean;
  /** Replace existing BehalfID registration even when already present. */
  force?: boolean;
  /** Override the verify API endpoint written into runtime configuration. */
  verifyEndpoint?: string;
}

/** Options for `upgrade`. */
export interface UpgradeOptions extends GlobalCliOptions {
  clients?: AiClientId[];
  dryRun?: boolean;
  verifyEndpoint?: string;
}

/** Options for `uninstall`. */
export interface UninstallOptions extends GlobalCliOptions {
  /** Limit uninstallation to specific clients. When omitted, all configured clients are cleaned. */
  clients?: AiClientId[];
  dryRun?: boolean;
  /** Also remove persisted installer state. Defaults to true. */
  clearState?: boolean;
}

/** Options for `doctor`. */
export interface DoctorOptions extends GlobalCliOptions {
  /** Override the verify endpoint probed during connectivity checks. */
  verifyEndpoint?: string;
}

/** Options for `status`. */
export interface StatusOptions extends GlobalCliOptions {}
