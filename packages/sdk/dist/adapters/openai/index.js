import { makeDenyResponse, safeVerify } from "../shared/index.js";
export async function checkToolCall(config, toolCall, execute, verifyOverrides) {
    const verifyResult = await safeVerify(config, {
        agentId: config.agentId,
        action: toolCall.name,
        ...verifyOverrides,
    });
    if (verifyResult.allowed !== true) {
        return makeDenyResponse(verifyResult);
    }
    const result = await execute();
    return Object.freeze({ blocked: false, result, requestId: verifyResult.requestId });
}
export async function checkWebBrowse(config, url, execute) {
    let hostname;
    try {
        hostname = new URL(url).hostname;
    }
    catch {
        hostname = url;
    }
    return checkToolCall(config, { name: "browse_web", arguments: { url } }, execute, { resource: hostname, metadata: { url } });
}
export async function checkPurchase(config, options) {
    return checkToolCall(config, { name: "purchase", arguments: { vendor: options.vendor, amount: options.amount } }, options.execute, { amount: options.amount, vendor: options.vendor, metadata: options.metadata });
}
