import type { RegisteredRuntimeRecord, RuntimeRegistrationInput } from "../types/index.js";

/**
 * Tracks runtimes registered by the installer.
 * Designed so additional runtimes can be added without changing the installer core.
 */
export interface RuntimeRegistrar {
  /** Register or update a runtime record. */
  register(runtime: RuntimeRegistrationInput): Promise<RegisteredRuntimeRecord>;

  /** Unregister a runtime by identifier. */
  unregister(runtimeId: string): Promise<void>;

  /** List currently registered runtimes. */
  list(): Promise<RegisteredRuntimeRecord[]>;

  /** Look up a single runtime by identifier. */
  get(runtimeId: string): Promise<RegisteredRuntimeRecord | null>;
}
