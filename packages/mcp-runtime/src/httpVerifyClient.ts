import type { VerifyClient, VerifyDecision, VerifyRequest } from "./types.js";
import { isValidVerifyDecision } from "./verify.js";

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
export function createHttpVerifyClient(
  options: HttpVerifyClientOptions
): VerifyClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async verify(input: VerifyRequest): Promise<VerifyDecision> {
      const res = await fetchImpl(options.verifyUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Verify HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`
        );
      }

      const json: unknown = await res.json();
      if (!isValidVerifyDecision(json)) {
        // API may omit risk in edge cases — normalize common shapes
        const normalized = normalizeVerifyPayload(json);
        if (!normalized) {
          throw new Error("Malformed verification response from API");
        }
        return normalized;
      }
      return json;
    },
  };
}

function normalizeVerifyPayload(value: unknown): VerifyDecision | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.requestId !== "string" || typeof v.allowed !== "boolean") {
    return null;
  }
  if (typeof v.reason !== "string") return null;

  const risk =
    v.risk === "low" || v.risk === "medium" || v.risk === "high"
      ? v.risk
      : "high";

  const decision: VerifyDecision = {
    requestId: v.requestId,
    allowed: v.allowed,
    reason: v.reason,
    risk,
  };
  if (typeof v.approvalRequired === "boolean") {
    decision.approvalRequired = v.approvalRequired;
  }
  if (typeof v.approvalId === "string") {
    decision.approvalId = v.approvalId;
  }
  return decision;
}
