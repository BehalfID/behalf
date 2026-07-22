import { createPublicId } from "@/lib/ids";
import { getEffectiveRequiredAuthority } from "@/lib/delegatedAuth";
import { recordAgentKeyUse } from "@/lib/auth";
import {
  APPROVAL_TARGET_REQUIRED_REASON,
  buildApprovalIntent,
  isBindableAgentAction,
  type ApprovalIntent
} from "@/lib/approvalIntent";
import {
  emitApprovalRequested,
  emitApprovalUsed
} from "@/lib/approvals/emitLifecycle";
import { isAbsolutePath, lexicalNormalizePath } from "@/lib/pathCanonical";
import {
  buildPolicyFacts,
  evaluateGuardrailRules,
  loadPolicyDocument,
  type PolicyEvaluation
} from "@/lib/policyEngine";
import {
  consumeApprovedGrant,
  upsertPendingAgentAction
} from "@/lib/repositories/approvals";
import {
  findMatchingForVerify,
  updatePermission
} from "@/lib/repositories/permissions";
import { createLog } from "@/lib/repositories/verificationLogs";
import type { PermissionLean as PermissionDocument } from "@/lib/repositories/permissions";

export { lexicalNormalizePath } from "@/lib/pathCanonical";

/** Non-persisted policy-evaluation context (e.g. from Claude Code PreToolUse). */
export type PolicyToolInput = {
  filePath?: string;
  command?: string;
  /** Snake_case aliases accepted for compatibility with hook/transport variants. */
  file_path?: string;
  path?: string;
  notebook_path?: string;
  notebookPath?: string;
};

export type PolicyContext = {
  source?: string;
  toolName?: string;
  tool_name?: string;
  cwd?: string;
  home?: string;
  toolInput?: PolicyToolInput;
  tool_input?: PolicyToolInput | string;
  /** Optional diff facts for guardrail evaluation (not persisted). */
  diff?: { linesChanged?: number; lines_changed?: number; files?: string[] };
  /** Optional CI facts for guardrail evaluation (not persisted). */
  ci?: { status?: string; conclusion?: string; checks?: string[] };
};

type VerifyInput = {
  agentId: string;
  accountId?: string;
  developerUserId?: string;
  agentStatus?: string | null;
  action: string;
  amount?: number;
  vendor?: string;
  metadata?: Record<string, unknown>;
  /**
   * Constraint-relevant arguments used only during policy evaluation.
   * Never persisted to VerificationLog and never included in webhook payloads.
   */
  policyContext?: PolicyContext;
  enforcementDenyReason?: string;
  shadow?: boolean;
};

/** Max serialized size accepted by POST /api/verify for policyContext. */
export const POLICY_CONTEXT_MAX_BYTES = 16 * 1024;

type ShadowDecision = {
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
};

type VerificationDecision = {
  requestId: string;
  allowed: boolean;
  approvalRequired?: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  shadow?: boolean;
  shadowDecision?: ShadowDecision;
};

type RawDecision = Omit<VerificationDecision, "requestId">;

function isExpired(permission: PermissionDocument) {
  const expiresAt = permission.constraints?.expiresAt;
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
}

function listIncludes(values: string[] | undefined, value: string) {
  return (values ?? []).some((item) => item === value);
}

function listValueMatches(values: string[] | undefined, value: string | undefined) {
  if (!value) return false;
  return (values ?? [])
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean)
    .some((item) => item === value);
}

function globMatch(pattern: string, value: string): boolean {
  let reStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      i += 2;
      if (i < pattern.length && pattern[i] === "/") {
        reStr += "(?:.*\\/)?";
        i++;
      } else {
        reStr += ".*";
      }
    } else if (ch === "*") {
      reStr += "[^/]*";
      i++;
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      reStr += "\\" + ch;
      i++;
    } else {
      reStr += ch;
      i++;
    }
  }
  return new RegExp("^" + reStr + "$").test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function pathsEqualForPrefix(a: string, b: string): boolean {
  // Windows drive letters are case-insensitive for prefix checks.
  if (/^[A-Za-z]:\//.test(a) && /^[A-Za-z]:\//.test(b)) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

function stripPrefixPath(full: string, base: string): string | undefined {
  const fullNorm = lexicalNormalizePath(full);
  const baseNorm = lexicalNormalizePath(base).replace(/\/+$/, "");
  if (pathsEqualForPrefix(fullNorm, baseNorm)) {
    return ".";
  }
  const baseWithSlash = baseNorm.endsWith("/") ? baseNorm : baseNorm + "/";
  if (/^[A-Za-z]:\//.test(fullNorm) && /^[A-Za-z]:\//.test(baseWithSlash)) {
    if (fullNorm.toLowerCase().startsWith(baseWithSlash.toLowerCase())) {
      return fullNorm.slice(baseWithSlash.length);
    }
    return undefined;
  }
  if (fullNorm.startsWith(baseWithSlash)) {
    return fullNorm.slice(baseWithSlash.length);
  }
  return undefined;
}

/**
 * Produce safe normalized path candidates for glob matching against user
 * patterns that may be relative (`src/**`), absolute, or home-relative (`~/`).
 */
export function pathMatchCandidates(
  filePath: string,
  cwd?: string,
  home?: string
): string[] {
  const candidates = new Set<string>();
  const normalized = lexicalNormalizePath(filePath);
  if (normalized) candidates.add(normalized);

  const cwdNorm = cwd ? lexicalNormalizePath(cwd) : undefined;
  const homeNorm = home ? lexicalNormalizePath(home) : undefined;

  let absolute = normalized;
  if (!isAbsolutePath(normalized) && cwdNorm) {
    const joined = lexicalNormalizePath(
      cwdNorm.endsWith("/") ? cwdNorm + normalized : cwdNorm + "/" + normalized
    );
    absolute = joined;
    candidates.add(joined);
  }

  if (cwdNorm && isAbsolutePath(absolute)) {
    const relative = stripPrefixPath(absolute, cwdNorm);
    if (relative !== undefined) {
      candidates.add(relative);
    }
  }

  if (homeNorm && isAbsolutePath(absolute)) {
    const homeRel = stripPrefixPath(absolute, homeNorm);
    if (homeRel !== undefined) {
      candidates.add(homeRel === "." ? "~" : `~/${homeRel}`);
    }
  }

  // Also try home-relative when the input itself used ~/
  if (normalized.startsWith("~/") || normalized === "~") {
    candidates.add(normalized);
    if (homeNorm) {
      const expanded =
        normalized === "~"
          ? homeNorm
          : lexicalNormalizePath(homeNorm + "/" + normalized.slice(2));
      candidates.add(expanded);
      if (cwdNorm) {
        const relative = stripPrefixPath(expanded, cwdNorm);
        if (relative !== undefined) candidates.add(relative);
      }
    }
  }

  return [...candidates].filter(Boolean);
}

function pathMatchesAny(patterns: string[], candidates: string[]): boolean {
  return patterns.some((pattern) => candidates.some((candidate) => globMatch(pattern, candidate)));
}

function extractToolInputRecord(
  source: Record<string, unknown> | PolicyContext | undefined
): Record<string, unknown> | undefined {
  if (!source) return undefined;
  const nested = (source as Record<string, unknown>).toolInput ?? (source as Record<string, unknown>).tool_input;
  if (isPlainObject(nested)) return nested;
  return undefined;
}

function extractFilePathFromToolInput(toolInput: Record<string, unknown>): string | undefined {
  return (
    readNonEmptyString(toolInput.filePath) ??
    readNonEmptyString(toolInput.file_path) ??
    readNonEmptyString(toolInput.path) ??
    readNonEmptyString(toolInput.notebook_path) ??
    readNonEmptyString(toolInput.notebookPath)
  );
}

/**
 * Resolve the file path used for allowedPaths/deniedPaths evaluation.
 * Supports policyContext, nested metadata.tool_input objects, flat-string
 * metadata.tool_input, and metadata.path — never stringifies objects.
 */
export function extractFilePathForPolicy(input: VerifyInput): string | undefined {
  const fromPolicy = extractToolInputRecord(input.policyContext);
  if (fromPolicy) {
    const path = extractFilePathFromToolInput(fromPolicy);
    if (path) return path;
  }

  const meta = input.metadata;
  if (!meta) return undefined;

  const nested = meta.tool_input ?? meta.toolInput;
  if (isPlainObject(nested)) {
    const path = extractFilePathFromToolInput(nested);
    if (path) return path;
  } else if (typeof nested === "string" && nested.trim()) {
    // Legacy flat-string metadata.tool_input
    return nested;
  }

  return readNonEmptyString(meta.path);
}

/**
 * Resolve the command string used for deniedCommands evaluation.
 * Supports policyContext, nested metadata.tool_input.command, flat-string
 * metadata.tool_input, and metadata.command — never stringifies objects.
 */
export function extractCommandForPolicy(input: VerifyInput): string | undefined {
  const fromPolicy = extractToolInputRecord(input.policyContext);
  if (fromPolicy) {
    const command = readNonEmptyString(fromPolicy.command);
    if (command) return command;
  }

  const meta = input.metadata;
  if (!meta) return undefined;

  const nested = meta.tool_input ?? meta.toolInput;
  if (isPlainObject(nested)) {
    const command = readNonEmptyString(nested.command);
    if (command) return command;
  } else if (typeof nested === "string" && nested.trim()) {
    // Legacy flat-string metadata.tool_input treated as the command
    return nested;
  }

  return readNonEmptyString(meta.command);
}

function extractCwd(input: VerifyInput): string | undefined {
  return (
    readNonEmptyString(input.policyContext?.cwd) ??
    readNonEmptyString(input.metadata?.cwd)
  );
}

function extractHome(input: VerifyInput): string | undefined {
  return (
    readNonEmptyString(input.policyContext?.home) ??
    readNonEmptyString(input.metadata?.home)
  );
}

function evaluateArgumentConstraints(
  permission: PermissionDocument,
  input: VerifyInput
): RawDecision | null {
  const allowedPaths = permission.constraints?.allowedPaths ?? [];
  const deniedPaths = permission.constraints?.deniedPaths ?? [];
  const deniedCommands = (permission.constraints?.deniedCommands ?? []).filter(
    (entry) => typeof entry === "string" && entry.trim().length > 0
  );

  if (
    (allowedPaths.length > 0 || deniedPaths.length > 0) &&
    (input.action === "write_file" || input.action === "read_file")
  ) {
    const filePath = extractFilePathForPolicy(input);
    if (!filePath) {
      return { allowed: false, reason: "path_not_permitted", risk: "high" };
    }
    const candidates = pathMatchCandidates(filePath, extractCwd(input), extractHome(input));
    if (pathMatchesAny(deniedPaths, candidates)) {
      return { allowed: false, reason: "path_not_permitted", risk: "high" };
    }
    if (allowedPaths.length > 0 && !pathMatchesAny(allowedPaths, candidates)) {
      return { allowed: false, reason: "path_not_permitted", risk: "high" };
    }
  }

  if (deniedCommands.length > 0 && input.action === "execute_command") {
    const command = extractCommandForPolicy(input);
    if (!command) {
      return { allowed: false, reason: "command_blocked", risk: "high" };
    }
    // Literal substring match against the complete command string (documented contract).
    if (deniedCommands.some((sub) => command.includes(sub))) {
      return { allowed: false, reason: "command_blocked", risk: "high" };
    }
  }

  return null;
}

function permissionMatchesInput(permission: PermissionDocument, input: VerifyInput) {
  return (
    permission.action === input.action ||
    listIncludes(permission.allowedActions, input.action) ||
    listIncludes(permission.blockedActions, input.action)
  );
}

function isActiveCandidate(permission: PermissionDocument) {
  return permission.status === "active" && !isExpired(permission);
}

/**
 * Hard constraints that can never be bypassed — not even by a human-approved
 * grant. Returns a deny decision if any constraint fails, or null if the
 * request passes every hard constraint.
 */
function evaluateHardConstraints(
  permission: PermissionDocument | null,
  input: VerifyInput
): RawDecision | null {
  if (input.agentStatus === "disabled") {
    return { allowed: false, reason: "Agent is disabled.", risk: "high" };
  }

  if (!permission) {
    return { allowed: false, reason: "No active permission exists for this action.", risk: "high" };
  }

  if (!permissionMatchesInput(permission, input)) {
    return { allowed: false, reason: "No active permission exists for this action.", risk: "high" };
  }

  if (permission.status === "revoked") {
    return { allowed: false, reason: "Permission has been revoked.", risk: "high" };
  }

  if (isExpired(permission)) {
    return { allowed: false, reason: "Permission has expired.", risk: "high" };
  }

  if (listIncludes(permission.blockedActions, input.action)) {
    return { allowed: false, reason: "Action is blocked by this permission.", risk: "high" };
  }

  const allowedActions = permission.allowedActions ?? [];
  if (allowedActions.length > 0 && !allowedActions.includes(input.action)) {
    return { allowed: false, reason: "Action is not included in allowedActions.", risk: "high" };
  }

  if (permission.resource && !listValueMatches([permission.resource], input.vendor)) {
    return { allowed: false, reason: "Resource does not match permission resource.", risk: "high" };
  }

  const maxAmount = permission.constraints?.maxAmount;
  if (typeof maxAmount === "number" && input.amount === undefined) {
    return { allowed: false, reason: "amount is required for permissions with a maxAmount constraint.", risk: "high" };
  }

  if (typeof maxAmount === "number" && input.amount !== undefined && input.amount > maxAmount) {
    return { allowed: false, reason: "Amount exceeds maxAmount constraint.", risk: "high" };
  }

  const allowedVendors = permission.constraints?.allowedVendors ?? [];
  if (allowedVendors.length > 0) {
    if (!listValueMatches(allowedVendors, input.vendor)) {
      return { allowed: false, reason: "Vendor is not included in allowedVendors constraint.", risk: "high" };
    }
  }

  return null;
}

function evaluatePermission(permission: PermissionDocument | null, input: VerifyInput): RawDecision {
  // Hard constraints are evaluated first so that the approval gate can never
  // bypass them. An approved grant only satisfies requiresApproval; it does
  // not override blocked actions, revocation, expiry, maxAmount, vendor
  // restrictions, or resource matching.
  const hardDeny = evaluateHardConstraints(permission, input);
  if (hardDeny) return hardDeny;

  // permission is guaranteed non-null here (evaluateHardConstraints denies when null)
  const argDeny = evaluateArgumentConstraints(permission!, input);
  if (argDeny) return argDeny;

  if (permission?.requiresApproval) {
    return {
      allowed: false,
      approvalRequired: true,
      reason: "Permission requires approval before execution.",
      risk: "medium"
    };
  }

  return { allowed: true, reason: "Action allowed by active permission.", risk: "low" };
}

function evaluatePermissions(permissions: PermissionDocument[], input: VerifyInput) {
  if (input.agentStatus === "disabled") {
    return { permission: null, decision: evaluatePermission(null, input) };
  }

  const matchingPermissions = permissions.filter((permission) =>
    permissionMatchesInput(permission, input)
  );
  const activePermissions = matchingPermissions.filter(isActiveCandidate);

  const blockingPermission = activePermissions.find((permission) =>
    listIncludes(permission.blockedActions, input.action)
  );
  if (blockingPermission) {
    return { permission: blockingPermission, decision: evaluatePermission(blockingPermission, input) };
  }

  for (const permission of activePermissions) {
    const decision = evaluatePermission(permission, input);
    if (decision.allowed) {
      return { permission, decision };
    }
  }

  const deniedActivePermission = activePermissions[0] ?? null;
  if (deniedActivePermission) {
    return { permission: deniedActivePermission, decision: evaluatePermission(deniedActivePermission, input) };
  }

  const inactivePermission = matchingPermissions[0] ?? null;
  return { permission: inactivePermission, decision: evaluatePermission(inactivePermission, input) };
}

async function findMatchingPermissions(input: VerifyInput) {
  if (input.agentStatus === "disabled") return [];
  return findMatchingForVerify(input.agentId, input.action);
}

function resolveIntentForInput(input: VerifyInput): ApprovalIntent | null {
  if (!isBindableAgentAction(input.action)) return null;
  return buildApprovalIntent({
    action: input.action,
    command: extractCommandForPolicy(input),
    filePath: extractFilePathForPolicy(input),
    cwd: extractCwd(input),
    home: extractHome(input)
  });
}

/**
 * If there is an approved, non-expired grant matching this exact request
 * (agentId, permissionId, action, vendor, amount[, argumentFingerprint]),
 * atomically mark it as used and return true (allow the action).
 * Otherwise upsert a pending ApprovalRequest scoped to this exact request and
 * return false (keep denying).
 *
 * This gate is only reached after every hard constraint (blocked actions,
 * revocation, expiry, maxAmount, allowedVendors, resource matching) has
 * already passed — an approval can never override those.
 */
async function resolveApprovalGate(
  requestId: string,
  input: VerifyInput,
  permissionId: string,
  requiredAuthorityLevel: number,
  intent: ApprovalIntent | null
): Promise<{ granted: boolean; approvalId?: string }> {
  const now = new Date();
  const argumentFingerprint = intent?.fingerprint ?? null;

  // 1. Atomically consume an approved, non-expired grant for this exact tuple.
  //    findOneAndUpdate with status:"approved" ensures only one concurrent
  //    retry can win; usedAt records consumption without overwriting resolvedAt.
  const grant = await consumeApprovedGrant({
    agentId: input.agentId,
    permissionId,
    action: input.action,
    vendor: input.vendor ?? null,
    amount: input.amount ?? null,
    argumentFingerprint
  }, now);

  // Defense in depth is encoded in the query filter (exact tuple + fingerprint).
  // A returned document means this request uniquely consumed the grant.
  if (grant) {
    const grantApprovalId =
      typeof grant.approvalId === "string" ? grant.approvalId : undefined;
    if (grantApprovalId) {
      await emitApprovalUsed({
        accountId: input.accountId ?? (grant.accountId as string | undefined),
        developerUserId:
          input.developerUserId ?? (grant.developerUserId as string | undefined),
        approvalId: grantApprovalId,
        kind: typeof grant.kind === "string" ? grant.kind : "agent_action",
        agentId: input.agentId,
        permissionId,
        action: input.action,
        vendor: input.vendor,
        amount: input.amount,
        argumentPreview:
          typeof grant.argumentPreview === "string" ? grant.argumentPreview : intent?.preview,
        requiredAuthorityLevel:
          typeof grant.requiredAuthorityLevel === "number"
            ? grant.requiredAuthorityLevel
            : requiredAuthorityLevel,
        grantExpiresAt:
          grant.grantExpiresAt instanceof Date
            ? grant.grantExpiresAt
            : typeof grant.grantExpiresAt === "string"
              ? grant.grantExpiresAt
              : undefined,
        resolvedBy: typeof grant.resolvedBy === "string" ? grant.resolvedBy : undefined,
        requestId: typeof grant.requestId === "string" ? grant.requestId : requestId
      });
    }
    return { granted: true, approvalId: grantApprovalId };
  }

  // 2. Upsert a pending ApprovalRequest (idempotent — only creates if one
  // doesn't exist for this exact action/vendor/amount/fingerprint tuple).
  const pendingFilter = {
    agentId: input.agentId,
    permissionId,
    action: input.action,
    vendor: input.vendor ?? null,
    amount: input.amount ?? null,
    argumentFingerprint,
    status: "pending" as const
  };

  const setOnInsert: Record<string, unknown> = {
    approvalId: createPublicId("apr"),
    requestId,
    accountId: input.accountId,
    developerUserId: input.developerUserId,
    kind: "agent_action",
    requiredAuthorityLevel
  };

  if (intent) {
    setOnInsert.argumentKind = intent.kind;
    setOnInsert.argumentFingerprint = intent.fingerprint;
    setOnInsert.argumentPreview = intent.preview;
    setOnInsert.argumentPreviewTruncated = intent.previewTruncated;
  }

  const pending = await upsertPendingAgentAction(pendingFilter, setOnInsert);
  const approvalId =
    typeof pending?.approvalId === "string" ? pending.approvalId : undefined;

  // Fresh pending rows use this verify call's requestId via $setOnInsert.
  // Reused pending rows keep their original requestId — skip duplicate emits.
  const pendingRequestId =
    typeof pending?.requestId === "string" ? pending.requestId : undefined;
  if (approvalId && pendingRequestId === requestId) {
    await emitApprovalRequested({
      accountId: input.accountId,
      developerUserId: input.developerUserId,
      approvalId,
      kind: "agent_action",
      agentId: input.agentId,
      permissionId,
      action: input.action,
      vendor: input.vendor,
      amount: input.amount,
      argumentPreview: intent?.preview,
      requiredAuthorityLevel,
      requestId
    });
  }

  return { granted: false, approvalId };
}

/**
 * Run account guardrail rules before the human approval gate.
 * Returns null when no PolicyDocument is configured (backward-compatible).
 */
async function evaluateAccountGuardrails(
  input: VerifyInput,
  decision: RawDecision
): Promise<PolicyEvaluation | null> {
  const document = await loadPolicyDocument(input.accountId);
  if (!document || !document.enabled || document.rules.length === 0) {
    return null;
  }

  const filePath = extractFilePathForPolicy(input);
  const paths = filePath
    ? pathMatchCandidates(filePath, extractCwd(input), extractHome(input))
    : [];

  const facts = buildPolicyFacts({
    action: input.action,
    vendor: input.vendor,
    paths,
    command: extractCommandForPolicy(input),
    risk: decision.risk,
    permissionRequiresApproval: decision.approvalRequired === true,
    metadata: input.metadata,
    policyContext: input.policyContext as Record<string, unknown> | undefined
  });

  return evaluateGuardrailRules(document.rules, facts);
}

function decisionFromGuardrail(evaluation: PolicyEvaluation): RawDecision | null {
  switch (evaluation.outcome) {
    case "allow":
      return {
        allowed: true,
        reason: evaluation.matchedRuleId
          ? `Allowed by policy rule "${evaluation.matchedRuleId}".`
          : evaluation.reason,
        risk: "low"
      };
    case "auto_approve":
      return {
        allowed: true,
        reason: evaluation.matchedRuleId
          ? `Auto-approved by policy rule "${evaluation.matchedRuleId}".`
          : evaluation.reason,
        risk: "low"
      };
    case "deny":
      return {
        allowed: false,
        reason: evaluation.reason,
        risk: "high"
      };
    case "require_human":
      return null;
    default: {
      const _exhaustive: never = evaluation.outcome;
      void _exhaustive;
      return null;
    }
  }
}

export async function verifyAction(input: VerifyInput) {
  const requestId = createPublicId("req");
  let permission: PermissionDocument | null = null;
  let decision: RawDecision;

  try {
    const permissions = await findMatchingPermissions(input);
    const result = evaluatePermissions(permissions, input);
    permission = result.permission;
    decision = result.decision;
  } catch {
    decision = {
      allowed: false,
      reason: "Verification failed closed during permission lookup.",
      risk: "high"
    };
  }

  const now = new Date();
  const logMetadata =
    process.env.BEHALFID_LOG_METADATA === "false" ? undefined : input.metadata;

  // Shadow mode: evaluate policy, log the real decision, but never block execution.
  // Approval gates are skipped — no side effects should occur in shadow mode.
  if (input.shadow) {
    recordAgentKeyUse(input.agentId);

    if (permission) {
      await updatePermission(
        { permissionId: permission.permissionId },
        { $set: { lastUsedAt: now } }
      );
    }

    await createLog({
      logId: createPublicId("log"),
      requestId,
      accountId: input.accountId,
      developerUserId: input.developerUserId,
      agentId: input.agentId,
      permissionId: permission?.permissionId ?? null,
      action: input.action,
      amount: input.amount,
      vendor: input.vendor,
      allowed: decision.allowed,
      approvalRequired: decision.approvalRequired ?? false,
      reason: decision.reason,
      risk: decision.risk,
      metadata: logMetadata,
      shadow: true
    });

    return {
      requestId,
      permissionId: permission?.permissionId ?? null,
      allowed: true,
      approvalRequired: false,
      approvalId: null,
      shadow: true,
      shadowDecision: {
        allowed: decision.allowed,
        reason: decision.reason,
        risk: decision.risk
      } satisfies ShadowDecision,
      reason: decision.allowed
        ? "Shadow mode: action would have been allowed."
        : "Shadow mode: action would have been denied.",
      risk: decision.risk
    };
  }

  // Resolve approval gate: if the permission requires approval, check for a
  // granted approval or upsert a pending request. Bindable actions require a
  // usable command/path target — missing targets deny without creating a request.
  // Guardrail rules (when a PolicyDocument exists) may allow, auto-approve, or
  // deny before a human ApprovalRequest is created.
  let approvalId: string | null = null;
  if (decision.approvalRequired && permission) {
    let skipHumanGate = false;
    try {
      const guardrail = await evaluateAccountGuardrails(input, decision);
      if (guardrail) {
        const overridden = decisionFromGuardrail(guardrail);
        if (overridden) {
          decision = overridden;
          skipHumanGate = true;
        }
      }
    } catch {
      // Fail closed to the existing human approval path if policy evaluation throws.
    }

    if (!skipHumanGate) {
      const intent = resolveIntentForInput(input);
      if (isBindableAgentAction(input.action) && !intent) {
        decision = {
          allowed: false,
          reason: APPROVAL_TARGET_REQUIRED_REASON,
          risk: "high"
        };
      } else {
        try {
          const gate = await resolveApprovalGate(
            requestId,
            input,
            permission.permissionId,
            getEffectiveRequiredAuthority(permission),
            intent
          );
          if (gate.granted) {
            decision = {
              allowed: true,
              reason: "Action allowed by approved permission grant.",
              risk: "low"
            };
          } else {
            approvalId = gate.approvalId ?? null;
          }
        } catch {
          // Fail closed: if approval resolution fails, keep the denied decision
        }
      }
    }
  }

  const finalDecision =
    decision.allowed && input.enforcementDenyReason
      ? ({ allowed: false, reason: input.enforcementDenyReason, risk: "high" } satisfies RawDecision)
      : decision;

  recordAgentKeyUse(input.agentId);

  if (permission) {
    await updatePermission(
      { permissionId: permission.permissionId },
      { $set: { lastUsedAt: now } }
    );
  }

  await createLog({
    logId: createPublicId("log"),
    requestId,
    accountId: input.accountId,
    developerUserId: input.developerUserId,
    agentId: input.agentId,
    permissionId: permission?.permissionId ?? null,
    action: input.action,
    amount: input.amount,
    vendor: input.vendor,
    allowed: finalDecision.allowed,
    approvalRequired: finalDecision.approvalRequired ?? false,
    reason: finalDecision.reason,
    risk: finalDecision.risk,
    metadata: logMetadata
  });

  return {
    requestId,
    permissionId: permission?.permissionId ?? null,
    allowed: finalDecision.allowed,
    approvalRequired: finalDecision.approvalRequired ?? false,
    approvalId,
    reason: finalDecision.reason,
    risk: finalDecision.risk
  };
}

export async function previewVerification(input: VerifyInput) {
  const requestId = createPublicId("req");
  const permissions = await findMatchingPermissions(input);
  const result = evaluatePermissions(permissions, input);
  const permission = result.permission;
  const decision = result.decision;

  return {
    requestId,
    permissionId: permission?.permissionId ?? null,
    allowed: decision.allowed,
    approvalRequired: decision.approvalRequired ?? false,
    reason: decision.reason,
    risk: decision.risk
  };
}
