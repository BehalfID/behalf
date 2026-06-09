/**
 * BehalfID compatibility adapter for LangChain-style agent workflows.
 *
 * Status: EXPERIMENTAL — compatibility adapter, not an official LangChain integration.
 *
 * Wraps LangChain-compatible tools with a BehalfID permission gate. The wrapped
 * tool has the same name and description as the original — register it with your
 * agent executor in place of the unwrapped tool.
 *
 * Compatible with: langchain, @langchain/core DynamicTool, StructuredTool, Tool.
 * No LangChain dependency is imported — structural typing handles compatibility.
 *
 * Install: npm install @behalfid/sdk
 * Docs:    integrations/langchain/README.md
 */

import type {
  IntegrationConfig,
  VerifyInput,
  DenyResponse,
} from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal interface compatible with LangChain's DynamicTool / StructuredTool.
 * Pass your real LangChain tool instance — it satisfies this via duck typing.
 */
export type LangChainToolLike<TInput = string, TOutput = string> = {
  name: string;
  description: string;
  call(input: TInput): Promise<TOutput>;
};

export type WrappedToolResult<TOutput> = TOutput | DenyResponse;

// ─── Single tool wrapper ──────────────────────────────────────────────────────

/**
 * Wrap a LangChain-compatible tool with a BehalfID permission gate.
 *
 * If BehalfID denies the action or the permission check fails, `call()`
 * returns a DenyResponse and the underlying tool is never invoked.
 * If allowed, `call()` delegates to the original tool normally.
 *
 * @example
 * const purchaseTool = new DynamicTool({
 *   name: "purchaseTicket",
 *   description: "Purchase a ticket for a given event.",
 *   func: async (input) => purchaseTicket(input),
 * });
 *
 * const safePurchaseTool = wrapToolWithBehalfID(config, purchaseTool, {
 *   amount: 250,
 *   vendor: "ticketmaster.com",
 * });
 *
 * const executor = await initializeAgentExecutorWithOptions(
 *   [safePurchaseTool],  // drop-in replacement
 *   llm,
 *   { agentType: "openai-functions" }
 * );
 */
export function wrapToolWithBehalfID<TInput = string, TOutput = string>(
  config: IntegrationConfig,
  tool: LangChainToolLike<TInput, TOutput>,
  verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>
): LangChainToolLike<TInput, WrappedToolResult<TOutput>> {
  return {
    name: tool.name,
    description: tool.description,
    async call(input: TInput): Promise<WrappedToolResult<TOutput>> {
      const verifyResult = await safeVerify(config, {
        agentId: config.agentId,
        action: tool.name,
        ...verifyOverrides,
      });

      if (verifyResult.allowed !== true) {
        return makeDenyResponse(verifyResult);
      }

      return tool.call(input);
    },
  };
}

// ─── Bulk wrapper ─────────────────────────────────────────────────────────────

/**
 * Wrap multiple LangChain-compatible tools in a single call.
 *
 * Note: `verifyOverrides` applies to every tool in the array. For per-tool
 * overrides (e.g. different amount limits), wrap each tool individually with
 * `wrapToolWithBehalfID`.
 *
 * @example
 * const safeTools = wrapToolsWithBehalfID(config, [
 *   sendEmailTool,
 *   purchaseTicketTool,
 *   browseWebTool,
 * ]);
 *
 * const executor = await initializeAgentExecutorWithOptions(safeTools, llm, { ... });
 */
export function wrapToolsWithBehalfID<TInput = string, TOutput = string>(
  config: IntegrationConfig,
  tools: LangChainToolLike<TInput, TOutput>[],
  verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>
): LangChainToolLike<TInput, WrappedToolResult<TOutput>>[] {
  return tools.map((tool) =>
    wrapToolWithBehalfID(config, tool, verifyOverrides)
  );
}
