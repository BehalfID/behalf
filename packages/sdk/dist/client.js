const DEFAULT_BASE_URL = "https://behalfid.vercel.app";
export class BehalfID {
    apiKey;
    baseUrl;
    constructor({ apiKey, baseUrl = DEFAULT_BASE_URL }) {
        if (!apiKey || typeof apiKey !== "string") {
            throw new Error("BehalfID: apiKey is required.");
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/+$/, "");
    }
    verify(input) {
        return this.request("/api/verify", {
            method: "POST",
            body: input
        });
    }
    createAgent(name) {
        if (!name || typeof name !== "string") {
            throw new Error("BehalfID: agent name is required.");
        }
        return this.request("/api/agents", {
            method: "POST",
            body: { name }
        });
    }
    createPermission(input) {
        return this.request("/api/permissions", {
            method: "POST",
            body: input
        });
    }
    rotateKey(agentId) {
        if (!agentId || typeof agentId !== "string") {
            throw new Error("BehalfID: agentId is required.");
        }
        return this.request(`/api/agents/${encodeURIComponent(agentId)}/rotate-key`, {
            method: "POST"
        });
    }
    getLogs(agentId) {
        if (!agentId || typeof agentId !== "string") {
            throw new Error("BehalfID: agentId is required.");
        }
        return this.request(`/api/logs/${encodeURIComponent(agentId)}`);
    }
    async request(path, options = {}) {
        let response;
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
        }
        catch {
            throw new Error("BehalfID: Network request failed.");
        }
        const body = (await response.json().catch(() => null));
        if (!response.ok) {
            const message = redactSecrets(extractErrorMessage(body) ?? `Request failed with status ${response.status}.`);
            throw new Error(`BehalfID: ${message}`);
        }
        if (body === null) {
            throw new Error("BehalfID: Expected JSON response.");
        }
        return body;
    }
}
function extractErrorMessage(body) {
    if (typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string") {
        return body.error;
    }
    return null;
}
function redactSecrets(message) {
    return message.replace(/bhf_sk_[A-Za-z0-9_-]+/g, "bhf_sk_[redacted]");
}
