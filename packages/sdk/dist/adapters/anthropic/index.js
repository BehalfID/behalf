import { makeDenyResponse, safeVerify } from "../shared/index.js";
export async function checkToolUse(config, toolUseBlock, execute, verifyOverrides) {
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
        blocked: false,
        result,
        requestId: verifyResult.requestId,
    });
}
export function buildDeniedToolResult(toolUseId, reason) {
    return {
        type: "tool_result",
        tool_use_id: toolUseId,
        content: `Action blocked by permission policy: ${reason}`,
        is_error: true,
    };
}
