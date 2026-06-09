import type { IntegrationConfig, VerifyInput, GatedResult } from "../shared/index.js";
import { makeDenyResponse, safeVerify } from "../shared/index.js";

export type AnthropicToolUseBlock = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AnthropicToolResult<T> = { tool_use_id: string } & GatedResult<T>;

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
