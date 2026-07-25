import {
  BEHALF_MCP_SERVER_NAME,
  type RuntimeRegistrationInput,
} from "../types/index.js";

/** Logical runtime id recorded in installer state. */
export const DEFAULT_RUNTIME_ID = "mcp-runtime";

/** npm package registered as the BehalfID MCP runtime. */
export const DEFAULT_RUNTIME_PACKAGE = "@behalfid/mcp-runtime";

/** Default BehalfID API base URL. */
export const DEFAULT_BEHALF_BASE_URL = "https://behalfid.com";

/** Default verify endpoint used when none is provided. */
export const DEFAULT_VERIFY_ENDPOINT = `${DEFAULT_BEHALF_BASE_URL}/api/verify`;

export interface CreateDefaultRuntimeRegistrationOptions {
  /** Runtime package version to register. */
  version: string;
  /** Override verify endpoint written into runtime env. */
  verifyEndpoint?: string;
  /** Override MCP server name. Defaults to {@link BEHALF_MCP_SERVER_NAME}. */
  serverName?: string;
  /** Override runtime id. Defaults to {@link DEFAULT_RUNTIME_ID}. */
  id?: string;
  /** Override package name. Defaults to {@link DEFAULT_RUNTIME_PACKAGE}. */
  packageName?: string;
  /** BehalfID agent id injected into runtime env (Phase 4 wiring). */
  agentId?: string;
  /** BehalfID API key injected into runtime env (prefer secret injection). */
  apiKey?: string;
  /** Downstream MCP command to wrap (Phase 2/3 interceptor). */
  downstreamCommand?: string;
  /** Downstream MCP args (JSON-serialized into env). */
  downstreamArgs?: string[];
  /** Logical downstream server name for tool namespacing. */
  downstreamServer?: string;
  /** Env vars forwarded to the downstream MCP process (JSON in BEHALFID_DOWNSTREAM_ENV). */
  downstreamEnv?: Record<string, string>;
}

/**
 * Build the default `@behalfid/mcp-runtime` registration payload.
 * Future runtimes can supply alternate factories without changing the installer core.
 */
export function createDefaultRuntimeRegistration(
  options: CreateDefaultRuntimeRegistrationOptions,
): RuntimeRegistrationInput {
  const verifyEndpoint = options.verifyEndpoint ?? DEFAULT_VERIFY_ENDPOINT;
  const serverName = options.serverName ?? BEHALF_MCP_SERVER_NAME;
  const id = options.id ?? DEFAULT_RUNTIME_ID;
  const packageName = options.packageName ?? DEFAULT_RUNTIME_PACKAGE;

  return {
    id,
    packageName,
    version: options.version,
    serverName,
    command: "npx",
    args: ["-y", `${packageName}@${options.version}`],
    env: {
      BEHALFID_VERIFY_URL: verifyEndpoint,
      BEHALFID_BASE_URL: DEFAULT_BEHALF_BASE_URL,
      // Hosts must supply credentials at install/configure time (or via secret injection).
      // Placeholders document the required contract for the stdio interceptor.
      ...(options.agentId ? { BEHALFID_AGENT_ID: options.agentId } : {}),
      ...(options.apiKey ? { BEHALFID_API_KEY: options.apiKey } : {}),
      ...(options.downstreamCommand
        ? {
            BEHALFID_DOWNSTREAM_COMMAND: options.downstreamCommand,
            ...(options.downstreamArgs
              ? {
                  BEHALFID_DOWNSTREAM_ARGS: JSON.stringify(options.downstreamArgs),
                }
              : {}),
            ...(options.downstreamServer
              ? { BEHALFID_DOWNSTREAM_SERVER: options.downstreamServer }
              : {}),
            ...(options.downstreamEnv
              ? {
                  BEHALFID_DOWNSTREAM_ENV: JSON.stringify(options.downstreamEnv),
                }
              : {}),
          }
        : {}),
    },
    metadata: {
      kind: "mcp-runtime",
      verifyEndpoint,
      phase: options.downstreamCommand ? "wrapped-interceptor" : "stdio-interceptor",
    },
  };
}
