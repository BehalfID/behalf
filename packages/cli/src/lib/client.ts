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
        throw new Error(`Request timed out after ${timeoutMs}ms.`);
      }
      throw new Error("Network request failed. Check your connection and base URL.");
    }

    if (opts.onHeaders) opts.onHeaders(response.headers);

    const body = await response.json().catch(() => null);
    if (controller?.signal.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }

    if (!response.ok) {
      const message =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as Record<string, unknown>).error === "string"
          ? (body as Record<string, string>).error
          : `Request failed with status ${response.status}.`;
      throw new Error(message);
    }

    if (body === null) throw new Error("Expected JSON response.");

    return body as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
