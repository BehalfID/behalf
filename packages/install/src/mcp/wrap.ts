import type { McpConfiguration, McpServerEntry } from "../types/index.js";
import {
  createDefaultRuntimeRegistration,
  DEFAULT_RUNTIME_PACKAGE,
  type CreateDefaultRuntimeRegistrationOptions,
} from "../installer/runtime.js";
import type { McpConfigFormat } from "./format.js";
import { getServerMap, setServerMap } from "./servers.js";

/** Marker env key proving an entry is already an interceptor wrap. */
export const WRAPPED_MARKER_ENV = "BEHALFID_DOWNSTREAM_COMMAND";

export type WrapServerOptions = {
  version: string;
  agentId: string;
  apiKey: string;
  verifyEndpoint?: string;
  packageName?: string;
  /** Logical server name used for BEHALFID_DOWNSTREAM_SERVER / MCP key. */
  serverName: string;
};

export type WrapServersOptions = Omit<WrapServerOptions, "serverName"> & {
  /**
   * When set, only wrap these server names.
   * When omitted, wrap every wrappable stdio server.
   */
  serverNames?: string[];
  /**
   * Server names to never wrap (e.g. unrelated control-plane entries).
   * Defaults to none — already-wrapped entries are always skipped.
   */
  skipServerNames?: string[];
};

export type WrappedServerChange = {
  serverName: string;
  original: McpServerEntry;
  wrapped: McpServerEntry;
};

export type WrapServersResult = {
  config: McpConfiguration;
  wrapped: WrappedServerChange[];
  skipped: Array<{ serverName: string; reason: string }>;
};

/**
 * Whether an MCP server entry can be fronted by the stdio interceptor.
 * URL/SSE-only servers are not wrappable in Phase 4.
 */
export function isWrappableServerEntry(entry: McpServerEntry): boolean {
  return typeof entry.command === "string" && entry.command.trim().length > 0;
}

/** Detect an entry already rewritten to launch `@behalfid/mcp-runtime`. */
export function isAlreadyWrapped(entry: McpServerEntry): boolean {
  const env = entry.env;
  if (env && typeof env[WRAPPED_MARKER_ENV] === "string" && env[WRAPPED_MARKER_ENV]) {
    return true;
  }
  const args = entry.args ?? [];
  return args.some(
    (arg) =>
      typeof arg === "string" &&
      (arg.includes("@behalfid/mcp-runtime") || arg === "behalfid-mcp-runtime"),
  );
}

/**
 * Rewrite a single stdio MCP server entry to launch the interceptor,
 * preserving the original command/args/env as BEHALFID_DOWNSTREAM_*.
 */
export function wrapServerEntry(
  original: McpServerEntry,
  options: WrapServerOptions,
): McpServerEntry {
  if (!isWrappableServerEntry(original)) {
    throw new Error(
      `Server "${options.serverName}" cannot be wrapped: missing stdio command`,
    );
  }

  const downstreamEnv =
    original.env && Object.keys(original.env).length > 0
      ? original.env
      : undefined;

  const registrationOptions: CreateDefaultRuntimeRegistrationOptions = {
    version: options.version,
    serverName: options.serverName,
    packageName: options.packageName ?? DEFAULT_RUNTIME_PACKAGE,
    agentId: options.agentId,
    apiKey: options.apiKey,
    downstreamCommand: original.command!,
    downstreamArgs: Array.isArray(original.args) ? [...original.args] : [],
    downstreamServer: options.serverName,
    ...(options.verifyEndpoint !== undefined
      ? { verifyEndpoint: options.verifyEndpoint }
      : {}),
    ...(downstreamEnv ? { downstreamEnv } : {}),
  };

  const runtime = createDefaultRuntimeRegistration(registrationOptions);
  // Format-agnostic entry; callers using vscode-json should set type via codec.
  return {
    command: runtime.command,
    args: [...runtime.args],
    env: { ...runtime.env },
  };
}

/**
 * Wrap wrappable servers in a configuration document in place (same keys).
 * Already-wrapped and non-stdio entries are skipped with reasons.
 */
export function wrapServersInConfig(
  config: McpConfiguration,
  format: McpConfigFormat,
  options: WrapServersOptions,
): WrapServersResult {
  const servers = getServerMap(config, format);
  const nextServers = { ...servers };
  const wrapped: WrappedServerChange[] = [];
  const skipped: Array<{ serverName: string; reason: string }> = [];
  const skipSet = new Set(options.skipServerNames ?? []);
  const filterSet =
    options.serverNames !== undefined ? new Set(options.serverNames) : undefined;

  for (const [name, entry] of Object.entries(servers)) {
    if (filterSet && !filterSet.has(name)) {
      continue;
    }
    if (skipSet.has(name)) {
      skipped.push({ serverName: name, reason: "listed in skipServerNames" });
      continue;
    }
    if (isAlreadyWrapped(entry)) {
      skipped.push({ serverName: name, reason: "already wrapped by mcp-runtime" });
      continue;
    }
    if (!isWrappableServerEntry(entry)) {
      skipped.push({
        serverName: name,
        reason: entry.url
          ? "url/SSE servers are not wrappable in Phase 4"
          : "missing stdio command",
      });
      continue;
    }

    const original = structuredClone(entry);
    const wrappedEntry = wrapServerEntry(original, {
      version: options.version,
      agentId: options.agentId,
      apiKey: options.apiKey,
      serverName: name,
      ...(options.verifyEndpoint !== undefined
        ? { verifyEndpoint: options.verifyEndpoint }
        : {}),
      ...(options.packageName !== undefined
        ? { packageName: options.packageName }
        : {}),
    });

    // Preserve VS Code type: stdio when present on original or format needs it
    if (format === "vscode-json" || original.type === "stdio") {
      wrappedEntry.type = "stdio";
    }

    nextServers[name] = wrappedEntry;
    wrapped.push({ serverName: name, original, wrapped: wrappedEntry });
  }

  return {
    config: setServerMap(config, format, nextServers),
    wrapped,
    skipped,
  };
}

/**
 * Restore previously wrapped servers from snapshots.
 */
export function restoreWrappedServers(
  config: McpConfiguration,
  format: McpConfigFormat,
  originals: Array<{ serverName: string; original: McpServerEntry }>,
): McpConfiguration {
  const servers = { ...getServerMap(config, format) };
  for (const { serverName, original } of originals) {
    servers[serverName] = structuredClone(original);
  }
  return setServerMap(config, format, servers);
}
