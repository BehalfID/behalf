import type { McpConfigManager } from "../../src/interfaces/McpConfigManager.js";
import type { PlatformDetector } from "../../src/interfaces/PlatformDetector.js";
import type { RuntimeRegistrar } from "../../src/interfaces/RuntimeRegistrar.js";
import type { StateManager } from "../../src/interfaces/StateManager.js";
import type { Verifier } from "../../src/interfaces/Verifier.js";
import type {
  ConfigBackup,
  DetectedClient,
  DetectedEnvironment,
  DoctorOptions,
  DoctorReport,
  InstallationState,
  McpConfiguration,
  McpServerEntry,
  OperatingSystemId,
  PackageManagerId,
  RegisteredRuntimeRecord,
  RuntimeRegistrationInput,
} from "../../src/types/index.js";
import { parseInstallationState } from "../../src/state/InstallationState.js";

export class MemoryStateManager implements StateManager {
  readonly stateFilePath: string;
  private state: InstallationState | null = null;
  failOnSave = false;
  failOnLoad = false;

  constructor(stateFilePath = ":memory:") {
    this.stateFilePath = stateFilePath;
  }

  async exists(): Promise<boolean> {
    return this.state !== null;
  }

  async load(): Promise<InstallationState | null> {
    if (this.failOnLoad) {
      throw new Error("forced load failure");
    }
    return this.state ? structuredClone(this.state) : null;
  }

  async save(state: InstallationState): Promise<void> {
    if (this.failOnSave) {
      throw new Error("forced save failure");
    }
    this.state = parseInstallationState(structuredClone(state));
  }

  async clear(): Promise<void> {
    this.state = null;
  }
}

export class FakePlatformDetector implements PlatformDetector {
  constructor(
    private environment: DetectedEnvironment,
    private readonly fail = false,
  ) {}

  setEnvironment(environment: DetectedEnvironment): void {
    this.environment = environment;
  }

  detectOs(): OperatingSystemId {
    return this.environment.os;
  }

  async detectPackageManagers(): Promise<PackageManagerId[]> {
    return [...this.environment.packageManagers];
  }

  async detectClients(): Promise<DetectedClient[]> {
    return structuredClone(this.environment.clients);
  }

  async detectEnvironment(): Promise<DetectedEnvironment> {
    if (this.fail) {
      throw new Error("forced detection failure");
    }
    return structuredClone(this.environment);
  }
}

export class FakeMcpConfigManager implements McpConfigManager {
  readonly configs = new Map<string, McpConfiguration>();
  readonly backups: ConfigBackup[] = [];
  failRegisterFor = new Set<string>();
  failRestore = false;
  registerCalls: Array<{ path: string; serverName: string }> = [];
  unregisterCalls: Array<{ path: string; serverName: string }> = [];

  seed(path: string, config: McpConfiguration = { mcpServers: {} }): void {
    this.configs.set(path, structuredClone(config));
  }

  async read(configPath: string): Promise<McpConfiguration> {
    const existing = this.configs.get(configPath);
    if (!existing) {
      return { mcpServers: {} };
    }
    return structuredClone(existing);
  }

  async write(configPath: string, config: McpConfiguration): Promise<void> {
    this.configs.set(configPath, structuredClone(config));
  }

  async backup(configPath: string): Promise<ConfigBackup> {
    const backup: ConfigBackup = {
      originalPath: configPath,
      backupPath: `${configPath}.bak`,
      createdAt: new Date().toISOString(),
    };
    this.backups.push(backup);
    // Snapshot current contents onto the backup path key for restore.
    const current = await this.read(configPath);
    this.configs.set(backup.backupPath, current);
    return backup;
  }

  async restore(backup: ConfigBackup): Promise<void> {
    if (this.failRestore) {
      throw new Error("forced restore failure");
    }
    const snapshot = this.configs.get(backup.backupPath);
    if (!snapshot) {
      throw new Error(`missing backup snapshot: ${backup.backupPath}`);
    }
    this.configs.set(backup.originalPath, structuredClone(snapshot));
  }

  async registerRuntime(
    configPath: string,
    runtime: RuntimeRegistrationInput,
  ): Promise<void> {
    this.registerCalls.push({ path: configPath, serverName: runtime.serverName });
    if (this.failRegisterFor.has(configPath)) {
      throw new Error(`forced register failure for ${configPath}`);
    }

    const config = await this.read(configPath);
    const servers: Record<string, McpServerEntry> = {
      ...(config.mcpServers ?? {}),
    };
    const entry: McpServerEntry = {
      command: runtime.command,
      args: runtime.args,
    };
    if (runtime.env !== undefined) {
      entry.env = runtime.env;
    }
    servers[runtime.serverName] = entry;
    config.mcpServers = servers;
    await this.write(configPath, config);
  }

  async unregisterRuntime(configPath: string, serverName: string): Promise<void> {
    this.unregisterCalls.push({ path: configPath, serverName });
    const config = await this.read(configPath);
    if (config.mcpServers && serverName in config.mcpServers) {
      const { [serverName]: _removed, ...rest } = config.mcpServers;
      config.mcpServers = rest;
      await this.write(configPath, config);
    }
  }

  async hasRuntime(configPath: string, serverName: string): Promise<boolean> {
    const config = await this.read(configPath);
    return Boolean(config.mcpServers?.[serverName]);
  }
}

export class FakeRuntimeRegistrar implements RuntimeRegistrar {
  private readonly runtimes = new Map<string, RegisteredRuntimeRecord>();

  async register(runtime: RuntimeRegistrationInput): Promise<RegisteredRuntimeRecord> {
    const record: RegisteredRuntimeRecord = {
      id: runtime.id,
      packageName: runtime.packageName,
      version: runtime.version,
      serverName: runtime.serverName,
      registeredAt: new Date().toISOString(),
    };
    if (runtime.metadata !== undefined) {
      record.metadata = runtime.metadata;
    }
    this.runtimes.set(runtime.id, record);
    return structuredClone(record);
  }

  async unregister(runtimeId: string): Promise<void> {
    this.runtimes.delete(runtimeId);
  }

  async list(): Promise<RegisteredRuntimeRecord[]> {
    return [...this.runtimes.values()].map((entry) => structuredClone(entry));
  }

  async get(runtimeId: string): Promise<RegisteredRuntimeRecord | null> {
    const found = this.runtimes.get(runtimeId);
    return found ? structuredClone(found) : null;
  }
}

export class FakeVerifier implements Verifier {
  constructor(private report: DoctorReport) {}

  setReport(report: DoctorReport): void {
    this.report = report;
  }

  async verify(_options?: DoctorOptions): Promise<DoctorReport> {
    return structuredClone(this.report);
  }
}

export function createTestEnvironment(
  clients: DetectedClient[],
): DetectedEnvironment {
  return {
    os: "win32",
    arch: "x64",
    nodeVersion: process.version,
    packageManagers: ["npm"],
    clients,
    homeDir: "/tmp/behalf-home",
    cwd: "/tmp/project",
  };
}
