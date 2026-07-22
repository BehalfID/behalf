import {
  isPolicyCiStatus,
  isPolicyRiskLevel
} from "@/lib/policyEngine/predicates";
import type {
  PolicyCiFacts,
  PolicyDiffFacts,
  PolicyFacts,
  PolicyRiskLevel
} from "@/lib/policyEngine/types";

type FactsInput = {
  action: string;
  vendor?: string;
  paths?: string[];
  command?: string;
  risk?: PolicyRiskLevel;
  permissionRequiresApproval: boolean;
  metadata?: Record<string, unknown>;
  policyContext?: Record<string, unknown>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function extractDiff(
  policyContext?: Record<string, unknown>,
  metadata?: Record<string, unknown>
): PolicyDiffFacts | undefined {
  const sources = [policyContext?.diff, metadata?.diff, metadata?._diff];
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    const linesChanged = readNumber(source.linesChanged) ?? readNumber(source.lines_changed);
    if (typeof linesChanged !== "number") continue;
    const files = readStringArray(source.files) ?? [];
    return { linesChanged, files };
  }
  return undefined;
}

function extractCi(
  policyContext?: Record<string, unknown>,
  metadata?: Record<string, unknown>
): PolicyCiFacts | undefined {
  const sources = [policyContext?.ci, metadata?.ci, metadata?._ci];
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    const rawStatus = source.status ?? source.conclusion;
    if (!isPolicyCiStatus(rawStatus)) continue;
    const checks = readStringArray(source.checks);
    return checks ? { status: rawStatus, checks } : { status: rawStatus };
  }
  return undefined;
}

/**
 * Build PolicyFacts for guardrail evaluation. Paths/command should already be
 * resolved by the caller (verify extracts them from policyContext).
 */
export function buildPolicyFacts(input: FactsInput): PolicyFacts {
  const risk: PolicyRiskLevel = isPolicyRiskLevel(input.risk) ? input.risk : "medium";
  const facts: PolicyFacts = {
    action: input.action,
    paths: input.paths ?? [],
    risk,
    permissionRequiresApproval: input.permissionRequiresApproval
  };

  if (input.vendor) facts.vendor = input.vendor;
  if (input.command) facts.command = input.command;
  if (input.metadata) facts.metadata = input.metadata;

  const diff = extractDiff(input.policyContext, input.metadata);
  if (diff) facts.diff = diff;

  const ci = extractCi(input.policyContext, input.metadata);
  if (ci) facts.ci = ci;

  return facts;
}
