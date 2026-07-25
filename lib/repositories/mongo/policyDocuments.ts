import type {
  DecisionOutcome,
  PolicyDocument,
  PolicyPredicate,
  PolicyRule
} from "@/lib/policyEngine/types";
import PolicyDocumentModel, {
  type PolicyDocumentRecord
} from "@/models/PolicyDocument";

export type PolicyDocumentLean = PolicyDocumentRecord;

export type StoredPolicyDocument = PolicyDocument & {
  policyId: string;
  name?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

const PREDICATE_TYPES = new Set<PolicyPredicate["type"]>([
  "path_glob",
  "diff_lines_lt",
  "diff_lines_lte",
  "ci_status",
  "risk",
  "action",
  "vendor",
  "permission_requires_approval"
]);

const OUTCOMES = new Set<DecisionOutcome>(["allow", "auto_approve", "require_human", "deny"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePolicyRules(rules: unknown): { rules: PolicyRule[]; error: string | null } {
  if (!Array.isArray(rules)) {
    return { rules: [], error: "rules must be an array." };
  }
  if (rules.length > 200) {
    return { rules: [], error: "rules cannot exceed 200 entries." };
  }

  const normalized: PolicyRule[] = [];
  const seenIds = new Set<string>();

  for (const [index, entry] of rules.entries()) {
    if (!isRecord(entry)) {
      return { rules: [], error: `rules[${index}] must be an object.` };
    }
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) return { rules: [], error: `rules[${index}].id is required.` };
    if (seenIds.has(id)) return { rules: [], error: `Duplicate rule id: ${id}.` };
    seenIds.add(id);

    if (typeof entry.priority !== "number" || !Number.isFinite(entry.priority)) {
      return { rules: [], error: `rules[${index}].priority must be a number.` };
    }
    if (typeof entry.reason !== "string" || !entry.reason.trim()) {
      return { rules: [], error: `rules[${index}].reason is required.` };
    }
    if (typeof entry.then !== "string" || !OUTCOMES.has(entry.then as DecisionOutcome)) {
      return {
        rules: [],
        error: `rules[${index}].then must be one of allow|auto_approve|require_human|deny.`
      };
    }
    if (!Array.isArray(entry.when)) {
      return { rules: [], error: `rules[${index}].when must be an array.` };
    }

    const when: PolicyPredicate[] = [];
    for (const [pIndex, predicate] of entry.when.entries()) {
      if (!isRecord(predicate) || typeof predicate.type !== "string") {
        return { rules: [], error: `rules[${index}].when[${pIndex}] is invalid.` };
      }
      if (!PREDICATE_TYPES.has(predicate.type as PolicyPredicate["type"])) {
        return {
          rules: [],
          error: `rules[${index}].when[${pIndex}].type is unsupported.`
        };
      }
      when.push(predicate as PolicyPredicate);
    }

    normalized.push({
      id,
      priority: entry.priority,
      when,
      then: entry.then as DecisionOutcome,
      reason: entry.reason.trim()
    });
  }

  return { rules: normalized, error: null };
}

export function toEnginePolicyDocument(doc: PolicyDocumentLean): PolicyDocument {
  return {
    accountId: doc.accountId,
    version: doc.version,
    enabled: Boolean(doc.enabled),
    rules: (doc.rules ?? []) as PolicyRule[]
  };
}

export function toStoredPolicyDocument(doc: PolicyDocumentLean): StoredPolicyDocument {
  return {
    policyId: doc.policyId,
    accountId: doc.accountId,
    version: doc.version,
    enabled: Boolean(doc.enabled),
    rules: (doc.rules ?? []) as PolicyRule[],
    name: doc.name ?? undefined,
    updatedBy: doc.updatedBy ?? undefined,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : undefined,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : undefined
  };
}

export async function findActivePolicyByAccountId(
  accountId: string
): Promise<PolicyDocumentLean | null> {
  return PolicyDocumentModel.findOne({ accountId, enabled: true }).lean();
}

export async function findPolicyByAccountId(
  accountId: string
): Promise<PolicyDocumentLean | null> {
  return PolicyDocumentModel.findOne({ accountId }).lean();
}

export type UpsertPolicyInput = {
  accountId: string;
  policyId: string;
  name?: string;
  enabled: boolean;
  rules: PolicyRule[];
  updatedBy: string;
};

export async function upsertPolicyDocument(input: UpsertPolicyInput): Promise<PolicyDocumentLean> {
  const existing = await PolicyDocumentModel.findOne({ accountId: input.accountId });
  if (!existing) {
    const created = await PolicyDocumentModel.create({
      policyId: input.policyId,
      accountId: input.accountId,
      name: input.name,
      version: 1,
      enabled: input.enabled,
      rules: input.rules,
      updatedBy: input.updatedBy
    });
    return created.toObject() as PolicyDocumentLean;
  }

  existing.name = input.name;
  existing.enabled = input.enabled;
  existing.rules = input.rules as typeof existing.rules;
  existing.updatedBy = input.updatedBy;
  existing.version = (existing.version ?? 1) + 1;
  await existing.save();
  return existing.toObject() as PolicyDocumentLean;
}

export async function updatePolicyDocument(
  accountId: string,
  update: Partial<Pick<PolicyDocumentLean, "name" | "enabled" | "rules" | "updatedBy">>
): Promise<PolicyDocumentLean | null> {
  const existing = await PolicyDocumentModel.findOne({ accountId });
  if (!existing) return null;

  if (update.name !== undefined) existing.name = update.name;
  if (update.enabled !== undefined) existing.enabled = update.enabled;
  if (update.rules !== undefined) existing.rules = update.rules as typeof existing.rules;
  if (update.updatedBy !== undefined) existing.updatedBy = update.updatedBy;
  existing.version = (existing.version ?? 1) + 1;
  await existing.save();
  return existing.toObject() as PolicyDocumentLean;
}

export async function deletePolicyDocument(accountId: string) {
  return PolicyDocumentModel.deleteOne({ accountId });
}
