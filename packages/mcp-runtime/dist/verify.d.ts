import type { VerifyClient, VerifyDecision, VerifyRequest } from "./types.js";
/**
 * Structural validation of a verify() response.
 * Malformed decisions must fail closed (never execute).
 */
export declare function isValidVerifyDecision(value: unknown): value is VerifyDecision;
export declare class VerifyTimeoutError extends Error {
    constructor(timeoutMs: number);
}
export declare class VerifyMalformedError extends Error {
    constructor(message?: string);
}
/**
 * Wrap a VerifyClient with a deadline. On timeout the promise rejects with
 * {@link VerifyTimeoutError} so the PEP can fail closed.
 */
export declare function withVerifyTimeout(client: VerifyClient, timeoutMs: number): VerifyClient;
/**
 * Call verify, validate the shape, and surface timeout/malformed as typed errors.
 * Network / thrown errors propagate for the PEP to fail closed.
 */
export declare function callVerify(client: VerifyClient, input: VerifyRequest): Promise<VerifyDecision>;
