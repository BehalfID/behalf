import type { Installer } from "../interfaces/Installer.js";
import type { McpConfigManager } from "../interfaces/McpConfigManager.js";
import type { PlatformDetector } from "../interfaces/PlatformDetector.js";
import type { RuntimeRegistrar } from "../interfaces/RuntimeRegistrar.js";
import type { StateManager } from "../interfaces/StateManager.js";
import type { Verifier } from "../interfaces/Verifier.js";
import { detectMcpConfigFormat, refineMcpConfigFormat } from "../mcp/format.js";
import {
  restoreWrappedServers,
  wrapServersInConfig,
} from "../mcp/wrap.js";
import { pathExists } from "../detection/fs.js";
import { createInstallationState } from "../state/InstallationState.js";
import type {
  AiClientId,
  ConfiguredClientRecord,
  DetectedClient,
  DoctorOptions,
  DoctorReport,
  InstallationState,
  InstallerError,
  InstallOptions,
  InstallResult,
  OperationWarning,
  RegisteredRuntimeRecord,
  RuntimeRegistrationInput,
  StatusOptions,
  StatusResult,
  UninstallOptions,
  UninstallResult,
  UpgradeOptions,
  UpgradeResult,
  WrappedServerSnapshot,
} from "../types/index.js";
import { resolvePackageVersion } from "../version.js";
import { requireTargets, selectTargetClients } from "./clients.js";
import { InstallerException, toInstallerError } from "./errors.js";
import {
  createDefaultRuntimeRegistration,
  type CreateDefaultRuntimeRegistrationOptions,
} from "./runtime.js";
import { InstallTransaction } from "./transaction.js";

export interface BehalfInstallerDependencies {
  detector: PlatformDetector;
  configManager: McpConfigManager;
  runtimeRegistrar: RuntimeRegistrar;
  stateManager: StateManager;
  verifier: Verifier;
  /** Version recorded as `installedVersion`. Defaults to the installer package version. */
  runtimeVersion?: string;
  /** Version recorded as `installerVersion`. Defaults to the installer package version. */
  installerVersion?: string;
  /** Override the default runtime registration factory. */
  createRuntimeRegistration?: (
    input: CreateDefaultRuntimeRegistrationOptions,
  ) => RuntimeRegistrationInput;
}

/**
 * Orchestrates BehalfID installation lifecycle operations.
 *
 * Concrete platform detection, MCP mutation, and verification are injected so
 * new clients and runtimes can be added without changing this core.
 */
export class BehalfInstaller implements Installer {
  private readonly detector: PlatformDetector;
  private readonly configManager: McpConfigManager;
  private readonly runtimeRegistrar: RuntimeRegistrar;
  private readonly stateManager: StateManager;
  private readonly verifier: Verifier;
  private readonly runtimeVersion: string;
  private readonly installerVersion: string;
  private readonly createRuntimeRegistration: (
    input: CreateDefaultRuntimeRegistrationOptions,
  ) => RuntimeRegistrationInput;

  constructor(deps: BehalfInstallerDependencies) {
    this.detector = deps.detector;
    this.configManager = deps.configManager;
    this.runtimeRegistrar = deps.runtimeRegistrar;
    this.stateManager = deps.stateManager;
    this.verifier = deps.verifier;

    const packageVersion = deps.installerVersion ?? resolvePackageVersion();
    this.installerVersion = packageVersion;
    this.runtimeVersion = deps.runtimeVersion ?? packageVersion;
    this.createRuntimeRegistration =
      deps.createRuntimeRegistration ??
      ((input) => createDefaultRuntimeRegistration(input));
  }

  async status(_options: StatusOptions = {}): Promise<StatusResult> {
    const state = await this.loadState();
    return this.toStatusResult(state);
  }

  async doctor(options: DoctorOptions = {}): Promise<DoctorReport> {
    return this.verifier.verify(options);
  }

  async install(options: InstallOptions = {}): Promise<InstallResult> {
    const warnings: OperationWarning[] = [];
    const errors: InstallerError[] = [];

    try {
      const existing = await this.loadState();
      const environment = await this.detectEnvironment();
      const { targets, warnings: selectionWarnings } = selectTargetClients(
        environment.clients,
        options.clients,
      );
      warnings.push(...selectionWarnings);
      requireTargets(targets);

      if (options.wrapExisting === true && (!options.agentId || !options.apiKey)) {
        throw new InstallerException({
          code: "INTERNAL_ERROR",
          message:
            "Wrapping MCP servers requires --agent-id and --api-key (or BEHALFID_AGENT_ID / BEHALFID_API_KEY).",
          remediation:
            "Pass credentials so the interceptor can call verify() for every tool invocation.",
        });
      }

      const runtime = this.createRuntimeRegistration({
        version: this.runtimeVersion,
        ...(options.verifyEndpoint !== undefined
          ? { verifyEndpoint: options.verifyEndpoint }
          : {}),
        ...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
        ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
      });

      if (existing && !options.force) {
        const alreadyConfigured = await this.areClientsFullyConfigured(
          targets,
          existing,
          runtime.serverName,
        );
        if (alreadyConfigured) {
          return {
            success: true,
            alreadyInstalled: true,
            version: existing.installedVersion,
            configuredClients: existing.configuredClients.map((client) => client.clientId),
            registeredRuntimes: existing.registeredRuntimes.map((entry) => entry.id),
            warnings,
            errors,
          };
        }
      }

      if (options.dryRun) {
        return {
          success: true,
          alreadyInstalled: false,
          version: this.runtimeVersion,
          configuredClients: targets.map((client) => client.id),
          registeredRuntimes: [runtime.id],
          warnings,
          errors,
        };
      }

      const transaction = new InstallTransaction(this.configManager);
      const configuredClients: ConfiguredClientRecord[] = [];

      try {
        for (const client of targets) {
          const record = await this.configureClient({
            client,
            runtime,
            force: options.force === true,
            transaction,
            warnings,
            wrapExisting: options.wrapExisting === true,
            ...(options.wrapServers !== undefined
              ? { wrapServers: options.wrapServers }
              : {}),
            ...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
            ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
            ...(options.verifyEndpoint !== undefined
              ? { verifyEndpoint: options.verifyEndpoint }
              : {}),
          });
          configuredClients.push(record);
        }

        const registered = await this.runtimeRegistrar.register(runtime);
        const nextState = this.buildInstallState({
          existing,
          configuredClients,
          registered,
        });
        await this.saveState(nextState);

        return {
          success: true,
          alreadyInstalled: false,
          version: nextState.installedVersion,
          configuredClients: configuredClients.map((client) => client.clientId),
          registeredRuntimes: nextState.registeredRuntimes.map((entry) => entry.id),
          warnings,
          errors,
        };
      } catch (error) {
        const rollback = await transaction.rollback();
        warnings.push(...rollback.warnings);
        errors.push(toInstallerError(error, "INTERNAL_ERROR"), ...rollback.errors);
        return {
          success: false,
          alreadyInstalled: false,
          version: this.runtimeVersion,
          configuredClients: [],
          registeredRuntimes: [],
          warnings,
          errors,
        };
      }
    } catch (error) {
      errors.push(toInstallerError(error, "INTERNAL_ERROR"));
      return {
        success: false,
        alreadyInstalled: false,
        version: this.runtimeVersion,
        configuredClients: [],
        registeredRuntimes: [],
        warnings,
        errors,
      };
    }
  }

  async upgrade(options: UpgradeOptions = {}): Promise<UpgradeResult> {
    const warnings: OperationWarning[] = [];
    const errors: InstallerError[] = [];

    try {
      const existing = await this.loadState();
      if (!existing) {
        return {
          success: false,
          previousVersion: null,
          currentVersion: this.runtimeVersion,
          migrated: false,
          configuredClients: [],
          warnings,
          errors: [
            toInstallerError(
              new InstallerException({
                code: "NOT_INSTALLED",
                message: "BehalfID is not installed. Run install before upgrade.",
                remediation: "Run `npx @behalfid/install install` first.",
              }),
            ),
          ],
        };
      }

      const environment = await this.detectEnvironment();
      const preferredIds =
        options.clients ?? existing.configuredClients.map((client) => client.clientId);
      const { targets, warnings: selectionWarnings } = selectTargetClients(
        environment.clients,
        preferredIds,
      );
      warnings.push(...selectionWarnings);

      const fallbackTargets = this.clientsFromState(existing, options.clients);
      const effectiveTargets = targets.length > 0 ? targets : fallbackTargets;
      requireTargets(effectiveTargets);

      const runtime = this.createRuntimeRegistration({
        version: this.runtimeVersion,
        ...(options.verifyEndpoint !== undefined
          ? { verifyEndpoint: options.verifyEndpoint }
          : {}),
        ...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
        ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
      });

      const previousVersion = existing.installedVersion;
      const migrated = previousVersion !== this.runtimeVersion;

      if (options.dryRun) {
        return {
          success: true,
          previousVersion,
          currentVersion: this.runtimeVersion,
          migrated,
          configuredClients: effectiveTargets.map((client) => client.id),
          warnings,
          errors,
        };
      }

      const transaction = new InstallTransaction(this.configManager);
      const configuredClients: ConfiguredClientRecord[] = [];

      try {
        for (const client of effectiveTargets) {
          const record = await this.configureClient({
            client,
            runtime,
            force: true,
            transaction,
            warnings,
            wrapExisting: options.wrapExisting === true,
            ...(options.wrapServers !== undefined
              ? { wrapServers: options.wrapServers }
              : {}),
            ...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
            ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
            ...(options.verifyEndpoint !== undefined
              ? { verifyEndpoint: options.verifyEndpoint }
              : {}),
          });
          configuredClients.push(record);
        }

        const registered = await this.runtimeRegistrar.register(runtime);
        const nextState = this.buildInstallState({
          existing,
          configuredClients,
          registered,
          preserveInstalledAt: true,
        });
        await this.saveState(nextState);

        return {
          success: true,
          previousVersion,
          currentVersion: nextState.installedVersion,
          migrated,
          configuredClients: configuredClients.map((client) => client.clientId),
          warnings,
          errors,
        };
      } catch (error) {
        const rollback = await transaction.rollback();
        warnings.push(...rollback.warnings);
        errors.push(toInstallerError(error, "INTERNAL_ERROR"), ...rollback.errors);
        return {
          success: false,
          previousVersion,
          currentVersion: this.runtimeVersion,
          migrated: false,
          configuredClients: [],
          warnings,
          errors,
        };
      }
    } catch (error) {
      errors.push(toInstallerError(error, "INTERNAL_ERROR"));
      return {
        success: false,
        previousVersion: null,
        currentVersion: this.runtimeVersion,
        migrated: false,
        configuredClients: [],
        warnings,
        errors,
      };
    }
  }

  async uninstall(options: UninstallOptions = {}): Promise<UninstallResult> {
    const warnings: OperationWarning[] = [];
    const errors: InstallerError[] = [];
    const clearState = options.clearState !== false;

    try {
      const existing = await this.loadState();
      if (!existing) {
        return {
          success: true,
          removedClients: [],
          removedRuntimes: [],
          stateCleared: false,
          warnings: [
            {
              code: "NOT_INSTALLED",
              message: "BehalfID is not installed; nothing to uninstall.",
            },
          ],
          errors,
        };
      }

      const filterSet =
        options.clients !== undefined ? new Set(options.clients) : undefined;
      const clientsToRemove = existing.configuredClients.filter(
        (client) => filterSet === undefined || filterSet.has(client.clientId),
      );
      const runtimesToRemove =
        filterSet === undefined
          ? existing.registeredRuntimes
          : existing.registeredRuntimes;

      if (options.dryRun) {
        return {
          success: true,
          removedClients: clientsToRemove.map((client) => client.clientId),
          removedRuntimes: runtimesToRemove.map((runtime) => runtime.id),
          stateCleared: clearState && filterSet === undefined,
          warnings,
          errors,
        };
      }

      const transaction = new InstallTransaction(this.configManager);
      const removedClients: AiClientId[] = [];
      const serverName =
        existing.registeredRuntimes[0]?.serverName ??
        this.createRuntimeRegistration({ version: this.runtimeVersion }).serverName;

      try {
        for (const client of clientsToRemove) {
          await transaction.backup(client.mcpConfigPath);
          try {
            if (client.wrappedServers && client.wrappedServers.length > 0) {
              await this.restoreWrappedServersForClient(client);
            }
            await this.configManager.unregisterRuntime(client.mcpConfigPath, serverName);
            removedClients.push(client.clientId);
          } catch (error) {
            throw new InstallerException({
              code: "CONFIG_WRITE_FAILED",
              message: `Failed to unregister BehalfID from ${client.mcpConfigPath}`,
              cause: error,
              details: {
                clientId: client.clientId,
                mcpConfigPath: client.mcpConfigPath,
              },
              remediation: "Restore the configuration backup if the file was partially modified.",
            });
          }
        }

        const removedRuntimes: string[] = [];
        if (filterSet === undefined) {
          for (const runtime of existing.registeredRuntimes) {
            await this.runtimeRegistrar.unregister(runtime.id);
            removedRuntimes.push(runtime.id);
          }
        }

        let stateCleared = false;
        if (filterSet === undefined) {
          if (clearState) {
            await this.stateManager.clear();
            stateCleared = true;
          } else {
            const retained: InstallationState = {
              ...existing,
              updatedAt: new Date().toISOString(),
              configuredClients: [],
              registeredRuntimes: [],
            };
            await this.saveState(retained);
          }
        } else {
          const remainingClients = existing.configuredClients.filter(
            (client) => !removedClients.includes(client.clientId),
          );
          const nextState: InstallationState = {
            ...existing,
            updatedAt: new Date().toISOString(),
            configuredClients: remainingClients,
            registeredRuntimes: existing.registeredRuntimes,
          };
          await this.saveState(nextState);
        }

        return {
          success: true,
          removedClients,
          removedRuntimes,
          stateCleared,
          warnings,
          errors,
        };
      } catch (error) {
        const rollback = await transaction.rollback();
        warnings.push(...rollback.warnings);
        errors.push(toInstallerError(error, "INTERNAL_ERROR"), ...rollback.errors);
        return {
          success: false,
          removedClients: [],
          removedRuntimes: [],
          stateCleared: false,
          warnings,
          errors,
        };
      }
    } catch (error) {
      errors.push(toInstallerError(error, "INTERNAL_ERROR"));
      return {
        success: false,
        removedClients: [],
        removedRuntimes: [],
        stateCleared: false,
        warnings,
        errors,
      };
    }
  }

  private async configureClient(input: {
    client: DetectedClient;
    runtime: RuntimeRegistrationInput;
    force: boolean;
    transaction: InstallTransaction;
    warnings: OperationWarning[];
    wrapExisting?: boolean;
    wrapServers?: string[];
    agentId?: string;
    apiKey?: string;
    verifyEndpoint?: string;
  }): Promise<ConfiguredClientRecord> {
    const mcpConfigPath = input.client.configPaths.mcpConfigPath;
    if (!mcpConfigPath) {
      throw new InstallerException({
        code: "DETECTION_FAILED",
        message: `Client "${input.client.id}" is missing an MCP configuration path.`,
        details: { clientId: input.client.id },
      });
    }

    const alreadyPresent = await this.configManager.hasRuntime(
      mcpConfigPath,
      input.runtime.serverName,
    );

    if (alreadyPresent && !input.force && !input.wrapExisting) {
      input.warnings.push({
        code: "RUNTIME_ALREADY_REGISTERED",
        message: `BehalfID runtime already registered for ${input.client.id}; leaving configuration unchanged.`,
        details: { clientId: input.client.id, mcpConfigPath },
      });
      return {
        clientId: input.client.id,
        mcpConfigPath,
        configuredAt: new Date().toISOString(),
      };
    }

    await input.transaction.backup(mcpConfigPath);

    let wrappedServers: WrappedServerSnapshot[] | undefined;

    try {
      if (input.wrapExisting) {
        if (!input.agentId || !input.apiKey) {
          throw new InstallerException({
            code: "INTERNAL_ERROR",
            message: "wrapExisting requires agentId and apiKey",
          });
        }

        const existingConfig = await this.configManager.read(mcpConfigPath);
        const format = await this.resolveConfigFormat(mcpConfigPath, existingConfig);
        const wrapResult = wrapServersInConfig(existingConfig, format, {
          version: input.runtime.version,
          agentId: input.agentId,
          apiKey: input.apiKey,
          ...(input.verifyEndpoint !== undefined
            ? { verifyEndpoint: input.verifyEndpoint }
            : {}),
          ...(input.wrapServers !== undefined
            ? { serverNames: input.wrapServers }
            : {}),
          skipServerNames: [input.runtime.serverName],
        });

        for (const skipped of wrapResult.skipped) {
          input.warnings.push({
            code: "SERVER_WRAP_SKIPPED",
            message: `Skipped wrapping MCP server "${skipped.serverName}": ${skipped.reason}`,
            details: {
              clientId: input.client.id,
              serverName: skipped.serverName,
              reason: skipped.reason,
            },
          });
        }

        if (wrapResult.wrapped.length === 0) {
          input.warnings.push({
            code: "NO_SERVERS_WRAPPED",
            message: `No wrappable MCP servers found for ${input.client.id}; registering sibling BehalfID entry only.`,
            details: { clientId: input.client.id, mcpConfigPath },
          });
        }

        await this.configManager.write(mcpConfigPath, wrapResult.config);
        wrappedServers = wrapResult.wrapped.map((change) => ({
          serverName: change.serverName,
          original: change.original,
        }));
      }

      await this.configManager.registerRuntime(mcpConfigPath, input.runtime);
    } catch (error) {
      if (error instanceof InstallerException) {
        throw error;
      }
      throw new InstallerException({
        code: "RUNTIME_REGISTRATION_FAILED",
        message: `Failed to register BehalfID runtime for ${input.client.id}`,
        cause: error,
        details: { clientId: input.client.id, mcpConfigPath },
        remediation: "The installer will attempt to restore the previous configuration.",
      });
    }

    const record: ConfiguredClientRecord = {
      clientId: input.client.id,
      mcpConfigPath,
      configuredAt: new Date().toISOString(),
    };
    if (wrappedServers && wrappedServers.length > 0) {
      record.wrappedServers = wrappedServers;
    }
    return record;
  }

  private async restoreWrappedServersForClient(
    client: ConfiguredClientRecord,
  ): Promise<void> {
    if (!client.wrappedServers || client.wrappedServers.length === 0) {
      return;
    }
    const existing = await this.configManager.read(client.mcpConfigPath);
    const format = await this.resolveConfigFormat(client.mcpConfigPath, existing);
    const restored = restoreWrappedServers(existing, format, client.wrappedServers);
    await this.configManager.write(client.mcpConfigPath, restored);
  }

  private async resolveConfigFormat(
    configPath: string,
    config: import("../types/index.js").McpConfiguration,
  ) {
    const pathFormat = detectMcpConfigFormat(configPath);
    if (pathFormat === "codex-toml") {
      return pathFormat;
    }
    if (await pathExists(configPath)) {
      return refineMcpConfigFormat(pathFormat, config);
    }
    return pathFormat;
  }

  private async areClientsFullyConfigured(
    targets: DetectedClient[],
    state: InstallationState,
    serverName: string,
  ): Promise<boolean> {
    for (const client of targets) {
      const mcpConfigPath = client.configPaths.mcpConfigPath;
      if (!mcpConfigPath) {
        return false;
      }

      const inState = state.configuredClients.some(
        (entry) => entry.clientId === client.id && entry.mcpConfigPath === mcpConfigPath,
      );
      if (!inState) {
        return false;
      }

      const registered = await this.configManager.hasRuntime(mcpConfigPath, serverName);
      if (!registered) {
        return false;
      }
    }

    return targets.length > 0;
  }

  private clientsFromState(
    state: InstallationState,
    filter?: AiClientId[],
  ): DetectedClient[] {
    const filterSet = filter !== undefined ? new Set(filter) : undefined;
    return state.configuredClients
      .filter((client) => filterSet === undefined || filterSet.has(client.clientId))
      .map((client) => ({
        id: client.clientId,
        name: client.clientId,
        installed: true,
        configPaths: { mcpConfigPath: client.mcpConfigPath },
      }));
  }

  private buildInstallState(input: {
    existing: InstallationState | null;
    configuredClients: ConfiguredClientRecord[];
    registered: RegisteredRuntimeRecord;
    preserveInstalledAt?: boolean;
  }): InstallationState {
    const now = new Date().toISOString();
    const mergedClients = mergeConfiguredClients(
      input.existing?.configuredClients ?? [],
      input.configuredClients,
    );
    const mergedRuntimes = mergeRegisteredRuntimes(
      input.existing?.registeredRuntimes ?? [],
      input.registered,
    );

    if (input.existing && input.preserveInstalledAt) {
      return {
        schemaVersion: 1,
        installedVersion: this.runtimeVersion,
        installerVersion: this.installerVersion,
        installedAt: input.existing.installedAt,
        updatedAt: now,
        configuredClients: mergedClients,
        registeredRuntimes: mergedRuntimes,
      };
    }

    if (input.existing) {
      return {
        schemaVersion: 1,
        installedVersion: this.runtimeVersion,
        installerVersion: this.installerVersion,
        installedAt: input.existing.installedAt,
        updatedAt: now,
        configuredClients: mergedClients,
        registeredRuntimes: mergedRuntimes,
      };
    }

    return createInstallationState({
      installedVersion: this.runtimeVersion,
      installerVersion: this.installerVersion,
      configuredClients: mergedClients,
      registeredRuntimes: mergedRuntimes,
      installedAt: now,
      updatedAt: now,
    });
  }

  private async detectEnvironment() {
    try {
      return await this.detector.detectEnvironment();
    } catch (error) {
      throw new InstallerException({
        code: "DETECTION_FAILED",
        message: "Failed to detect host environment for installation.",
        cause: error,
        remediation: "Retry after ensuring AI clients are installed and accessible.",
      });
    }
  }

  private async loadState(): Promise<InstallationState | null> {
    try {
      return await this.stateManager.load();
    } catch (error) {
      throw new InstallerException({
        code: "STATE_READ_FAILED",
        message: "Failed to read installation state.",
        cause: error,
        remediation: "Inspect or remove the install-state.json file and retry.",
      });
    }
  }

  private async saveState(state: InstallationState): Promise<void> {
    try {
      await this.stateManager.save(state);
    } catch (error) {
      throw new InstallerException({
        code: "STATE_WRITE_FAILED",
        message: "Failed to persist installation state.",
        cause: error,
        remediation: "Ensure the BehalfID config directory is writable and retry.",
      });
    }
  }

  private toStatusResult(state: InstallationState | null): StatusResult {
    if (!state) {
      return {
        installed: false,
        installedVersion: null,
        installerVersion: this.installerVersion,
        installedAt: null,
        updatedAt: null,
        configuredClients: [],
        registeredRuntimes: [],
      };
    }

    return {
      installed: true,
      installedVersion: state.installedVersion,
      installerVersion: this.installerVersion,
      installedAt: state.installedAt,
      updatedAt: state.updatedAt,
      configuredClients: state.configuredClients,
      registeredRuntimes: state.registeredRuntimes,
    };
  }
}

function mergeConfiguredClients(
  existing: ConfiguredClientRecord[],
  updates: ConfiguredClientRecord[],
): ConfiguredClientRecord[] {
  const byId = new Map<AiClientId, ConfiguredClientRecord>();
  for (const entry of existing) {
    byId.set(entry.clientId, entry);
  }
  for (const entry of updates) {
    byId.set(entry.clientId, entry);
  }
  return [...byId.values()];
}

function mergeRegisteredRuntimes(
  existing: RegisteredRuntimeRecord[],
  update: RegisteredRuntimeRecord,
): RegisteredRuntimeRecord[] {
  const without = existing.filter((entry) => entry.id !== update.id);
  return [...without, update];
}

/** Convenience factory matching the {@link BehalfInstaller} constructor. */
export function createBehalfInstaller(
  deps: BehalfInstallerDependencies,
): BehalfInstaller {
  return new BehalfInstaller(deps);
}
