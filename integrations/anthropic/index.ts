/**
 * BehalfID compatibility adapter for Claude / Anthropic tool-use workflows.
 *
 * Status: EXPERIMENTAL — compatibility adapter, not an official Anthropic integration.
 *
 * Wraps Claude tool_use blocks with a BehalfID permission check before the
 * handler executes. The returned shape mirrors Anthropic's tool_result format
 * so results can be passed back to the API without extra transformation.
 *
 * Install: npm install @behalfid/sdk
 * Docs:    integrations/anthropic/README.md
 */

import type {
  IntegrationConfig,
  VerifyInput,
  GatedResult,
} from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A tool_use content block from a Claude API response.
 * Mirrors `Anthropic.Messages.ToolUseBlock` — no SDK import needed.
 */
export type AnthropicToolUseBlock = {
  /** Unique ID from the model response, e.g. "toolu_01A2B3...". */
  id: string;
  /** Tool name declared in the tools array, e.g. "send_email". */
  name: string;
  /** Parsed input from the model. */
  input: Record<string, unknown>;
};

export type AnthropicToolResult<T> = { tool_use_id: string } & GatedResult<T>;

// ─── Core gate ────────────────────────────────────────────────────────────────

/**
 * Gate a Claude tool_use block behind a BehalfID permission check.
 *
 * The returned object includes `tool_use_id` so it can be forwarded
 * directly in a `tool_result` user message. If the permission check fails
 * (network error, timeout), returns a DenyResponse — execute is never called.
 *
 * @example
 * for (const block of message.content) {
 *   if (block.type !== "tool_use") continue;
 *
 *   const gated = await checkToolUse(config, block, async () => {
 *     return await handlers[block.name](block.input);
 *   });
 *
 *   if (gated.blocked) {
 *     toolResults.push(buildDeniedToolResult(gated.tool_use_id, gated.reason));
 *   } else {
 *     toolResults.push({
 *       type: "tool_result",
 *       tool_use_id: gated.tool_use_id,
 *       content: JSON.stringify(gated.result),
 *     });
 *   }
 * }
 */
export async function checkToolUse<T>(
  config: IntegrationConfig,
  toolUseBlock: AnthropicToolUseBlock,
  execute: () => Promise<T>,
  verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>
): Promise<AnthropicToolResult<T>> {
  const verifyResult = await safeVerify(config, {
    agentId: config.agentId,
    action: toolUseBlock.name,
    ...verifyOverrides,
  });

  if (verifyResult.allowed !== true) {
    return {
      tool_use_id: toolUseBlock.id,
      ...makeDenyResponse(verifyResult),
    };
  }

  const result = await execute();
  return Object.freeze({
    tool_use_id: toolUseBlock.id,
    blocked: false as const,
    result,
    requestId: verifyResult.requestId,
  });
}

// ─── Response helpers ─────────────────────────────────────────────────────────

/**
 * Build a `tool_result` message block for a denied action.
 *
 * Returning this to the Claude API lets the model know the action was blocked
 * so it can adapt its response (e.g. suggest an alternative or ask for approval).
 *
 * @example
 * toolResults.push(buildDeniedToolResult(gated.tool_use_id, gated.reason));
 */
export function buildDeniedToolResult(
  toolUseId: string,
  reason: string
): {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error: boolean;
} {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: `Action blocked by permission policy: ${reason}`,
    is_error: true,
  };
}
