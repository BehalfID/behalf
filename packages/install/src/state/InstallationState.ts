import {
  INSTALLATION_STATE_SCHEMA_VERSION,
  type AiClientId,
  type ConfiguredClientRecord,
  type InstallationState,
  type McpServerEntry,
  type RegisteredRuntimeRecord,
} from "../types/index.js";

const AI_CLIENT_IDS = new Set<AiClientId>([
  "cursor",
  "claude-code",
  "claude-desktop",
  "codex",
  "vscode",
  "windsurf",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isAiClientId(value: unknown): value is AiClientId {
  return typeof value === "string" && AI_CLIENT_IDS.has(value as AiClientId);
}

function parseWrappedServers(
  value: unknown,
  clientIndex: number,
): ConfiguredClientRecord["wrappedServers"] {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(
      `configuredClients[${clientIndex}].wrappedServers must be an array when present`,
    );
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(
        `configuredClients[${clientIndex}].wrappedServers[${index}] must be an object`,
      );
    }
    if (!isNonEmptyString(entry.serverName)) {
      throw new Error(
        `configuredClients[${clientIndex}].wrappedServers[${index}].serverName must be a non-empty string`,
      );
    }
    if (!isRecord(entry.original)) {
      throw new Error(
        `configuredClients[${clientIndex}].wrappedServers[${index}].original must be an object`,
      );
    }
    return {
      serverName: entry.serverName,
      original: { ...(entry.original as McpServerEntry) },
    };
  });
}

function parseConfiguredClient(value: unknown, index: number): ConfiguredClientRecord {
  if (!isRecord(value)) {
    throw new Error(`configuredClients[${index}] must be an object`);
  }
  if (!isAiClientId(value.clientId)) {
    throw new Error(`configuredClients[${index}].clientId is invalid`);
  }
  if (!isNonEmptyString(value.mcpConfigPath)) {
    throw new Error(`configuredClients[${index}].mcpConfigPath must be a non-empty string`);
  }
  if (!isNonEmptyString(value.configuredAt)) {
    throw new Error(`configuredClients[${index}].configuredAt must be a non-empty string`);
  }
  const record: ConfiguredClientRecord = {
    clientId: value.clientId,
    mcpConfigPath: value.mcpConfigPath,
    configuredAt: value.configuredAt,
  };
  const wrappedServers = parseWrappedServers(value.wrappedServers, index);
  if (wrappedServers !== undefined) {
    record.wrappedServers = wrappedServers;
  }
  return record;
}

function parseRegisteredRuntime(value: unknown, index: number): RegisteredRuntimeRecord {
  if (!isRecord(value)) {
    throw new Error(`registeredRuntimes[${index}] must be an object`);
  }
  if (!isNonEmptyString(value.id)) {
    throw new Error(`registeredRuntimes[${index}].id must be a non-empty string`);
  }
  if (!isNonEmptyString(value.packageName)) {
    throw new Error(`registeredRuntimes[${index}].packageName must be a non-empty string`);
  }
  if (!isNonEmptyString(value.version)) {
    throw new Error(`registeredRuntimes[${index}].version must be a non-empty string`);
  }
  if (!isNonEmptyString(value.serverName)) {
    throw new Error(`registeredRuntimes[${index}].serverName must be a non-empty string`);
  }
  if (!isNonEmptyString(value.registeredAt)) {
    throw new Error(`registeredRuntimes[${index}].registeredAt must be a non-empty string`);
  }

  const record: RegisteredRuntimeRecord = {
    id: value.id,
    packageName: value.packageName,
    version: value.version,
    serverName: value.serverName,
    registeredAt: value.registeredAt,
  };

  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) {
      throw new Error(`registeredRuntimes[${index}].metadata must be an object when present`);
    }
    record.metadata = value.metadata;
  }

  return record;
}

/**
 * Validate and normalize an unknown JSON value into InstallationState.
 * Throws when the document is malformed.
 */
export function parseInstallationState(value: unknown): InstallationState {
  if (!isRecord(value)) {
    throw new Error("Installation state must be a JSON object");
  }

  if (value.schemaVersion !== INSTALLATION_STATE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported installation state schemaVersion: ${String(value.schemaVersion)}`,
    );
  }
  if (!isNonEmptyString(value.installedVersion)) {
    throw new Error("installedVersion must be a non-empty string");
  }
  if (!isNonEmptyString(value.installerVersion)) {
    throw new Error("installerVersion must be a non-empty string");
  }
  if (!isNonEmptyString(value.installedAt)) {
    throw new Error("installedAt must be a non-empty string");
  }
  if (!isNonEmptyString(value.updatedAt)) {
    throw new Error("updatedAt must be a non-empty string");
  }
  if (!Array.isArray(value.configuredClients)) {
    throw new Error("configuredClients must be an array");
  }
  if (!Array.isArray(value.registeredRuntimes)) {
    throw new Error("registeredRuntimes must be an array");
  }

  return {
    schemaVersion: INSTALLATION_STATE_SCHEMA_VERSION,
    installedVersion: value.installedVersion,
    installerVersion: value.installerVersion,
    installedAt: value.installedAt,
    updatedAt: value.updatedAt,
    configuredClients: value.configuredClients.map(parseConfiguredClient),
    registeredRuntimes: value.registeredRuntimes.map(parseRegisteredRuntime),
  };
}

/** Create a new installation state document with the current timestamp. */
export function createInstallationState(input: {
  installedVersion: string;
  installerVersion: string;
  configuredClients?: ConfiguredClientRecord[];
  registeredRuntimes?: RegisteredRuntimeRecord[];
  installedAt?: string;
  updatedAt?: string;
}): InstallationState {
  const now = new Date().toISOString();
  return {
    schemaVersion: INSTALLATION_STATE_SCHEMA_VERSION,
    installedVersion: input.installedVersion,
    installerVersion: input.installerVersion,
    installedAt: input.installedAt ?? now,
    updatedAt: input.updatedAt ?? now,
    configuredClients: input.configuredClients ?? [],
    registeredRuntimes: input.registeredRuntimes ?? [],
  };
}
