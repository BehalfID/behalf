/**
 * BehalfID compatibility adapter for OpenAI-style agent workflows.
 *
 * Status: EXPERIMENTAL — compatibility adapter, not an official OpenAI integration.
 *
 * These helpers gate OpenAI tool/function calls behind BehalfID permission
 * checks before execution. No OpenAI SDK is required — the adapter works with
 * any function that follows the tool-call pattern (name + arguments).
 *
 * Install: npm install @behalfid/sdk
 * Docs:    integrations/openai/README.md
 */

import type {
  IntegrationConfig,
  VerifyInput,
  GatedResult,
} from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OpenAIToolCall = {
  /** Tool or function name as returned by the model (e.g. "search_web"). */
  name: string;
  /** Parsed arguments object from the model response. */
  arguments: Record<string, unknown>;
};

// ─── Core gate ────────────────────────────────────────────────────────────────

/**
 * Gate an OpenAI tool call behind a BehalfID permission check.
 *
 * Calls `verify()` before invoking `execute`. If denied or if the permission
 * check fails (network error, timeout), returns a DenyResponse and execute is
 * never called. If allowed, returns the result of execute wrapped in an
 * AllowedResponse.
 *
 * @example
 * const result = await checkToolCall(config, toolCall, async () => {
 *   return await myTool(toolCall.arguments);
 * });
 * if (result.blocked) {
 *   return [{ type: "function", function: { name: toolCall.name, content: result.reason } }];
 * }
 * return result.result;
 */
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

// ─── Convenience gates ────────────────────────────────────────────────────────

/**
 * Gate a web browsing action.
 *
 * Maps to action "browse_web" with `resource` set to the target hostname,
 * matching the BehalfID action gateway convention.
 *
 * @example
 * const result = await checkWebBrowse(config, url, async () => fetchPage(url));
 * if (result.blocked) return { error: result.reason };
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
 *
 * @example
 * const result = await checkPurchase(config, {
 *   vendor: "stripe.com",
 *   amount: 4999,
 *   execute: async () => stripe.checkout.sessions.create({ ... }),
 * });
 * if (result.blocked) throw new PermissionDeniedError(result.reason);
 * return result.result;
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
