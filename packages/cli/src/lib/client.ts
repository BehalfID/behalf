import { readConfig, readSession } from "./config.js";

export const DEFAULT_BASE_URL = "https://behalfid.com";

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  apiKey?: string;
  developerToken?: string;
  baseUrl?: string;
  skipAuth?: boolean;
  onHeaders?: (headers: Headers) => void;
  /** Abort the request if it takes longer than this many milliseconds. */
  timeoutMs?: number;
};

/** Error with an optional actionable hint for CLI display. */
export class ApiError extends Error {
  hint?: string;
  code?: string;
  status?: number;

  constructor(message: string, opts: { hint?: string; code?: string; status?: number } = {}) {
    super(message);
    this.name = "ApiError";
    this.hint = opts.hint;
    this.code = opts.code;
    this.status = opts.status;
  }
}

export function resolveBaseUrl(override?: string): string {
  const config = readConfig();
  return (
    override ??
    process.env.BEHALFID_BASE_URL ??
    config.baseUrl ??
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
}

export function resolveApiKey(override?: string): string | undefined {
  const config = readConfig();
  return override ?? process.env.BEHALFID_API_KEY ?? config.apiKey;
}

export function originOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl;
  }
}

function authHint(hadApiKey: boolean, hadSession: boolean): string {
  if (!hadApiKey && !hadSession) {
    return "Run `behalf login`, or set an API key with `behalf config set api-key <key>`.";
  }
  if (hadSession && !hadApiKey) {
    return "Session may have expired. Run `behalf login` again, or pass --api-key.";
  }
  return "Check the API key (`behalf config set api-key <key>`) or run `behalf login`.";
}

function networkHint(baseUrl: string): string {
  return `Check connectivity and base URL (currently ${baseUrl}). Try \`behalf config get base-url\` or set BEHALFID_BASE_URL.`;
}

export async function apiRequest<T = unknown>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const apiKey = opts.skipAuth ? undefined : opts.apiKey ?? resolveApiKey();
  const session = opts.skipAuth ? null : readSession();

  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: originOf(baseUrl),
  };

  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (opts.developerToken) headers["x-developer-token"] = opts.developerToken;
  if (session) headers.Cookie = session;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const timeoutMs = opts.timeoutMs;
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer =
    controller && timeoutMs
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller?.signal,
      });
    } catch {
      if (controller?.signal.aborted) {
        throw new ApiError(`Request timed out after ${timeoutMs}ms.`, {
          code: "timeout",
          hint: networkHint(baseUrl),
        });
      }
      throw new ApiError("Network request failed.", {
        code: "network",
        hint: networkHint(baseUrl),
      });
    }

    if (opts.onHeaders) opts.onHeaders(response.headers);

    const body = await response.json().catch(() => null);
    if (controller?.signal.aborted) {
      throw new ApiError(`Request timed out after ${timeoutMs}ms.`, {
        code: "timeout",
        hint: networkHint(baseUrl),
      });
    }

    if (!response.ok) {
      const record =
        typeof body === "object" && body !== null
          ? (body as Record<string, unknown>)
          : null;
      const serverMessage =
        typeof record?.error === "string" ? record.error : null;
      const serverCode =
        typeof record?.code === "string" ? record.code : undefined;
      // Prefer explicit hint, then quota upgradeHint / installer remediation.
      const serverHint =
        typeof record?.hint === "string"
          ? record.hint
          : typeof record?.upgradeHint === "string"
            ? record.upgradeHint
            : typeof record?.remediation === "string"
              ? record.remediation
              : undefined;

      if (response.status === 401 || response.status === 403) {
        throw new ApiError(serverMessage ?? `Authentication failed (HTTP ${response.status}).`, {
          status: response.status,
          code: serverCode ?? "auth",
          hint: serverHint ?? authHint(Boolean(apiKey), Boolean(session)),
        });
      }

      throw new ApiError(
        serverMessage ?? `Request failed with status ${response.status}.`,
        {
          status: response.status,
          code: serverCode ?? "http_error",
          hint:
            serverHint ??
            (response.status >= 500
              ? `Server error from ${baseUrl}. Retry shortly, or check behalf health.`
              : undefined),
        }
      );
    }

    if (body === null) throw new ApiError("Expected JSON response.", { code: "bad_response" });

    return body as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}