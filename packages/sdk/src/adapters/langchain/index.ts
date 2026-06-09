import type { IntegrationConfig, VerifyInput, DenyResponse } from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

export type LangChainToolLike<TInput = string, TOutput = string> = {
  name: string;
  description: string;
  call(input: TInput): Promise<TOutput>;
};

export type WrappedToolResult<TOutput> = TOutput | DenyResponse;

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

export function wrapToolsWithBehalfID<TInput = string, TOutput = string>(
  config: IntegrationConfig,
  tools: LangChainToolLike<TInput, TOutput>[],
  verifyOverrides?: Partial<Omit<VerifyInput, "agentId" | "action">>
): LangChainToolLike<TInput, WrappedToolResult<TOutput>>[] {
  return tools.map((tool) => wrapToolWithBehalfID(config, tool, verifyOverrides));
}
