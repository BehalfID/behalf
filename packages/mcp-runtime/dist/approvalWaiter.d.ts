import type { ApprovalWaiter, VerifyClient } from "./types.js";
export type VerifyPollingApprovalWaiterOptions = {
    verifyClient: VerifyClient;
    agentId: string;
    /** Default 2000ms. */
    pollIntervalMs?: number;
    /** Default 300000ms (5 minutes). */
    timeoutMs?: number;
    /** Injected sleep for tests. */
    sleep?: (ms: number) => Promise<void>;
};
/**
 * Poll BehalfID verify() until the pending approval is consumed / denied.
 *
 * When verify returns `allowed: true`, that decision is returned to the runtime
 * so the one-shot grant is not consumed twice.
 */
export declare function createVerifyPollingApprovalWaiter(options: VerifyPollingApprovalWaiterOptions): ApprovalWaiter;
