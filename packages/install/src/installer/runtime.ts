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
    },
    metadata: {
      kind: "mcp-runtime",
      verifyEndpoint,
    },
  };
}
