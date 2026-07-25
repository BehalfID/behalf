import type { RuntimeRegistrar } from "../interfaces/RuntimeRegistrar.js";
import type { RegisteredRuntimeRecord, RuntimeRegistrationInput } from "../types/index.js";

/**
 * In-memory runtime registrar.
 * Preferred during transactional install/upgrade flows where
 * {@link import("../installer/BehalfInstaller.js").BehalfInstaller} commits
 * installation state after MCP mutations succeed.
 */
export class MemoryRuntimeRegistrar implements RuntimeRegistrar {
  private readonly runtimes = new Map<string, RegisteredRuntimeRecord>();

  async register(runtime: RuntimeRegistrationInput): Promise<RegisteredRuntimeRecord> {
    const record = toRegisteredRecord(runtime);
    this.runtimes.set(record.id, record);
    return cloneRecord(record);
  }

  async unregister(runtimeId: string): Promise<void> {
    this.runtimes.delete(runtimeId);
  }

  async list(): Promise<RegisteredRuntimeRecord[]> {
    return [...this.runtimes.values()].map(cloneRecord);
  }

  async get(runtimeId: string): Promise<RegisteredRuntimeRecord | null> {
    const found = this.runtimes.get(runtimeId);
    return found ? cloneRecord(found) : null;
  }

  /** Replace all tracked runtimes (useful when hydrating from persisted state). */
  hydrate(records: readonly RegisteredRuntimeRecord[]): void {
    this.runtimes.clear();
    for (const record of records) {
      this.runtimes.set(record.id, cloneRecord(record));
    }
  }
}

export function createMemoryRuntimeRegistrar(
  initial: readonly RegisteredRuntimeRecord[] = [],
): MemoryRuntimeRegistrar {
  const registrar = new MemoryRuntimeRegistrar();
  if (initial.length > 0) {
    registrar.hydrate(initial);
  }
  return registrar;
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
