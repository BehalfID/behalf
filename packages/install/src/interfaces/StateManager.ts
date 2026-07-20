import type { InstallationState } from "../types/index.js";

/**
 * Persists installation state used for upgrades, diagnostics, and uninstall.
 */
export interface StateManager {
  /** Absolute path to the state file. */
  readonly stateFilePath: string;

  /** Load installation state, or null when no state exists. */
  load(): Promise<InstallationState | null>;

  /** Persist installation state using an atomic write when possible. */
  save(state: InstallationState): Promise<void>;

  /** Remove persisted installation state. */
  clear(): Promise<void>;

  /** Return whether a state file currently exists. */
  exists(): Promise<boolean>;
}
