import type { McpConfigManager } from "../interfaces/McpConfigManager.js";
import type { StateManager } from "../interfaces/StateManager.js";
import type { Verifier } from "../interfaces/Verifier.js";
import { DEFAULT_VERIFY_ENDPOINT } from "../installer/runtime.js";
import { detectMcpConfigFormat } from "../mcp/format.js";
import { getServerMap } from "../mcp/servers.js";
import { BEHALF_MCP_SERVER_NAME } from "../types/index.js";
import type {
  DoctorCheck,
  DoctorOptions,
  DoctorReport,
  InstallationState,
} from "../types/index.js";
import { resolvePackageVersion } from "../version.js";
import { createCheck, isHealthy } from "./checks.js";
import { probeVerifyEndpoint, type FetchLike } from "./endpoint.js";

export interface InstallationVerifierOptions {
  stateManager: StateManager;
  configManager: McpConfigManager;
  /** Installer package version reported in doctor output. */
  installerVersion?: string;
  /** Default verify URL when options/state do not provide one. */
  defaultVerifyEndpoint?: string;
  /** MCP server name expected in client configuration. */
  serverName?: string;
  /** Injectable fetch for endpoint probes (tests). */
  fetchImpl?: FetchLike;
  /** Clock override for deterministic checkedAt. */
  now?: () => Date;
}

/**
 * Runs installation health checks and returns a machine-readable doctor report.
 */
export class InstallationVerifier implements Verifier {
  private readonly stateManager: StateManager;
  private readonly configManager: McpConfigManager;
  private readonly installerVersion: string;
  private readonly defaultVerifyEndpoint: string;
  private readonly serverName: string;
  private readonly fetchImpl: FetchLike | undefined;
  private readonly now: () => Date;

  constructor(options: InstallationVerifierOptions) {
    this.stateManager = options.stateManager;
    this.configManager = options.configManager;
    this.installerVersion = options.installerVersion ?? resolvePackageVersion();
    this.defaultVerifyEndpoint = options.defaultVerifyEndpoint ?? DEFAULT_VERIFY_ENDPOINT;
    this.serverName = options.serverName ?? BEHALF_MCP_SERVER_NAME;
    this.fetchImpl = options.fetchImpl;
    this.now = options.now ?? (() => new Date());
  }

  async verify(options: DoctorOptions = {}): Promise<DoctorReport> {
    const checkedAt = this.now().toISOString();
    const checks: DoctorCheck[] = [];
    const mcpRegistration: DoctorCheck[] = [];
    const configurationIntegrity: DoctorCheck[] = [];
    const packageVersions: Record<string, string> = {
      "@behalfid/install": this.installerVersion,
    };

    checks.push(
      createCheck(
        "installer-version",
        "Installer version",
        "pass",
        `Installer version ${this.installerVersion}`,
        { version: this.installerVersion },
      ),
    );

    let state: InstallationState | null = null;
    try {
      state = await this.stateManager.load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push(
        createCheck(
          "installation-state",
          "Installation state",
          "fail",
          `Failed to read installation state: ${message}`,
        ),
      );

      const verifyEndpoint = await this.probeEndpoint(
        options.verifyEndpoint ?? this.defaultVerifyEndpoint,
      );
      checks.push(verifyEndpoint);

      return {
        healthy: false,
        installerVersion: this.installerVersion,
        installedVersion: null,
        checkedAt,
        checks,
        runtimeInstalled: false,
        mcpRegistration,
        verifyEndpoint,
        packageVersions,
        configurationIntegrity,
      };
    }

    if (!state) {
      checks.push(
        createCheck(
          "installation-state",
          "Installation state",
          "warn",
          "BehalfID is not installed (no installation state found)",
        ),
      );
      checks.push(
        createCheck(
          "runtime-installed",
          "Runtime installed",
          "fail",
          "No registered runtimes — run install first",
        ),
      );
    } else {
      checks.push(
        createCheck(
          "installation-state",
          "Installation state",
          "pass",
          `Installation state present (installed ${state.installedVersion})`,
          {
            installedVersion: state.installedVersion,
            installedAt: state.installedAt,
            updatedAt: state.updatedAt,
          },
        ),
      );

      for (const runtime of state.registeredRuntimes) {
        packageVersions[runtime.packageName] = runtime.version;
      }

      const runtimeInstalled = state.registeredRuntimes.length > 0;
      checks.push(
        createCheck(
          "runtime-installed",
          "Runtime installed",
          runtimeInstalled ? "pass" : "fail",
          runtimeInstalled
            ? `Registered runtimes: ${state.registeredRuntimes.map((entry) => entry.id).join(", ")}`
            : "Installation state exists but no runtimes are registered",
          {
            runtimes: state.registeredRuntimes.map((entry) => ({
              id: entry.id,
              version: entry.version,
              packageName: entry.packageName,
            })),
          },
        ),
      );

      for (const client of state.configuredClients) {
        const registrationCheck = await this.checkClientRegistration(client);
        mcpRegistration.push(registrationCheck);
        checks.push(registrationCheck);

        const integrityCheck = await this.checkConfigurationIntegrity(client);
        configurationIntegrity.push(integrityCheck);
        checks.push(integrityCheck);
      }

      if (state.configuredClients.length === 0) {
        const empty = createCheck(
          "mcp-registration",
          "MCP registration",
          "warn",
          "No configured AI clients recorded in installation state",
        );
        mcpRegistration.push(empty);
        checks.push(empty);
      }
    }

    const endpointUrl =
      options.verifyEndpoint ??
      this.resolveEndpointFromState(state) ??
      this.defaultVerifyEndpoint;
    const verifyEndpoint = await this.probeEndpoint(endpointUrl);
    checks.push(verifyEndpoint);

    const runtimeInstalled = (state?.registeredRuntimes.length ?? 0) > 0;

    return {
      healthy: isHealthy(checks),
      installerVersion: this.installerVersion,
      installedVersion: state?.installedVersion ?? null,
      checkedAt,
      checks,
      runtimeInstalled,
      mcpRegistration,
      verifyEndpoint,
      packageVersions,
      configurationIntegrity,
    };
  }

  private resolveEndpointFromState(state: InstallationState | null): string | undefined {
    if (!state) {
      return undefined;
    }
    for (const runtime of state.registeredRuntimes) {
      const endpoint = runtime.metadata?.verifyEndpoint;
      if (typeof endpoint === "string" && endpoint.length > 0) {
        return endpoint;
      }
    }
    return undefined;
  }

  private async probeEndpoint(url: string): Promise<DoctorCheck> {
    return probeVerifyEndpoint({
      url,
      ...(this.fetchImpl !== undefined ? { fetchImpl: this.fetchImpl } : {}),
    });
  }

  private async checkClientRegistration(client: {
    clientId: string;
    mcpConfigPath: string;
  }): Promise<DoctorCheck> {
    try {
      const registered = await this.configManager.hasRuntime(
        client.mcpConfigPath,
        this.serverName,
      );
      return createCheck(
        `mcp-registration:${client.clientId}`,
        `MCP registration (${client.clientId})`,
        registered ? "pass" : "fail",
        registered
          ? `BehalfID runtime registered for ${client.clientId}`
          : `BehalfID runtime missing from ${client.clientId} MCP configuration`,
        {
          clientId: client.clientId,
          mcpConfigPath: client.mcpConfigPath,
          serverName: this.serverName,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createCheck(
        `mcp-registration:${client.clientId}`,
        `MCP registration (${client.clientId})`,
        "fail",
        `Failed to inspect MCP registration for ${client.clientId}: ${message}`,
        {
          clientId: client.clientId,
          mcpConfigPath: client.mcpConfigPath,
        },
      );
    }
  }

  private async checkConfigurationIntegrity(client: {
    clientId: string;
    mcpConfigPath: string;
  }): Promise<DoctorCheck> {
    try {
      const config = await this.configManager.read(client.mcpConfigPath);
      const format = detectMcpConfigFormat(client.mcpConfigPath);
      const servers = getServerMap(config, format);
      const entry = servers[this.serverName];

      if (!entry) {
        return createCheck(
          `config-integrity:${client.clientId}`,
          `Configuration integrity (${client.clientId})`,
          "fail",
          `No BehalfID server entry found in ${client.mcpConfigPath}`,
          { clientId: client.clientId, mcpConfigPath: client.mcpConfigPath },
        );
      }

      if (typeof entry.command !== "string" || entry.command.length === 0) {
        return createCheck(
          `config-integrity:${client.clientId}`,
          `Configuration integrity (${client.clientId})`,
          "fail",
          `BehalfID server entry for ${client.clientId} is missing a command`,
          { clientId: client.clientId, mcpConfigPath: client.mcpConfigPath },
        );
      }

      return createCheck(
        `config-integrity:${client.clientId}`,
        `Configuration integrity (${client.clientId})`,
        "pass",
        `BehalfID server entry for ${client.clientId} looks valid`,
        {
          clientId: client.clientId,
          mcpConfigPath: client.mcpConfigPath,
          command: entry.command,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createCheck(
        `config-integrity:${client.clientId}`,
        `Configuration integrity (${client.clientId})`,
        "fail",
        `Failed to validate configuration for ${client.clientId}: ${message}`,
        {
          clientId: client.clientId,
          mcpConfigPath: client.mcpConfigPath,
        },
      );
    }
  }
}
export function createInstallationVerifier(
  options: InstallationVerifierOptions,
): InstallationVerifier {
  return new InstallationVerifier(options);
}
