import type { RuntimeRegistrar } from "../interfaces/RuntimeRegistrar.js";
import type { StateManager } from "../interfaces/StateManager.js";
import { createInstallationState } from "../state/InstallationState.js";
import type {
  InstallationState,
  RegisteredRuntimeRecord,
  RuntimeRegistrationInput,
} from "../types/index.js";
import { resolvePackageVersion } from "../version.js";

export interface StateRuntimeRegistrarOptions {
  /**
   * Installer version written when creating state for the first runtime registration.
   * Defaults to the `@behalfid/install` package version.
   */
  installerVersion?: string;
  /**
   * Runtime version written into `installedVersion` when creating initial state.
   * Defaults to the runtime payload version on first register.
   */
  fallbackInstalledVersion?: string;
}

/**
 * State-backed runtime registrar.
 * Persists `registeredRuntimes` through {@link StateManager}.
 *
 * Prefer {@link import("./MemoryRuntimeRegistrar.js").MemoryRuntimeRegistrar}
 * while an install transaction is in progress; use this registrar for standalone
 * runtime bookkeeping against persisted installation state.
 */
export class StateRuntimeRegistrar implements RuntimeRegistrar {
  private readonly installerVersion: string;
  private readonly fallbackInstalledVersion: string | undefined;

  constructor(
    private readonly stateManager: StateManager,
    options: StateRuntimeRegistrarOptions = {},
  ) {
    this.installerVersion = options.installerVersion ?? resolvePackageVersion();
    this.fallbackInstalledVersion = options.fallbackInstalledVersion;
  }

  async register(runtime: RuntimeRegistrationInput): Promise<RegisteredRuntimeRecord> {
    const record = toRegisteredRecord(runtime);
    const existing = await this.stateManager.load();
    const registeredRuntimes = mergeRuntime(existing?.registeredRuntimes ?? [], record);

    if (existing) {
      const next: InstallationState = {
        ...existing,
        updatedAt: new Date().toISOString(),
        registeredRuntimes,
      };
      await this.stateManager.save(next);
    } else {
      await this.stateManager.save(
        createInstallationState({
          installedVersion:
            this.fallbackInstalledVersion ?? runtime.version,
          installerVersion: this.installerVersion,
          registeredRuntimes,
        }),
      );
    }

    return cloneRecord(record);
  }

  async unregister(runtimeId: string): Promise<void> {
    const existing = await this.stateManager.load();
    if (!existing) {
      return;
    }

    const registeredRuntimes = existing.registeredRuntimes.filter(
      (entry) => entry.id !== runtimeId,
    );
    if (registeredRuntimes.length === existing.registeredRuntimes.length) {
      return;
    }

    await this.stateManager.save({
      ...existing,
      updatedAt: new Date().toISOString(),
      registeredRuntimes,
    });
  }

  async list(): Promise<RegisteredRuntimeRecord[]> {
    const existing = await this.stateManager.load();
    return (existing?.registeredRuntimes ?? []).map(cloneRecord);
  }

  async get(runtimeId: string): Promise<RegisteredRuntimeRecord | null> {
    const existing = await this.stateManager.load();
    const found = existing?.registeredRuntimes.find((entry) => entry.id === runtimeId);
    return found ? cloneRecord(found) : null;
  }
}

export function createStateRuntimeRegistrar(
  stateManager: StateManager,
  options: StateRuntimeRegistrarOptions = {},
): StateRuntimeRegistrar {
  return new StateRuntimeRegistrar(stateManager, options);
}

function toRegisteredRecord(runtime: RuntimeRegistrationInput): RegisteredRuntimeRecord {
  const record: RegisteredRuntimeRecord = {
    id: runtime.id,
    packageName: runtime.packageName,
    version: runtime.version,
    serverName: runtime.serverName,
    registeredAt: new Date().toISOString(),
  };
  if (runtime.metadata !== undefined) {
    record.metadata = { ...runtime.metadata };
  }
  return record;
}

function mergeRuntime(
  existing: RegisteredRuntimeRecord[],
  update: RegisteredRuntimeRecord,
): RegisteredRuntimeRecord[] {
  return [...existing.filter((entry) => entry.id !== update.id), update];
}

function cloneRecord(record: RegisteredRuntimeRecord): RegisteredRuntimeRecord {
  const clone: RegisteredRuntimeRecord = {
    id: record.id,
    packageName: record.packageName,
    version: record.version,
    serverName: record.serverName,
    registeredAt: record.registeredAt,
  };
  if (record.metadata !== undefined) {
    clone.metadata = { ...record.metadata };
  }
  return clone;
}
