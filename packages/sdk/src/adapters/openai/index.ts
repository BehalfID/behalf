import type { IntegrationConfig, VerifyInput, GatedResult } from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

export type OpenAIToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export async function checkToolCall<T>(
  config: IntegrationConfig,
  toolCall: OpenAIToolCall,
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
