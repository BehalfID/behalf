/**
 * BehalfID compatibility adapter for Ollama tool-calling workflows.
 *
 * Status: EXPERIMENTAL — compatibility adapter, not an official Ollama integration.
 *
 * Gates Ollama chat `tool_calls` behind BehalfID permission checks before
 * execution. No Ollama client library is required — the adapter works with
 * any function that follows the tool-call pattern (name + arguments), and
 * includes helpers to normalize Ollama `/api/chat` message.tool_calls shapes.
 *
 * Install: npm install @behalfid/sdk
 * Docs:    integrations/ollama/README.md
 */

import type {
  IntegrationConfig,
  VerifyInput,
  GatedResult,
} from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OllamaToolCall = {
  /** Tool or function name as returned by the model (e.g. "search_web"). */
  name: string;
  /** Parsed arguments object from the model response. */
  arguments: Record<string, unknown>;
};

/**
 * Raw tool_call entry as returned by Ollama `/api/chat` (and OpenAI-compatible
 * Ollama responses). `arguments` may be an object or a JSON string.
 */
export type OllamaRawToolCall = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
  name?: string;
  arguments?: string | Record<string, unknown>;
};

// ─── Normalization ────────────────────────────────────────────────────────────

function parseArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { raw: value };
    }
  }
  return {};
}

/**
 * Normalize one Ollama (or OpenAI-compatible) tool_call into `{ name, arguments }`.
 * Returns null when the entry has no usable function name.
 */
export function normalizeOllamaToolCall(raw: OllamaRawToolCall): OllamaToolCall | null {
  const name = raw.function?.name ?? raw.name;
  if (!name || typeof name !== "string") return null;

  const argsSource =
    raw.function?.arguments !== undefined ? raw.function.arguments : raw.arguments;

  return {
    name,
    arguments: parseArguments(argsSource),
  };
}

/**
 * Map `message.tool_calls` from an Ollama chat response into gated tool calls.
 * Skips malformed entries without a function name.
 */
export function parseOllamaToolCalls(rawCalls: unknown): OllamaToolCall[] {
  if (!Array.isArray(rawCalls)) return [];
  const out: OllamaToolCall[] = [];
  for (const entry of rawCalls) {
    if (!entry || typeof entry !== "object") continue;
    const normalized = normalizeOllamaToolCall(entry as OllamaRawToolCall);
    if (normalized) out.push(normalized);
  }
  return out;
}

/**
 * Build a chat message you can append so the model sees a permission denial.
 * Matches Ollama's typical `role: "tool"` follow-up shape.
 */
export function buildDeniedToolMessage(reason: string): {
  role: "tool";
  content: string;
} {
  return {
    role: "tool",
    content: `Permission denied by BehalfID: ${reason}`,
  };
}

// ─── Core gate ────────────────────────────────────────────────────────────────

/**
 * Gate an Ollama tool call behind a BehalfID permission check.
 *
 * Calls `verify()` before invoking `execute`. If denied or if the permission
 * check fails (network error, timeout), returns a DenyResponse and execute is
 * never called. If allowed, returns the result of execute wrapped in an
 * AllowedResponse.
 *
 * @example
 * const toolCalls = parseOllamaToolCalls(message.tool_calls);
 * for (const toolCall of toolCalls) {
 *   const result = await checkToolCall(config, toolCall, async () => {
 *     return await myTool(toolCall.arguments);
 *   });
 *   if (result.blocked) {
 *     messages.push(buildDeniedToolMessage(result.reason));
 *     continue;
 *   }
 *   messages.push({ role: "tool", content: JSON.stringify(result.result) });
 * }
 */
export async function checkToolCall<T>(
  config: IntegrationConfig,
  toolCall: OllamaToolCall,
  execute: () => Promise<T>,
  verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>
): Promise<GatedResult<T>> {
  const verifyResult = await safeVerify(config, {
    agentId: config.agentId,
    action: toolCall.name,
    ...verifyOverrides,
  });

  if (verifyResult.allowed !== true) {
    return makeDenyResponse(verifyResult);
  }

  const result = await execute();
  return Object.freeze({ blocked: false as const, result, requestId: verifyResult.requestId });
}

// ─── Convenience gates ────────────────────────────────────────────────────────

/**
 * Gate a web browsing action.
 *
 * Maps to action "browse_web" with `resource` set to the target hostname,
 * matching the BehalfID action gateway convention.
 */
export async function checkWebBrowse<T>(
  config: IntegrationConfig,
  url: string,
  execute: () => Promise<T>
): Promise<GatedResult<T>> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  return checkToolCall(
    config,
    { name: "browse_web", arguments: { url } },
    execute,
    { resource: hostname, metadata: { url } }
  );
}

/**
 * Gate a purchase-style action.
 *
 * Passes `amount` and `vendor` to BehalfID so permission constraints
 * (maxAmount, allowedVendors) are evaluated before any charge occurs.
 */
export async function checkPurchase<T>(
  config: IntegrationConfig,
  options: {
    vendor: string;
    amount: number;
    execute: () => Promise<T>;
    metadata?: Record<string, unknown>;
  }
): Promise<GatedResult<T>> {
  return checkToolCall(
    config,
    { name: "purchase", arguments: { vendor: options.vendor, amount: options.amount } },
    options.execute,
    { amount: options.amount, vendor: options.vendor, metadata: options.metadata }
  );
}
