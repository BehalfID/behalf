const VALID_RISKS = new Set(["low", "medium", "high"]);
/**
 * Structural validation of a verify() response.
 * Malformed decisions must fail closed (never execute).
 */
export function isValidVerifyDecision(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    if (typeof v.requestId !== "string" || v.requestId.length === 0)
        return false;
    if (typeof v.allowed !== "boolean")
        return false;
    if (typeof v.reason !== "string")
        return false;
    if (typeof v.risk !== "string" || !VALID_RISKS.has(v.risk))
        return false;
    if (v.approvalRequired !== undefined && typeof v.approvalRequired !== "boolean") {
        return false;
    }
    if (v.approvalId !== undefined && typeof v.approvalId !== "string") {
        return false;
    }
    return true;
}
export class VerifyTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`BehalfID verify timeout after ${timeoutMs}ms`);
        this.name = "VerifyTimeoutError";
    }
}
export class VerifyMalformedError extends Error {
    constructor(message = "Malformed verification response") {
        super(message);
        this.name = "VerifyMalformedError";
    }
}
/**
 * Wrap a VerifyClient with a deadline. On timeout the promise rejects with
 * {@link VerifyTimeoutError} so the PEP can fail closed.
 */
export function withVerifyTimeout(client, timeoutMs) {
    return {
        async verify(input) {
            let timer;
            try {
                const result = await Promise.race([
                    client.verify(input),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new VerifyTimeoutError(timeoutMs)), timeoutMs);
                    }),
                ]);
                return result;
            }
            finally {
                if (timer !== undefined)
                    clearTimeout(timer);
            }
        },
    };
}
/**
 * Call verify, validate the shape, and surface timeout/malformed as typed errors.
 * Network / thrown errors propagate for the PEP to fail closed.
 */
export async function callVerify(client, input) {
    const raw = await client.verify(input);
    if (!isValidVerifyDecision(raw)) {
        throw new VerifyMalformedError();
    }
    return raw;
}
