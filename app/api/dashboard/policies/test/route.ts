import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import {
  getWorkspaceActor,
  viewerMutationForbidden
} from "@/lib/delegatedAuth";
import { buildPolicyFacts } from "@/lib/policyEngine/facts";
import { evaluateGuardrailRules } from "@/lib/policyEngine/evaluate";
import {
  isPolicyCiStatus,
  isPolicyRiskLevel
} from "@/lib/policyEngine/predicates";
import type { PolicyFacts, PolicyRiskLevel, PolicyRule } from "@/lib/policyEngine/types";
import { readJsonObject } from "@/lib/request";
import { validatePolicyRules } from "@/lib/repositories/policyDocuments";
import { jsonError } from "@/lib/responses";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";

function parseFacts(raw: unknown): { facts: PolicyFacts | null; error: string | null } {
  if (!isRecord(raw)) return { facts: null, error: "facts must be an object." };

  const action = readString(raw.action);
  if (!action) return { facts: null, error: "facts.action is required." };

  const risk: PolicyRiskLevel = isPolicyRiskLevel(raw.risk) ? raw.risk : "medium";
  const paths = Array.isArray(raw.paths)
    ? raw.paths.filter((value): value is string => typeof value === "string")
    : [];

  const facts = buildPolicyFacts({
    action,
    vendor: raw.vendor === undefined ? undefined : readString(raw.vendor),
    paths,
    command: raw.command === undefined ? undefined : readString(raw.command),
    risk,
    permissionRequiresApproval:
      raw.permissionRequiresApproval === undefined
        ? true
        : raw.permissionRequiresApproval === true,
    metadata: isRecord(raw.metadata) ? raw.metadata : undefined,
    policyContext: {
      ...(isRecord(raw.diff)
        ? {
            diff: {
              linesChanged:
                typeof raw.diff.linesChanged === "number"
                  ? raw.diff.linesChanged
                  : typeof raw.diff.lines_changed === "number"
                    ? raw.diff.lines_changed
                    : undefined,
              files: Array.isArray(raw.diff.files)
                ? raw.diff.files.filter((v): v is string => typeof v === "string")
                : undefined
            }
          }
        : {}),
      ...(isRecord(raw.ci) && isPolicyCiStatus(raw.ci.status)
        ? { ci: { status: raw.ci.status, checks: Array.isArray(raw.ci.checks) ? raw.ci.checks.filter((v): v is string => typeof v === "string") : undefined } }
        : {})
    }
  });

  return { facts, error: null };
}

/**
 * Dry-run policy evaluation without mutating stored PolicyDocument.
 * Body: { rules?: PolicyRule[], facts: PolicyFacts-like }
 * If rules omitted, evaluates the account's stored policy rules (or empty).
 */
export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);
  if (actor.authorityLevel <= 10) return viewerMutationForbidden();

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["rules", "facts"]);
  if (unknownError) return jsonError(unknownError);

  let rules: PolicyRule[];
  if (body.rules !== undefined) {
    const validated = validatePolicyRules(body.rules);
    if (validated.error) return jsonError(validated.error);
    rules = validated.rules;
  } else {
    const { findPolicyByAccountId } = await import("@/lib/repositories/policyDocuments");
    const stored = await findPolicyByAccountId(actor.accountId);
    rules = (stored?.rules ?? []) as unknown as PolicyRule[];
  }

  const parsed = parseFacts(body.facts);
  if (parsed.error || !parsed.facts) return jsonError(parsed.error ?? "facts are required.");

  const evaluation = evaluateGuardrailRules(rules, parsed.facts);
  return NextResponse.json({
    evaluation: {
      outcome: evaluation.outcome,
      matchedRuleId: evaluation.matchedRuleId ?? null,
      reason: evaluation.reason,
      facts: evaluation.facts
    }
  });
}
