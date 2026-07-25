import type { EgressAuthorizeRequest, EgressAuthorizeResponse } from "./types.js";

export type AuthorizeClientOptions = {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function requestEgressAuthorization(
  options: AuthorizeClientOptions,
  request: Omit<EgressAuthorizeRequest, "agentId">
): Promise<EgressAuthorizeResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `${options.baseUrl.replace(/\/$/, "")}/api/egress/authorize`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ ...request, agentId: options.agentId }),
        signal: controller.signal
      }
    );

    const json = (await response.json()) as EgressAuthorizeResponse & { error?: string };
    if (!response.ok) {
      return {
        allowed: false,
        reason: json.error ?? json.reason ?? `Authorize failed with HTTP ${response.status}`,
        risk: "high"
      };
    }
    return {
      allowed: Boolean(json.allowed),
      approvalRequired: json.approvalRequired,
      approvalId: json.approvalId ?? null,
      reason: json.reason ?? (json.allowed ? "Allowed." : "Denied."),
      risk: json.risk,
      ticket: json.ticket,
      expiresAt: json.expiresAt,
      requestId: json.requestId
    };
  } catch (error) {
    return {
      allowed: false,
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "Egress authorize timed out."
          : `Egress authorize failed: ${error instanceof Error ? error.message : String(error)}`,
      risk: "high"
    };
  } finally {
    clearTimeout(timer);
  }
}
