import { makeDenyResponse, safeVerify } from "../shared/index.js";
function parseArguments(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed)
            return {};
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            return { raw: value };
        }
    }
    return {};
}
export function normalizeOllamaToolCall(raw) {
    const name = raw.function?.name ?? raw.name;
    if (!name || typeof name !== "string")
        return null;
    const argsSource = raw.function?.arguments !== undefined ? raw.function.arguments : raw.arguments;
    return {
        name,
        arguments: parseArguments(argsSource),
    };
}
export function parseOllamaToolCalls(rawCalls) {
    if (!Array.isArray(rawCalls))
        return [];
    const out = [];
    for (const entry of rawCalls) {
        if (!entry || typeof entry !== "object")
            continue;
        const normalized = normalizeOllamaToolCall(entry);
        if (normalized)
            out.push(normalized);
    }
    return out;
}
export function buildDeniedToolMessage(reason) {
    return {
        role: "tool",
        content: `Permission denied by BehalfID: ${reason}`,
    };
}
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
