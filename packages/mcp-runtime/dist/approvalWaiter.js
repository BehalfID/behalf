import { mapInvocationToVerifyRequest } from "./mapInvocation.js";
import { callVerify } from "./verify.js";
/**
 * Poll BehalfID verify() until the pending approval is consumed / denied.
 *
 * When verify returns `allowed: true`, that decision is returned to the runtime
 * so the one-shot grant is not consumed twice.
 */
export function createVerifyPollingApprovalWaiter(options) {
    const pollIntervalMs = options.pollIntervalMs ?? 2_000;
    const timeoutMs = options.timeoutMs ?? 300_000;
    const sleep = options.sleep ?? defaultSleep;
    return async ({ invocation }) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            await sleep(pollIntervalMs);
            const input = mapInvocationToVerifyRequest(invocation, options.agentId);
            let next;
            try {
                next = await callVerify(options.verifyClient, input);
            }
            catch {
                // Transient verify failures while waiting — keep polling until timeout.
                continue;
            }
            if (next.allowed) {
                return { granted: true, decision: next };
            }
            if (!next.approvalRequired) {
                return "denied";
            }
        }
        return "denied";
    };
}
function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
