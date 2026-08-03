import type { IntegrationConfig, VerifyInput, GatedResult } from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

export type OllamaToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

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

export function buildDeniedToolMessage(reason: string): {
  role: "tool";
  content: string;
} {
  return {
    role: "tool",
    content: `Permission denied by BehalfID: ${reason}`,
  };
}

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
