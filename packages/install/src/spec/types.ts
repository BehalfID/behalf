/** Schema version for the machine-readable installation specification. */
export type InstallationSpecSchemaVersion = 1;

/** A CLI command an AI agent can execute. */
export interface InstallationSpecCommand {
  /** Shell command to run (no shell interpolation required). */
  command: string;
  /** Expected exit code on success. Defaults to 0. */
  exitCode?: number;
  /** JSON field that must equal `expected` when parsing stdout as JSON. */
  successJsonField?: string;
  /** Expected value for `successJsonField`. Defaults to true when field is set. */
  successJsonValue?: unknown;
}

/** Detection hints for whether BehalfID is already installed. */
export interface InstallationSpecDetection {
  /** Relative path under the user home directory for persisted state. */
  stateRelativePath: string;
  /** Command that returns installation status as JSON. */
  statusCommand: string;
  /** JSON field indicating installation presence. */
  installedJsonField: string;
  /** Expected value when installed. */
  installedJsonValue?: unknown;
}

/** Full machine-readable BehalfID installation specification. */
export interface InstallationSpec {
  name: "BehalfID";
  version: InstallationSpecSchemaVersion;
  package: "@behalfid/install";
  description: string;
  commands: {
    install: InstallationSpecCommand;
    verify: InstallationSpecCommand;
    status: InstallationSpecCommand;
    upgrade: InstallationSpecCommand;
    uninstall: InstallationSpecCommand;
  };
  detection: InstallationSpecDetection;
  supportedClients: readonly string[];
  notes: readonly string[];
}
