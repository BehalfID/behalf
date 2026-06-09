import { makeDenyResponse, safeVerify } from "../shared/index.js";
export function wrapToolWithBehalfID(config, tool, verifyOverrides) {
    return {
        name: tool.name,
        description: tool.description,
        async call(input) {
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
export function wrapToolsWithBehalfID(config, tools, verifyOverrides) {
    return tools.map((tool) => wrapToolWithBehalfID(config, tool, verifyOverrides));
}
