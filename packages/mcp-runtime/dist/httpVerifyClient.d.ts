import type { VerifyClient } from "./types.js";
export type HttpVerifyClientOptions = {
    verifyUrl: string;
    apiKey: string;
    /** Optional fetch impl for tests. */
    fetchImpl?: typeof fetch;
};
/**
 * VerifyClient that POSTs to BehalfID `/api/verify`.
 * Platform remains the sole authorization source.
 */
export declare function createHttpVerifyClient(options: HttpVerifyClientOptions): VerifyClient;
