/**
 * Shared Ollama client helpers for permission drafting and optional agent
 * runtime convenience (Track B). Inference here is NOT an enforcement tier —
 * tool policy still goes through verify()/MCP/SDK.
 */

import { validatePublicUrl } from "@/lib/ssrf";

export type OllamaEnvConfig = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Optional bearer token for scripts/ollama-secure-proxy.js. Never expose to the browser. */
  proxyToken: string;
};

export type OllamaEndpoint = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  proxyToken: string;
  /** True when baseUrl/model came from agent fields rather than env defaults. */
  fromAgent: boolean;
};

export type OllamaDiagCode =
  | "NOT_CONFIGURED"
  | "LOCALHOST_IN_PRODUCTION"
  | "UNREACHABLE"
  | "TIMEOUT"
  | "MODEL_NOT_FOUND"
  | "INVALID_RESPONSE"
  | "OLLAMA_ERROR"
  | "OLLAMA_PROXY_AUTH_FAILED"
  | "PAYLOAD_TOO_LARGE";

export class OllamaClientError extends Error {
  readonly code: OllamaDiagCode;
  readonly details: string;
  readonly httpStatus: number;
  readonly extra?: Record<string, unknown>;

  constructor(
    code: OllamaDiagCode,
    error: string,
    details: string,
    httpStatus = 503,
    extra?: Record<string, unknown>
  ) {
    super(error);
    this.name = "OllamaClientError";
    this.code = code;
    this.details = details;
    this.httpStatus = httpStatus;
    this.extra = extra;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const TAGS_TIMEOUT_MS = 5_000;
const MAX_CHAT_BODY_BYTES = 256_000;
const MAX_MESSAGES = 40;

export function readOllamaEnvConfig(): OllamaEnvConfig {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL ?? "").trim(),
    model: (process.env.OLLAMA_MODEL ?? "").trim(),
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS)),
    proxyToken: process.env.OLLAMA_PROXY_TOKEN ?? ""
  };
}

export function ollamaAuthHeaders(proxyToken: string): Record<string, string> {
  return proxyToken ? { Authorization: `Bearer ${proxyToken}` } : {};
}

export function isLocalhostOllamaUrl(baseUrl: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(baseUrl);
}

/**
 * Resolve the Ollama endpoint for an agent: prefer per-agent fields, then env.
 */
export function resolveOllamaEndpoint(agent?: {
  ollamaBaseUrl?: string | null;
  ollamaModel?: string | null;
}): OllamaEndpoint {
  const env = readOllamaEnvConfig();
  const agentBase = agent?.ollamaBaseUrl?.trim() || "";
  const agentModel = agent?.ollamaModel?.trim() || "";
  const baseUrl = agentBase || env.baseUrl;
  const model = agentModel || env.model;
  return {
    baseUrl,
    model,
    timeoutMs: Number.isFinite(env.timeoutMs) && env.timeoutMs > 0 ? env.timeoutMs : DEFAULT_TIMEOUT_MS,
    proxyToken: env.proxyToken,
    fromAgent: Boolean(agentBase || agentModel)
  };
}

/**
 * Production SSRF + localhost guard matching draft-permissions behavior.
 * Dev/test may use localhost without DNS validation.
 */
export async function assertOllamaEndpointAllowed(baseUrl: string): Promise<void> {
  if (!baseUrl) {
    throw new OllamaClientError(
      "NOT_CONFIGURED",
      "Ollama endpoint is not configured.",
      "Set ollamaBaseUrl on the agent, or OLLAMA_BASE_URL in the server environment."
    );
  }

  if (process.env.NODE_ENV !== "production") return;

  if (isLocalhostOllamaUrl(baseUrl)) {
    throw new OllamaClientError(
      "LOCALHOST_IN_PRODUCTION",
      "Ollama is configured as localhost in production.",
      "In production, localhost points to the app server, not your machine. Use a secure reachable Ollama proxy."
    );
  }

  try {
    await validatePublicUrl(baseUrl, { requireHttpsInProd: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "URL is not allowed.";
    throw new OllamaClientError(
      "UNREACHABLE",
      "Ollama endpoint is not allowed.",
      `The configured Ollama endpoint failed validation: ${reason}`
    );
  }
}

export async function fetchOllamaTags(
  baseUrl: string,
  proxyToken: string,
  timeoutMs = TAGS_TIMEOUT_MS
): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
    headers: ollamaAuthHeaders(proxyToken),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (res.status === 401 || res.status === 403) {
    throw new OllamaClientError(
      "OLLAMA_PROXY_AUTH_FAILED",
      "Ollama proxy rejected the request.",
      "Check that OLLAMA_PROXY_TOKEN is set correctly in BehalfID and on the proxy server."
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OllamaClientError(
      "OLLAMA_ERROR",
      "Ollama returned an error.",
      text ? text.slice(0, 300) : `HTTP ${res.status} from Ollama.`
    );
  }

  const data = (await res.json()) as { models?: { name: string }[] };
  return data.models?.map((m) => m.name) ?? [];
}

export function modelIsAvailable(configuredModel: string, availableModels: string[]): boolean {
  if (!configuredModel) return false;
  if (availableModels.includes(configuredModel)) return true;
  const prefix = `${configuredModel}:`;
  return availableModels.some((name) => name === configuredModel || name.startsWith(prefix));
}

export type OllamaConnectionResult = {
  ok: true;
  baseUrl: string;
  model: string;
  fromAgent: boolean;
  availableModels: string[];
};

/**
 * Tags check + configured model presence. Throws OllamaClientError on failure.
 */
export async function testOllamaConnection(agent?: {
  ollamaBaseUrl?: string | null;
  ollamaModel?: string | null;
}): Promise<OllamaConnectionResult> {
  const endpoint = resolveOllamaEndpoint(agent);
  if (!endpoint.baseUrl || !endpoint.model) {
    throw new OllamaClientError(
      "NOT_CONFIGURED",
      "Ollama is not configured.",
      "Set ollamaBaseUrl and ollamaModel on the agent, or OLLAMA_BASE_URL and OLLAMA_MODEL in the server environment."
    );
  }

  await assertOllamaEndpointAllowed(endpoint.baseUrl);

  let availableModels: string[];
  try {
    availableModels = await fetchOllamaTags(endpoint.baseUrl, endpoint.proxyToken);
  } catch (err) {
    if (err instanceof OllamaClientError) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new OllamaClientError(
        "TIMEOUT",
        "Ollama timed out.",
        `Ollama did not respond within ${TAGS_TIMEOUT_MS / 1000}s.`
      );
    }
    throw new OllamaClientError(
      "UNREACHABLE",
      "Ollama is not reachable.",
      err instanceof Error ? err.message : "Could not reach the configured Ollama endpoint."
    );
  }

  if (!modelIsAvailable(endpoint.model, availableModels)) {
    throw new OllamaClientError(
      "MODEL_NOT_FOUND",
      "Configured Ollama model is not available.",
      `Run \`ollama pull ${endpoint.model}\` on the machine running Ollama, or change the model name.`,
      503,
      { configuredModel: endpoint.model, availableModels }
    );
  }

  return {
    ok: true,
    baseUrl: endpoint.baseUrl,
    model: endpoint.model,
    fromAgent: endpoint.fromAgent,
    availableModels
  };
}

export type OllamaChatMessage = {
  role: string;
  content: string;
};

export type OllamaChatResult = {
  message: { role: string; content: string; tool_calls?: unknown };
  model: string;
  raw: unknown;
};

/**
 * Convenience chat proxy to an operator-configured Ollama endpoint.
 * Does not evaluate permissions — callers must still verify tool actions.
 */
export async function proxyOllamaChat(
  agent: { ollamaBaseUrl?: string | null; ollamaModel?: string | null } | undefined,
  input: {
    messages: OllamaChatMessage[];
    model?: string;
    tools?: unknown;
    stream?: boolean;
  }
): Promise<OllamaChatResult> {
  const endpoint = resolveOllamaEndpoint(agent);
  const model = (input.model?.trim() || endpoint.model).trim();

  if (!endpoint.baseUrl || !model) {
    throw new OllamaClientError(
      "NOT_CONFIGURED",
      "Ollama is not configured.",
      "Set ollamaBaseUrl and ollamaModel on the agent, or OLLAMA_BASE_URL and OLLAMA_MODEL in the server environment."
    );
  }

  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new OllamaClientError(
      "INVALID_RESPONSE",
      "Invalid chat request.",
      "messages must be a non-empty array.",
      400
    );
  }

  if (input.messages.length > MAX_MESSAGES) {
    throw new OllamaClientError(
      "PAYLOAD_TOO_LARGE",
      "Chat payload is too large.",
      `At most ${MAX_MESSAGES} messages are allowed.`,
      413
    );
  }

  if (input.stream === true) {
    throw new OllamaClientError(
      "INVALID_RESPONSE",
      "Streaming is not supported.",
      "Set stream to false. The convenience proxy only supports non-streaming chat.",
      400
    );
  }

  await assertOllamaEndpointAllowed(endpoint.baseUrl);

  const body = JSON.stringify({
    model,
    stream: false,
    messages: input.messages,
    ...(input.tools !== undefined ? { tools: input.tools } : {})
  });

  if (Buffer.byteLength(body, "utf8") > MAX_CHAT_BODY_BYTES) {
    throw new OllamaClientError(
      "PAYLOAD_TOO_LARGE",
      "Chat payload is too large.",
      `Request body must be ${MAX_CHAT_BODY_BYTES} bytes or fewer.`,
      413
    );
  }

  try {
    const res = await fetch(`${endpoint.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ollamaAuthHeaders(endpoint.proxyToken) },
      body,
      signal: AbortSignal.timeout(endpoint.timeoutMs)
    });

    if (res.status === 401 || res.status === 403) {
      throw new OllamaClientError(
        "OLLAMA_PROXY_AUTH_FAILED",
        "Ollama proxy rejected the request.",
        "Check that OLLAMA_PROXY_TOKEN is set correctly in BehalfID and on the proxy server."
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const lowerText = text.toLowerCase();
      const isModelMissing =
        res.status === 404 ||
        lowerText.includes("not found") ||
        (lowerText.includes("model") && lowerText.includes("not"));
      if (isModelMissing) {
        throw new OllamaClientError(
          "MODEL_NOT_FOUND",
          "Configured Ollama model is not available.",
          text ? text.slice(0, 300) : `HTTP ${res.status} from Ollama.`,
          503,
          { configuredModel: model }
        );
      }
      throw new OllamaClientError(
        "OLLAMA_ERROR",
        "Ollama returned an error.",
        text ? text.slice(0, 300) : `HTTP ${res.status} from Ollama.`
      );
    }

    const data = (await res.json()) as {
      message?: { role?: string; content?: string; tool_calls?: unknown };
      model?: string;
      error?: string;
    };

    if (data.error) {
      throw new OllamaClientError("OLLAMA_ERROR", "Ollama returned an error.", String(data.error));
    }

    if (!data.message || typeof data.message.content !== "string") {
      throw new OllamaClientError(
        "INVALID_RESPONSE",
        "Ollama returned an invalid response.",
        "Expected a message.content string from /api/chat."
      );
    }

    return {
      message: {
        role: data.message.role ?? "assistant",
        content: data.message.content,
        ...(data.message.tool_calls !== undefined ? { tool_calls: data.message.tool_calls } : {})
      },
      model: data.model ?? model,
      raw: data
    };
  } catch (err) {
    if (err instanceof OllamaClientError) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new OllamaClientError(
        "TIMEOUT",
        "Ollama timed out.",
        `Ollama did not respond within ${endpoint.timeoutMs / 1000}s. Increase OLLAMA_TIMEOUT_MS if needed.`
      );
    }
    throw new OllamaClientError(
      "UNREACHABLE",
      "Ollama is not reachable.",
      err instanceof Error ? err.message : "Could not reach the configured Ollama endpoint."
    );
  }
}

/** Validate optional agent PATCH fields for Ollama runtime config. */
export async function parseOllamaRuntimeFields(body: Record<string, unknown>): Promise<
  | { ok: true; update: { ollamaBaseUrl?: string | null; ollamaModel?: string | null } }
  | { ok: false; error: string }
> {
  const update: { ollamaBaseUrl?: string | null; ollamaModel?: string | null } = {};

  if (body.ollamaBaseUrl !== undefined) {
    if (body.ollamaBaseUrl === null || body.ollamaBaseUrl === "") {
      update.ollamaBaseUrl = null;
    } else if (typeof body.ollamaBaseUrl !== "string") {
      return { ok: false, error: "ollamaBaseUrl must be a string or null." };
    } else {
      const trimmed = body.ollamaBaseUrl.trim();
      if (trimmed.length > 500) return { ok: false, error: "ollamaBaseUrl must be 500 characters or fewer." };
      try {
        const url = new URL(trimmed);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return { ok: false, error: "ollamaBaseUrl must use http:// or https://." };
        }
      } catch {
        return { ok: false, error: "ollamaBaseUrl must be a valid absolute URL." };
      }
      if (process.env.NODE_ENV === "production") {
        try {
          await assertOllamaEndpointAllowed(trimmed);
        } catch (err) {
          if (err instanceof OllamaClientError) {
            return { ok: false, error: `${err.message} ${err.details}` };
          }
          return { ok: false, error: "ollamaBaseUrl failed validation." };
        }
      }
      update.ollamaBaseUrl = trimmed.replace(/\/$/, "");
    }
  }

  if (body.ollamaModel !== undefined) {
    if (body.ollamaModel === null || body.ollamaModel === "") {
      update.ollamaModel = null;
    } else if (typeof body.ollamaModel !== "string") {
      return { ok: false, error: "ollamaModel must be a string or null." };
    } else {
      const trimmed = body.ollamaModel.trim();
      if (!trimmed) {
        update.ollamaModel = null;
      } else if (trimmed.length > 120) {
        return { ok: false, error: "ollamaModel must be 120 characters or fewer." };
      } else {
        update.ollamaModel = trimmed;
      }
    }
  }

  return { ok: true, update };
}
