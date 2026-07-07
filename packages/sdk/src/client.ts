import type {
  BehalfIDConfig,
  CreateAgentInput,
  CreateAgentResult,
  CreatePermissionInput,
  CreatePermissionResult,
  ExecuteActionInput,
  ExecuteActionResult,
  RotateKeyResult,
  VerificationLog,
  VerifyInput,
  VerifyResult
} from "./types.js";
import { SiteGuardNamespace } from "./site-guard.js";

type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export type VerifyCallOptions = {
  /**
   * Abort the in-flight HTTP request (e.g. from a timeout AbortController).
   * Ignored when the runtime fetch implementation does not support AbortSignal.
   */
  signal?: AbortSignal;
};

const DEFAULT_BASE_URL = "https://behalfid.com";

export class BehalfID {
  private readonly apiKey: string;
  private readonly developerToken: string | undefined;
  private readonly baseUrl: string;

  /**
   * Site Guard namespace. Use a `bhf_site_...` key as `apiKey` and call
   * `behalf.siteGuard.check({ path, userAgent, agentIdentifier })`.
   *
   * @see https://behalfid.com/docs/site-guard
   */
  readonly siteGuard: SiteGuardNamespace;

  constructor({ apiKey, developerToken, baseUrl = DEFAULT_BASE_URL, allowInsecureHttp = false }: BehalfIDConfig) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error("BehalfID: apiKey is required.");
    }
    if (!apiKey.startsWith("bhf_sk_") && !apiKey.startsWith("bhf_site_")) {
      throw new Error(
        "BehalfID: apiKey must be a valid agent key (bhf_sk_...) or site key (bhf_site_...)."
      );
    }
    if (developerToken !== undefined) {
      if (typeof developerToken !== "string" || !developerToken.startsWith("bhf_dev_")) {
        throw new Error("BehalfID: developerToken must be a valid developer token (bhf_dev_...).");
      }
    }
    if (typeof baseUrl !== "string" || !/^https?:\/\//i.test(baseUrl)) {
      throw new Error("BehalfID: baseUrl must start with http:// or https://");
    }

    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(normalizedBaseUrl);
    } catch {
      throw new Error("BehalfID: baseUrl must be a valid URL.");
    }

    if (parsedBaseUrl.protocol === "http:" && !allowInsecureHttp) {
      throw new Error(
        "BehalfID: baseUrl must use https://. For local development only, pass allowInsecureHttp: true."
      );
    }

    this.apiKey = apiKey;
    this.developerToken = developerToken;
    this.baseUrl = normalizedBaseUrl;
    this.siteGuard = new SiteGuardNamespace(this.request.bind(this));
  }

  verify(input: VerifyInput, options?: VerifyCallOptions): Promise<VerifyResult> {
    return this.request<VerifyResult>("/api/verify", {
      method: "POST",
      body: input,
      signal: options?.signal
    });
  }

  executeAction(input: ExecuteActionInput): Promise<ExecuteActionResult> {
    return this.request<ExecuteActionResult>("/api/actions/execute", {
      method: "POST",
      body: input
    });
  }

  createAgent(input: string | CreateAgentInput): Promise<CreateAgentResult> {
    const body = typeof input === "string" ? { name: input } : input;
    if (!body?.name || typeof body.name !== "string") {
      throw new Error("BehalfID: agent name is required.");
    }

    return this.request<CreateAgentResult>("/api/agents", {
      method: "POST",
      body
    });
  }

  createPermission(input: CreatePermissionInput): Promise<CreatePermissionResult> {
    return this.request<CreatePermissionResult>("/api/permissions", {
      method: "POST",
      body: input
    });
  }

  rotateKey(agentId: string): Promise<RotateKeyResult> {
    if (!agentId || typeof agentId !== "string") {
      throw new Error("BehalfID: agentId is required.");
    }

    return this.request<RotateKeyResult>(`/api/agents/${encodeURIComponent(agentId)}/rotate-key`, {
      method: "POST"
    });
  }

  getLogs(agentId: string): Promise<VerificationLog[]> {
    if (!agentId || typeof agentId !== "string") {
      throw new Error("BehalfID: agentId is required.");
    }

    return this.request<VerificationLog[]>(`/api/logs/${encodeURIComponent(agentId)}`);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(this.developerToken ? { "X-Developer-Token": this.developerToken } : {}),
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" })
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal
      });
    } catch {
      if (options.signal?.aborted) {
        throw new Error("BehalfID: Request aborted.");
      }
      throw new Error("BehalfID: Network request failed.");
    }

    const body = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const message = redactSecrets(
        extractErrorMessage(body) ?? `Request failed with status ${response.status}.`
      );
      throw new Error(`BehalfID: ${message}`);
    }

    if (body === null) {
      throw new Error("BehalfID: Expected JSON response.");
    }

    return body as T;
  }
}

function extractErrorMessage(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }

  return null;
}

function redactSecrets(message: string) {
  return message
    .replace(/bhf_sk_[A-Za-z0-9_-]+/g, "bhf_sk_[redacted]")
    .replace(/bhf_site_[A-Za-z0-9_-]+/g, "bhf_site_[redacted]")
    .replace(/bhf_dev_[A-Za-z0-9_-]+/g, "bhf_dev_[redacted]")
    .replace(/bhf_pass_[A-Za-z0-9_-]+/g, "bhf_pass_[redacted]")
    .replace(/whsec_[A-Za-z0-9_-]+/g, "whsec_[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]");
}
