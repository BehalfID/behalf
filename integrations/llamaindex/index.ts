/**
 * BehalfID compatibility adapter for LlamaIndex-style agent workflows.
 *
 * Status: EXPERIMENTAL — compatibility adapter, not an official LlamaIndex integration.
 *
 * Wraps LlamaIndex FunctionTool-compatible objects with a BehalfID permission
 * check before execution. The wrapper preserves `metadata` (name, description,
 * parameters) so the tool can be registered with a ReActAgent unchanged.
 *
 * Compatible with: llamaindex FunctionTool, QueryEngineTool.
 * No LlamaIndex dependency is imported — structural typing handles compatibility.
 *
 * Install: npm install @behalfid/sdk
 * Docs:    integrations/llamaindex/README.md
 */

import type {
  IntegrationConfig,
  VerifyInput,
  DenyResponse,
} from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal interface compatible with LlamaIndex's FunctionTool pattern.
 * Pass a real FunctionTool instance — it satisfies this via duck typing.
 */
export type LlamaIndexToolLike<
  TInput = Record<string, unknown>,
  TOutput = unknown,
> = {
  metadata: {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  };
  call(input: TInput): Promise<TOutput>;
};

export type LlamaToolResult<TOutput> = TOutput | DenyResponse;

// ─── Tool wrapper ─────────────────────────────────────────────────────────────

/**
 * Wrap a LlamaIndex-compatible function tool with a BehalfID permission gate.
 *
 * The wrapped tool preserves `metadata` (including JSON schema parameters) so
 * it can be registered with a ReActAgent or other agent executor without changes.
 * If BehalfID denies the action or the permission check fails, `call()` returns
 * a DenyResponse and the underlying tool is never invoked.
 *
 * @example
 * const purchaseTool = FunctionTool.from(
 *   async ({ amount, vendor }) => purchaseItem(amount, vendor),
 *   {
 *     name: "purchaseItem",
 *     description: "Purchase an item from a vendor.",
 *     parameters: { ... },
 *   }
 * );
 *
 * const safeTool = wrapLlamaToolWithBehalfID(config, purchaseTool, {
 *   amount: 500,
 *   vendor: "amazon.com",
 * });
 *
 * const agent = new ReActAgent({ tools: [safeTool], llm });
 */
export function wrapLlamaToolWithBehalfID<
  TInput = Record<string, unknown>,
  TOutput = unknown,
>(
  config: IntegrationConfig,
  tool: LlamaIndexToolLike<TInput, TOutput>,
  verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>
): LlamaIndexToolLike<TInput, LlamaToolResult<TOutput>> {
  return {
    metadata: tool.metadata,
    async call(input: TInput): Promise<LlamaToolResult<TOutput>> {
      const verifyResult = await safeVerify(config, {
        agentId: config.agentId,
        action: tool.metadata.name,
        ...verifyOverrides,
      });

      if (verifyResult.allowed !== true) {
        return makeDenyResponse(verifyResult);
      }

      return tool.call(input);
    },
  };
}
