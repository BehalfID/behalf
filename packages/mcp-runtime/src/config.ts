/**
 * Environment / process config for the stdio MCP interceptor.
 */

export type InterceptorConfig = {
  apiKey: string;
  agentId: string;
  baseUrl: string;
  verifyUrl: string;
  verifyTimeoutMs: number;
  provider: string;
  downstream?: {
    serverName: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Load interceptor config from process.env.
 * Throws {@link ConfigError} when required auth env is missing.
 */
export function loadInterceptorConfig(
  env: NodeJS.ProcessEnv = process.env
): InterceptorConfig {
  const apiKey = trim(env.BEHALFID_API_KEY) ?? trim(env.BEHALF_API_KEY);
  const agentId = trim(env.BEHALFID_AGENT_ID) ?? trim(env.BEHALF_AGENT_ID);

  if (!apiKey) {
    throw new ConfigError(
      "Missing BEHALFID_API_KEY — interceptor cannot authorize without credentials"
    );
  }
  if (!agentId) {
    throw new ConfigError(
      "Missing BEHALFID_AGENT_ID — interceptor cannot authorize without an agent id"
    );
  }

  const baseUrl = (
    trim(env.BEHALFID_BASE_URL) ?? "https://behalfid.com"
  ).replace(/\/$/, "");
  const verifyUrl =
    trim(env.BEHALFID_VERIFY_URL) ?? `${baseUrl}/api/verify`;
  const verifyTimeoutMs = parsePositiveInt(
    env.BEHALFID_VERIFY_TIMEOUT_MS,
    5000
  );
  const provider = trim(env.BEHALFID_PROVIDER) ?? "mcp-interceptor";

  const command = trim(env.BEHALFID_DOWNSTREAM_COMMAND);
  let downstream: InterceptorConfig["downstream"];
  if (command) {
    downstream = {
      serverName: trim(env.BEHALFID_DOWNSTREAM_SERVER) ?? "downstream",
      command,
      args: parseArgsJson(env.BEHALFID_DOWNSTREAM_ARGS),
      env: parseEnvJson(env.BEHALFID_DOWNSTREAM_ENV),
    };
  }

  return {
    apiKey,
    agentId,
    baseUrl,
    verifyUrl,
    verifyTimeoutMs,
    provider,
    downstream,
  };
}

function trim(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseArgsJson(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
      throw new Error("expected JSON string array");
    }
    return parsed;
  } catch (err) {
    throw new ConfigError(
      `Invalid BEHALFID_DOWNSTREAM_ARGS: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function parseEnvJson(
  raw: string | undefined
): Record<string, string> | undefined {
  if (!raw || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !Object.values(parsed as Record<string, unknown>).every(
        (v) => typeof v === "string"
      )
    ) {
      throw new Error("expected JSON object of strings");
    }
    return parsed as Record<string, string>;
  } catch (err) {
    throw new ConfigError(
      `Invalid BEHALFID_DOWNSTREAM_ENV: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
