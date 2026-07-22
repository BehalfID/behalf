import crypto from "crypto";
import { timingSafeEqualString } from "@/lib/crypto";
import { isInternalHostname, isPrivateIpAddress, normalizeHostname } from "@/lib/ssrf";
import { verifyAction } from "@/lib/verify";

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

const TICKET_TTL_MS = 60_000;
const DEFAULT_DENY_HOSTS = [
  "metadata",
  "metadata.google.internal",
  "169.254.169.254",
  "metadata.azure.com",
  "instance-data"
];

function ticketSecret() {
  return (
    process.env.BEHALFID_EGRESS_TICKET_SECRET?.trim() ||
    process.env.BEHALFID_WEBHOOK_SIGNING_PEPPER?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "behalfid-dev-egress-ticket-secret"
  );
}

function parseHostList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function hostMatchesPattern(host: string, pattern: string): boolean {
  const h = normalizeHostname(host);
  const p = normalizeHostname(pattern);
  if (p.startsWith("*.") && p.length > 2) {
    const suffix = p.slice(1);
    return h.endsWith(suffix) || h === p.slice(2);
  }
  return h === p;
}

export function hostInList(host: string, patterns: string[]): boolean {
  return patterns.some((pattern) => hostMatchesPattern(host, pattern));
}

export function platformAllowHosts(): string[] {
  const hosts = new Set<string>();
  for (const raw of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_BASE_URL,
    process.env.BEHALFID_BASE_URL,
    "https://behalfid.com"
  ]) {
    if (!raw) continue;
    try {
      hosts.add(normalizeHostname(new URL(raw).hostname));
    } catch {
      // ignore
    }
  }
  return [...hosts];
}

export function isBlockedEgressHost(host: string): { blocked: boolean; reason?: string } {
  const normalized = normalizeHostname(host);
  if (!normalized) return { blocked: true, reason: "Host is required." };

  const deny = [...DEFAULT_DENY_HOSTS, ...parseHostList(process.env.BEHALFID_EGRESS_DENY_HOSTS)];
  if (hostInList(normalized, deny)) {
    return { blocked: true, reason: "Host is on the egress denylist." };
  }

  if (isPrivateIpAddress(normalized) || isInternalHostname(normalized)) {
    return { blocked: true, reason: "Private or internal hosts are blocked for agent egress." };
  }

  return { blocked: false };
}

export function mintEgressTicket(input: {
  agentId: string;
  host: string;
  port: number;
  expiresAt: Date;
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      agentId: input.agentId,
      host: normalizeHostname(input.host),
      port: input.port,
      exp: Math.floor(input.expiresAt.getTime() / 1000)
    }),
    "utf8"
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
  return `bhf_egress_${payload}.${sig}`;
}

export function verifyEgressTicket(
  ticket: string,
  expected: { agentId: string; host: string; port: number },
  now = new Date()
): boolean {
  if (!ticket.startsWith("bhf_egress_")) return false;
  const raw = ticket.slice("bhf_egress_".length);
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return false;
  const expectedSig = crypto.createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
  if (!timingSafeEqualString(expectedSig, sig)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      agentId?: string;
      host?: string;
      port?: number;
      exp?: number;
    };
    if (parsed.agentId !== expected.agentId) return false;
    if (normalizeHostname(String(parsed.host ?? "")) !== normalizeHostname(expected.host)) {
      return false;
    }
    if (parsed.port !== expected.port) return false;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 < now.getTime()) return false;
    return true;
  } catch {
    return false;
  }
}

export async function authorizeEgressRequest(input: {
  request: EgressAuthorizeRequest;
  accountId?: string;
  developerUserId?: string;
  agentStatus?: string | null;
}): Promise<EgressAuthorizeResponse> {
  const host = normalizeHostname(input.request.host);
  const port = input.request.port;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { allowed: false, reason: "Invalid host or port.", risk: "high" };
  }

  const method = (input.request.method || "GET").toUpperCase();
  const url =
    input.request.url?.trim() ||
    `${input.request.protocol === "http" ? "http" : "https"}://${host}:${port}/`;

  if (hostInList(host, platformAllowHosts())) {
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
    return {
      allowed: true,
      reason: "Platform API host is always allowed for egress.",
      risk: "low",
      ticket: mintEgressTicket({ agentId: input.request.agentId, host, port, expiresAt }),
      expiresAt: expiresAt.toISOString()
    };
  }

  const allow = parseHostList(process.env.BEHALFID_EGRESS_ALLOW_HOSTS);
  if (allow.length > 0 && hostInList(host, allow)) {
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
    return {
      allowed: true,
      reason: "Host matched egress allowlist.",
      risk: "low",
      ticket: mintEgressTicket({ agentId: input.request.agentId, host, port, expiresAt }),
      expiresAt: expiresAt.toISOString()
    };
  }

  const blocked = isBlockedEgressHost(host);
  if (blocked.blocked) {
    return { allowed: false, reason: blocked.reason ?? "Host blocked.", risk: "high" };
  }

  const decision = await verifyAction({
    agentId: input.request.agentId,
    accountId: input.accountId,
    developerUserId: input.developerUserId,
    agentStatus: input.agentStatus,
    action: "http_request",
    vendor: host,
    metadata: {
      egress: true,
      method,
      url,
      port,
      protocol: input.request.protocol,
      contentType: input.request.contentType,
      bodySha256: input.request.bodySha256,
      bytes: input.request.bytes
    }
  });

  if (!decision.allowed) {
    return {
      allowed: false,
      approvalRequired: decision.approvalRequired,
      approvalId: decision.approvalId,
      reason: decision.reason,
      risk: decision.risk,
      requestId: decision.requestId
    };
  }

  const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
  return {
    allowed: true,
    reason: decision.reason,
    risk: decision.risk,
    requestId: decision.requestId,
    ticket: mintEgressTicket({ agentId: input.request.agentId, host, port, expiresAt }),
    expiresAt: expiresAt.toISOString()
  };
}
