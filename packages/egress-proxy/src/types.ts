export type EgressMode = "off" | "advise" | "enforce";

export type EgressAuthorizeRequest = {
  agentId: string;
  method: string;
  url: string;
  host: string;
  port: number;
  protocol?: "http" | "https" | "connect";
  contentType?: string;
  bodySha256?: string;
  bytes?: number;
};

export type EgressAuthorizeResponse = {
  allowed: boolean;
  approvalRequired?: boolean;
  approvalId?: string | null;
  reason: string;
  risk?: "low" | "medium" | "high";
  ticket?: string;
  expiresAt?: string;
  requestId?: string;
};

export type ParsedProxyTarget = {
  host: string;
  port: number;
  method: string;
  url: string;
  protocol: "http" | "https" | "connect";
};

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

export function parseHostPort(authority: string, defaultPort: number): { host: string; port: number } {
  const trimmed = authority.trim();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end === -1) throw new Error("Invalid IPv6 authority.");
    const host = trimmed.slice(1, end);
    const rest = trimmed.slice(end + 1);
    const port = rest.startsWith(":") ? Number(rest.slice(1)) : defaultPort;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port.");
    return { host: normalizeHost(host), port };
  }
  const idx = trimmed.lastIndexOf(":");
  if (idx > 0 && trimmed.indexOf(":") === idx) {
    const host = trimmed.slice(0, idx);
    const port = Number(trimmed.slice(idx + 1));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port.");
    return { host: normalizeHost(host), port };
  }
  return { host: normalizeHost(trimmed), port: defaultPort };
}

export function hostMatchesPattern(host: string, pattern: string): boolean {
  const h = normalizeHost(host);
  const p = normalizeHost(pattern);
  if (p.startsWith("*.") && p.length > 2) {
    const suffix = p.slice(1); // .example.com
    return h.endsWith(suffix) || h === p.slice(2);
  }
  return h === p;
}

export function hostInList(host: string, patterns: string[]): boolean {
  return patterns.some((pattern) => hostMatchesPattern(host, pattern));
}
