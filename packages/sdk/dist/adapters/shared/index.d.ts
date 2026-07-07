/**
 * Shared types and utilities for BehalfID integration adapters.
 * Imported by per-framework adapter modules — not part of the main SDK surface.
 */
import type { VerifyInput, VerifyResult, RiskLevel } from "../../types.js";
export type { VerifyInput, VerifyResult, RiskLevel };
/**
 * Minimal interface satisfied by the BehalfID class from @behalfid/sdk.
 * Declare your config as IntegrationConfig and pass a real BehalfID instance.
 *
 * The optional second argument lets safeVerify abort the in-flight HTTP
 * request on timeout. Clients that ignore it (or declare verify(input) only)
 * remain compatible — the request simply is not cancelled.
 */
export type BehalfIDClient = {
    verify(input: VerifyInput, options?: {
        signal?: AbortSignal;
    }): Promise<VerifyResult>;
};
export type IntegrationConfig = {
    client: BehalfIDClient;
    agentId: string;
    /**
     * Milliseconds to wait for verify() before treating the check as failed and
     * returning a deny (fail-closed). The in-flight HTTP request is aborted when
     * the deadline fires. The execute callback is caller-owned and must be
     * wrapped separately if an execute timeout is also needed.
     */
    timeoutMs?: number;
    /**
     * Emit debug events to console.log. OFF by default.
     * Never logs API keys, auth headers, or secrets.
     * Logs: verify start/result/timeout/error, relevant action names and requestIds.
     */
    debug?: boolean;
};
export type DenyResponse = {
    readonly blocked: true;
    readonly reason: string;
    readonly risk: RiskLevel;
    readonly requestId: string;
};
export type AllowedResponse<T> = {
    readonly blocked: false;
    readonly result: T;
    readonly requestId: string;
};
export type GatedResult<T> = DenyResponse | AllowedResponse<T>;
export declare function makeDenyResponse(result: VerifyResult): DenyResponse;
export declare function requireEnvVars(vars: string[]): void;
export declare function mapToVerifyInput(agentId: string, action: string, overrides?: Partial<Omit<VerifyInput, "agentId" | "action">>): VerifyInput;
/** Merge metadata — keys in `meta` take precedence over existing `input.metadata` keys. */
export declare function withAuditMetadata(input: VerifyInput, meta: Record<string, unknown>): VerifyInput;
/**
 * Call verify() and return a deny result on any thrown error.
 * Guarantees fail-closed behavior when the permission check is unavailable.
 *
 * When config.timeoutMs is set, the timer is properly cleared when
 * verifyPromise settles (no orphaned callbacks) and the in-flight HTTP
 * request is aborted via AbortController when the deadline fires (on
 * runtimes whose fetch supports AbortSignal). See
 * docs/COMPATIBILITY_MATRIX.md §timeout.
 */
export declare function safeVerify(config: IntegrationConfig, input: VerifyInput): Promise<VerifyResult>;
