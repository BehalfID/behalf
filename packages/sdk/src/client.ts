import type {
  BehalfIDConfig,
  CreateAgentResult,
  CreatePermissionInput,
  CreatePermissionResult,
  RotateKeyResult,
  VerificationLog,
  VerifyInput,
  VerifyResult
} from "./types.js";

type RequestOptions = {
  method?: string;
  body?: unknown;
};

const DEFAULT_BASE_URL = "https://behalfid.vercel.app";

export class BehalfID {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL }: BehalfIDConfig) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error("BehalfID: apiKey is required.");
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  verify(input: VerifyInput): Promise<VerifyResult> {
    return this.request<VerifyResult>("/api/verify", {
      method: "POST",
      body: input
    });
  }

  createAgent(name: string): Promise<CreateAgentResult> {
    if (!name || typeof name !== "string") {
      throw new Error("BehalfID: agent name is required.");
    }

    return this.request<CreateAgentResult>("/api/agents", {
      method: "POST",
      body: { name }
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
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" })
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
    } catch {
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
  return message.replace(/bhf_sk_[A-Za-z0-9_-]+/g, "bhf_sk_[redacted]");
}
