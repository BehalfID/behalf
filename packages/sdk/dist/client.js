import { SiteGuardNamespace } from "./site-guard.js";
const DEFAULT_BASE_URL = "https://behalfid.com";
export class BehalfID {
    apiKey;
    developerToken;
    baseUrl;
    /**
     * Site Guard namespace. Use a `bhf_site_...` key as `apiKey` and call
     * `behalf.siteGuard.check({ path, userAgent, agentIdentifier })`.
     *
     * @see https://behalfid.com/docs/site-guard
     */
    siteGuard;
    constructor({ apiKey, developerToken, baseUrl = DEFAULT_BASE_URL, allowInsecureHttp = false }) {
        if (!apiKey || typeof apiKey !== "string") {
            throw new Error("BehalfID: apiKey is required.");
        }
        if (!apiKey.startsWith("bhf_sk_") && !apiKey.startsWith("bhf_site_")) {
            throw new Error("BehalfID: apiKey must be a valid agent key (bhf_sk_...) or site key (bhf_site_...).");
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
        let parsedBaseUrl;
        try {
            parsedBaseUrl = new URL(normalizedBaseUrl);
        }
        catch {
            throw new Error("BehalfID: baseUrl must be a valid URL.");
        }
        if (parsedBaseUrl.protocol === "http:" && !allowInsecureHttp) {
            throw new Error("BehalfID: baseUrl must use https://. For local development only, pass allowInsecureHttp: true.");
        }
        this.apiKey = apiKey;
        this.developerToken = developerToken;
        this.baseUrl = normalizedBaseUrl;
        this.siteGuard = new SiteGuardNamespace(this.request.bind(this));
    }
    verify(input, options) {
        return this.request("/api/verify", {
            method: "POST",
            body: input,
            signal: options?.signal
        });
    }
    executeAction(input) {
        return this.request("/api/actions/execute", {
            method: "POST",
            body: input
        });
    }
    createAgent(input) {
        const body = typeof input === "string" ? { name: input } : input;
        if (!body?.name || typeof body.name !== "string") {
            throw new Error("BehalfID: agent name is required.");
        }
        return this.request("/api/agents", {
            method: "POST",
            body
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
                    ...(this.developerToken ? { "X-Developer-Token": this.developerToken } : {}),
                    ...(options.body === undefined ? {} : { "Content-Type": "application/json" })
                },
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                signal: options.signal
            });
        }
        catch {
            if (options.signal?.aborted) {
                throw new Error("BehalfID: Request aborted.");
            }
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
    return message
        .replace(/bhf_sk_[A-Za-z0-9_-]+/g, "bhf_sk_[redacted]")
        .replace(/bhf_site_[A-Za-z0-9_-]+/g, "bhf_site_[redacted]")
        .replace(/bhf_dev_[A-Za-z0-9_-]+/g, "bhf_dev_[redacted]")
        .replace(/bhf_pass_[A-Za-z0-9_-]+/g, "bhf_pass_[redacted]")
        .replace(/whsec_[A-Za-z0-9_-]+/g, "whsec_[redacted]")
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]");
}
