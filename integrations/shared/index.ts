/**
 * Shared utilities for BehalfID integration adapters.
 *
 * These adapters are COMPATIBILITY HELPERS — not official partnerships with
 * OpenAI, Anthropic, LangChain, LlamaIndex, Vercel, or Stripe.
 *
 * See integrations/README.md for the full integration status table.
 */

// ─── Core types (mirror @behalfid/sdk — no runtime dependency needed) ─────────

export type VerifyInput = {
  agentId: string;
  action: string;
  amount?: number;
  vendor?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
};

export type RiskLevel = "low" | "medium" | "high";

export type VerifyResult = {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: RiskLevel;
};

/**
 * Minimal interface that @behalfid/sdk's BehalfID class satisfies.
 * Pass a real BehalfID instance — structural typing handles compatibility.
 */
export type BehalfIDClient = {
  verify(input: VerifyInput): Promise<VerifyResult>;
};

export type IntegrationConfig = {
  client: BehalfIDClient;
  agentId: string;
  /**
   * Milliseconds to wait for verify() before treating the check as failed and
   * returning a deny (fail-closed). The execute callback is caller-owned and
   * must be wrapped separately if an execute timeout is also needed.
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

/** Normalize a denied VerifyResult into a frozen DenyResponse. */
export function makeDenyResponse(result: VerifyResult): DenyResponse {
  return Object.freeze({
    blocked: true as const,
    reason: result.reason,
    risk: result.risk,
    requestId: result.requestId,
  });
}

/**
 * Throw at startup if any required environment variables are absent.
 * Fail fast rather than failing on the first live request.
 */
export function requireEnvVars(vars: string[]): void {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `BehalfID: missing required environment variables: ${missing.join(", ")}`
    );
  }
}

/**
 * Build a VerifyInput from an action name with optional field overrides.
 * Useful for mapping tool names to BehalfID action strings.
 */
export function mapToVerifyInput(
  agentId: string,
  action: string,
  overrides?: Partial<Omit<VerifyInput, "agentId" | "action">>
): VerifyInput {
  return { agentId, action, ...overrides };
}

/**
 * Merge audit metadata into a VerifyInput. Keys in `meta` take precedence
 * over keys already present in `input.metadata`.
 */
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
 * Call verify() and return a denial on any thrown error (network failure,
 * timeout, server error). Guarantees fail-closed: if the permission check
 * cannot be completed, the action is blocked.
 *
 * When config.timeoutMs is set, verify() is raced against a timer; a timeout
 * is treated as failure (deny). The execute callback is caller-owned — wrap it
 * separately if an execute timeout is also needed.
 *
 * When config.debug is true, verify events are logged to console (no secrets).
 *
 * Use this inside adapter gate functions instead of calling
 * config.client.verify() directly.
 */
export async function safeVerify(
  config: IntegrationConfig,
  input: VerifyInput
): Promise<VerifyResult> {
  debugLog(config, `verify: action="${input.action}" agentId="${input.agentId}"`);
  try {
    const verifyPromise = config.client.verify(input);
    // NOTE: The timer is properly cleared when verifyPromise settles, preventing
    // orphaned callbacks. However, the in-flight HTTP request to BehalfID is NOT
    // cancelled when the timer fires — the underlying fetch continues until the
    // TCP connection closes. True request cancellation requires AbortSignal
    // support in BehalfIDClient.verify(). See docs/COMPATIBILITY_MATRIX.md §timeout.
    // TODO: extend BehalfIDClient to accept verify(input, signal?) and thread
    //       AbortController through safeVerify when timeoutMs is set.
    const raced: Promise<VerifyResult> =
      config.timeoutMs !== undefined
        ? new Promise<VerifyResult>((resolve, reject) => {
            const timer = setTimeout(
              () => {
                debugLog(config, `verify timeout after ${config.timeoutMs}ms — denying`);
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
