/**
 * Shared types and utilities for BehalfID integration adapters.
 * Imported by per-framework adapter modules — not part of the main SDK surface.
 */

import type { VerifyInput, VerifyResult, RiskLevel } from "../../types.js";

export type { VerifyInput, VerifyResult, RiskLevel };

// ─── Structural interface ─────────────────────────────────────────────────────

/**
 * Minimal interface satisfied by the BehalfID class from @behalfid/sdk.
 * Declare your config as IntegrationConfig and pass a real BehalfID instance.
 *
 * The optional second argument lets safeVerify abort the in-flight HTTP
 * request on timeout. Clients that ignore it (or declare verify(input) only)
 * remain compatible — the request simply is not cancelled.
 */
export type BehalfIDClient = {
  verify(
    input: VerifyInput,
    options?: { signal?: AbortSignal }
  ): Promise<VerifyResult>;
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

// ─── Gated result types ───────────────────────────────────────────────────────

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

// ─── Utilities ────────────────────────────────────────────────────────────────

export function makeDenyResponse(result: VerifyResult): DenyResponse {
  return Object.freeze({
    blocked: true as const,
    reason: result.reason,
    risk: result.risk,
    requestId: result.requestId,
  });
}

export function requireEnvVars(vars: string[]): void {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `BehalfID: missing required environment variables: ${missing.join(", ")}`
    );
  }
}

export function mapToVerifyInput(
  agentId: string,
  action: string,
  overrides?: Partial<Omit<VerifyInput, "agentId" | "action">>
): VerifyInput {
  return { agentId, action, ...overrides };
}

/** Merge metadata — keys in `meta` take precedence over existing `input.metadata` keys. */
export function withAuditMetadata(
  input: VerifyInput,
  meta: Record<string, unknown>
): VerifyInput {
  return { ...input, metadata: { ...input.metadata, ...meta } };
}

const DENY_UNAVAILABLE: VerifyResult = Object.freeze({
  requestId: "req_verify_unavailable",
  allowed: false,
  reason: "Permission check unavailable — action blocked by default.",
  risk: "high" as const,
});

function debugLog(config: IntegrationConfig, ...parts: string[]): void {
  if (config.debug) {
    console.log("[BehalfID]", ...parts);
  }
}

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
export async function safeVerify(
  config: IntegrationConfig,
  input: VerifyInput
): Promise<VerifyResult> {
  debugLog(config, `verify: action="${input.action}" agentId="${input.agentId}"`);
  try {
    // Only create an AbortController when a deadline is enforced — the
    // no-timeout path stays identical to a plain verify(input) call.
    const controller =
      config.timeoutMs !== undefined ? new AbortController() : undefined;
    const verifyPromise = controller
      ? config.client.verify(input, { signal: controller.signal })
      : config.client.verify(input);
    const raced: Promise<VerifyResult> =
      config.timeoutMs !== undefined
        ? new Promise<VerifyResult>((resolve, reject) => {
            const timer = setTimeout(
              () => {
                debugLog(config, `verify timeout after ${config.timeoutMs}ms — denying`);
                // Cancel the in-flight HTTP request. The abort rejection from
                // verifyPromise is consumed by the handlers below (reject on
                // an already-settled promise is a no-op), so it can never
                // surface as an unhandled rejection.
                controller?.abort();
                reject(new Error("BehalfID verify timeout"));
              },
              config.timeoutMs
            );
            verifyPromise.then(
              (r) => { clearTimeout(timer); resolve(r); },
              (e) => { clearTimeout(timer); reject(e); }
            );
          })
        : verifyPromise;
    const result = await raced;
    debugLog(
      config,
      `verify result: allowed=${result.allowed} requestId="${result.requestId}" risk="${result.risk}"`
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    debugLog(config, `verify error (fail-closed): ${msg}`);
    return DENY_UNAVAILABLE;
  }
}
