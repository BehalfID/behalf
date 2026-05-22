import { createPublicId } from "@/lib/ids";
import Site, { type SiteDocument } from "@/models/Site";
import SiteAccessLog from "@/models/SiteAccessLog";
import SiteAccessRule, { type SiteAccessRuleDocument } from "@/models/SiteAccessRule";

export type SiteGuardMetadata = Record<string, unknown>;

export type SiteGuardInput = {
  accountId: string;
  developerUserId: string;
  siteId?: string;
  domain?: string;
  path: string;
  userAgent: string;
  agentIdentifier?: string;
  metadata?: SiteGuardMetadata;
};

type SiteGuardRisk = "low" | "medium" | "high";

export type SiteGuardDecision = {
  requestId: string;
  siteId: string | null;
  matchedRuleId: string | null;
  allowed: boolean;
  reason: string;
  risk: SiteGuardRisk;
};

type DecisionWithoutRequest = Omit<SiteGuardDecision, "requestId" | "siteId">;

const REDACTED_METADATA_KEY = /(authorization|cookie|password|secret|token|api.?key)/i;

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function trimSignal(value: string | undefined, max: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export function normalizeSiteDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (!domain || domain.length > 253 || domain.includes("/") || domain.includes(":")) {
    return null;
  }

  return /^[a-z0-9.-]+$/.test(domain) ? domain : null;
}

export function normalizeSitePath(value: string) {
  const path = value.trim();
  if (!path.startsWith("/") || path.length > 500 || path.includes("?") || path.includes("#")) {
    return null;
  }

  return path.replace(/\/{2,}/g, "/");
}

export function sitePathMatches(pattern: string, path: string) {
  const normalizedPattern = normalizeSitePath(pattern);
  const normalizedPath = normalizeSitePath(path);
  if (!normalizedPattern || !normalizedPath) return false;
  const matcher = `^${escapeRegExp(normalizedPattern).replaceAll("*", ".*")}$`;
  return new RegExp(matcher).test(normalizedPath);
}

function signalPatternMatches(pattern: string | null | undefined, value: string | undefined) {
  if (!pattern || !value) return false;
  const matcher = `^${escapeRegExp(pattern.trim()).replaceAll("*", ".*")}$`;
  return new RegExp(matcher, "i").test(value.trim());
}

function ruleMatchesSignal(rule: SiteAccessRuleDocument, input: SiteGuardInput) {
  const identifierMatch =
    Boolean(rule.agentIdentifier) &&
    rule.agentIdentifier?.trim().toLowerCase() === input.agentIdentifier?.trim().toLowerCase();
  const userAgentMatch = signalPatternMatches(rule.userAgentPattern, input.userAgent);

  return identifierMatch || userAgentMatch;
}

function pathListMatches(patterns: string[] | undefined, path: string) {
  return (patterns ?? []).some((pattern) => sitePathMatches(pattern, path));
}

export function evaluateSiteAccess(
  site: Pick<SiteDocument, "status"> | null,
  rules: SiteAccessRuleDocument[],
  input: SiteGuardInput
): DecisionWithoutRequest {
  if (!site) {
    return {
      allowed: false,
      matchedRuleId: null,
      reason: "Site not found.",
      risk: "high"
    };
  }

  if (site.status !== "active") {
    return {
      allowed: false,
      matchedRuleId: null,
      reason: "Site is disabled.",
      risk: "high"
    };
  }

  const activeRules = rules.filter((rule) => rule.status === "active" && ruleMatchesSignal(rule, input));
  const blockingRule = activeRules.find((rule) => pathListMatches(rule.blockedPaths, input.path));
  if (blockingRule) {
    return {
      allowed: false,
      matchedRuleId: blockingRule.ruleId,
      reason: "Path is blocked by an active Site Guard rule.",
      risk: "high"
    };
  }

  const approvalRule = activeRules.find(
    (rule) => rule.requiresApproval && pathListMatches(rule.allowedPaths, input.path)
  );
  if (approvalRule) {
    return {
      allowed: false,
      matchedRuleId: approvalRule.ruleId,
      reason: "Site Guard rule requires approval before access.",
      risk: "medium"
    };
  }

  const allowedRule = activeRules.find((rule) => pathListMatches(rule.allowedPaths, input.path));
  if (allowedRule) {
    return {
      allowed: true,
      matchedRuleId: allowedRule.ruleId,
      reason: "Path allowed by an active Site Guard rule.",
      risk: "low"
    };
  }

  return {
    allowed: false,
    matchedRuleId: activeRules[0]?.ruleId ?? null,
    reason: activeRules.length
      ? "No active Site Guard rule allows this path."
      : "No matching active Site Guard rule.",
    risk: "high"
  };
}

export function sanitizeSiteGuardMetadata(metadata: SiteGuardMetadata | undefined) {
  if (!metadata) return undefined;

  return Object.fromEntries(
    Object.entries(metadata)
      .slice(0, 10)
      .map(([key, value]) => {
        const safeKey = key.slice(0, 80);
        if (REDACTED_METADATA_KEY.test(safeKey)) return [safeKey, "[redacted]"];
        if (typeof value === "string") return [safeKey, value.slice(0, 200)];
        if (typeof value === "number" || typeof value === "boolean" || value === null) return [safeKey, value];
        return [safeKey, "[omitted]"];
      })
  );
}

export function parseSiteGuardPaths(value: unknown, field: "allowedPaths" | "blockedPaths") {
  if (!Array.isArray(value)) {
    return { paths: null, error: `${field} must be an array of paths.` };
  }
  if (value.length > 40) {
    return { paths: null, error: `${field} must have 40 paths or fewer.` };
  }

  const paths: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return { paths: null, error: `${field} must contain strings.` };
    const path = normalizeSitePath(entry);
    if (!path) return { paths: null, error: `${field} must contain absolute paths without queries or fragments.` };
    paths.push(path);
  }

  return { paths, error: null };
}

function createLog(site: SiteDocument, input: SiteGuardInput, decision: SiteGuardDecision) {
  return SiteAccessLog.create({
    requestId: decision.requestId,
    siteId: site.siteId,
    accountId: site.accountId,
    developerUserId: site.developerUserId,
    ruleId: decision.matchedRuleId,
    domain: site.domain,
    path: input.path,
    userAgent: input.userAgent,
    agentIdentifier: input.agentIdentifier,
    allowed: decision.allowed,
    reason: decision.reason,
    risk: decision.risk
  });
}

export async function checkSiteAccess(input: SiteGuardInput): Promise<SiteGuardDecision> {
  const requestId = createPublicId("req");
  const domain = input.domain ? normalizeSiteDomain(input.domain) : null;
  let site: SiteDocument | null = null;

  try {
    site = await Site.findOne({
      accountId: input.accountId,
      developerUserId: input.developerUserId,
      ...(input.siteId ? { siteId: input.siteId } : { domain })
    });
    const rules = site
      ? await SiteAccessRule.find({
          accountId: input.accountId,
          developerUserId: input.developerUserId,
          siteId: site.siteId
        }).sort({ createdAt: -1 })
      : [];
    const decision = {
      requestId,
      siteId: site?.siteId ?? null,
      ...evaluateSiteAccess(site, rules, input)
    };

    if (site) await createLog(site, input, decision);
    return decision;
  } catch {
    const decision = {
      requestId,
      siteId: site?.siteId ?? null,
      matchedRuleId: null,
      allowed: false,
      reason: "Site Guard failed closed.",
      risk: "high" as const
    };

    if (site) {
      await createLog(site, input, decision).catch(() => undefined);
    }

    return decision;
  }
}

export function cleanSiteGuardInput(input: SiteGuardInput): SiteGuardInput {
  return {
    ...input,
    siteId: trimSignal(input.siteId, 180),
    domain: input.domain ? normalizeSiteDomain(input.domain) ?? undefined : undefined,
    path: normalizeSitePath(input.path) ?? input.path.trim().slice(0, 500),
    userAgent: input.userAgent.trim().slice(0, 500),
    agentIdentifier: trimSignal(input.agentIdentifier, 180),
    metadata: sanitizeSiteGuardMetadata(input.metadata)
  };
}
