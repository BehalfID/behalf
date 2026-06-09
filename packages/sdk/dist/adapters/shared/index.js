/**
 * Shared types and utilities for BehalfID integration adapters.
 * Imported by per-framework adapter modules — not part of the main SDK surface.
 */
// ─── Utilities ────────────────────────────────────────────────────────────────
export function makeDenyResponse(result) {
    return Object.freeze({
        blocked: true,
        reason: result.reason,
        risk: result.risk,
        requestId: result.requestId,
    });
}
export function requireEnvVars(vars) {
    const missing = vars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
        throw new Error(`BehalfID: missing required environment variables: ${missing.join(", ")}`);
    }
}
export function mapToVerifyInput(agentId, action, overrides) {
    return { agentId, action, ...overrides };
}
/** Merge metadata — keys in `meta` take precedence over existing `input.metadata` keys. */
export function withAuditMetadata(input, meta) {
    return { ...input, metadata: { ...input.metadata, ...meta } };
}
const DENY_UNAVAILABLE = Object.freeze({
    requestId: "req_verify_unavailable",
    allowed: false,
    reason: "Permission check unavailable — action blocked by default.",
    risk: "high",
});
function debugLog(config, ...parts) {
    if (config.debug) {
        console.log("[BehalfID]", ...parts);
    }
}
/**
 * Call verify() and return a deny result on any thrown error.
 * Guarantees fail-closed behavior when the permission check is unavailable.
 *
 * When config.timeoutMs is set, the timer is properly cleared when
 * verifyPromise settles (no orphaned callbacks). The in-flight HTTP request
 * is NOT cancelled — see docs/COMPATIBILITY_MATRIX.md §timeout.
 * TODO: extend BehalfIDClient to accept verify(input, signal?) for true
 *       request cancellation via AbortController.
 */
export async function safeVerify(config, input) {
    debugLog(config, `verify: action="${input.action}" agentId="${input.agentId}"`);
    try {
        const verifyPromise = config.client.verify(input);
        const raced = config.timeoutMs !== undefined
            ? new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    debugLog(config, `verify timeout after ${config.timeoutMs}ms — denying`);
                    reject(new Error("BehalfID verify timeout"));
                }, config.timeoutMs);
                verifyPromise.then((r) => { clearTimeout(timer); resolve(r); }, (e) => { clearTimeout(timer); reject(e); });
            })
            : verifyPromise;
        const result = await raced;
        debugLog(config, `verify result: allowed=${result.allowed} requestId="${result.requestId}" risk="${result.risk}"`);
        return result;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        debugLog(config, `verify error (fail-closed): ${msg}`);
        return DENY_UNAVAILABLE;
    }
}
