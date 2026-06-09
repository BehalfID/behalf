import { makeDenyResponse, safeVerify } from "../shared/index.js";
export function wrapLlamaToolWithBehalfID(config, tool, verifyOverrides) {
    return {
        metadata: tool.metadata,
        async call(input) {
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
