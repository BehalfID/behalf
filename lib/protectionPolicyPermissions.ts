/**
 * Compiles a ProtectionPolicy into the permission documents that
 * `POST /api/verify` evaluates, and into the readable summary shown before a
 * customer finishes onboarding.
 *
 * This is the only place that knows how a plain-language choice becomes an
 * enforceable permission. Nothing else in the codebase should assemble
 * `allowedActions` / `blockedActions` / `constraints` for onboarding.
 */

import {
  DESTRUCTIVE_COMMAND_PATTERNS,
  PROTECTION_CATEGORY_LIST,
  PROTECTION_CONTROLS,
  PROTECTION_CONTROL_LIST,
  SENSITIVE_FILE_PATTERNS,
  getProtectionControl,
  type ProtectionCategoryId,
  type ProtectionControlId,
  type ProtectionPolicy,
  type ProtectionState
} from "@/lib/protectionPolicy";

/** Environments a generic `deploy` permission is never allowed to cover. */
export const PRODUCTION_ENVIRONMENT_NAMES = ["production", "prod", "live"] as const;

export type ProtectionPermissionConstraints = {
  maxAmount?: number;
  allowedVendors?: string[];
  allowedPaths?: string[];
  deniedPaths?: string[];
  deniedCommands?: string[];
  deniedEnvironments?: string[];
};

/**
 * A permission body in exactly the shape `createPermissionForAgent` accepts.
 *
 * `allowedActions` is intentionally absent everywhere. `lib/verify.ts` treats a
 * non-empty `allowedActions` as an exact-match allowlist evaluated *before*
 * `requiresApproval`, so listing anything other than the canonical action id
 * turns an approval gate into a hard denial.
 */
export type ProtectionPermission = {
  /** Which control produced this permission — for summaries and tests. */
  controlId: ProtectionControlId;
  action: string;
  description: string;
  resource?: string;
  blockedActions?: string[];
  requiresApproval: boolean;
  template?: "access_data" | "create_content" | "schedule" | "purchase" | "custom";
  constraints?: ProtectionPermissionConstraints;
  notes: string;
};

const TEMPLATE_BY_ACTION: Record<string, ProtectionPermission["template"]> = {
  read_file: "access_data",
  browse_web: "access_data",
  write_file: "create_content",
  send_email: "create_content",
  purchase: "purchase"
};

const NOTE = "Created from your BehalfID onboarding protection policy.";

function pathConstraintsFor(
  controlId: ProtectionControlId,
  policy: ProtectionPolicy
): ProtectionPermissionConstraints | undefined {
  if (controlId !== "read_files" && controlId !== "edit_files") return undefined;
  if (!policy.guards.sensitive_files) return undefined;
  return { deniedPaths: [...SENSITIVE_FILE_PATTERNS] };
}

function commandConstraintsFor(
  controlId: ProtectionControlId,
  policy: ProtectionPolicy
): ProtectionPermissionConstraints | undefined {
  if (controlId !== "run_commands") return undefined;
  if (!policy.guards.destructive_commands) return undefined;
  return { deniedCommands: [...DESTRUCTIVE_COMMAND_PATTERNS] };
}

function environmentConstraintsFor(
  controlId: ProtectionControlId
): ProtectionPermissionConstraints | undefined {
  if (controlId !== "deploy_other_environments") return undefined;
  // A generic `deploy` must never become a back door to production. The
  // production control owns that decision.
  //
  // Limitation, stated plainly because the UI copy has to match it: verify
  // reads the environment from request metadata, and an absent value matches
  // no deny pattern. A caller that sends `deploy` with no environment is
  // therefore treated as non-production. Callers that must be gated should
  // send `deploy_production`, which has its own control.
  return { deniedEnvironments: [...PRODUCTION_ENVIRONMENT_NAMES] };
}

function mergeConstraints(
  ...parts: Array<ProtectionPermissionConstraints | undefined>
): ProtectionPermissionConstraints | undefined {
  const merged: ProtectionPermissionConstraints = {};
  let has = false;
  for (const part of parts) {
    if (!part) continue;
    for (const [key, value] of Object.entries(part)) {
      if (value === undefined) continue;
      (merged as Record<string, unknown>)[key] = value;
      has = true;
    }
  }
  return has ? merged : undefined;
}

function basePermission(
  controlId: ProtectionControlId,
  overrides: Partial<ProtectionPermission> = {}
): ProtectionPermission {
  const control = getProtectionControl(controlId);
  return {
    controlId,
    action: control.action,
    description: control.label,
    resource: control.resource,
    requiresApproval: false,
    template: TEMPLATE_BY_ACTION[control.action],
    notes: NOTE,
    ...overrides
  };
}

/**
 * Money is the one control with a shape the tri-state cannot express on its
 * own, because an amount threshold splits a single action into bands.
 *
 * - allow  + limits: one permission capped at `blockOver`.
 * - approve + limits: an auto tier capped at `approveOver`, plus an approval
 *   tier capped at `blockOver`. Anything above `blockOver` matches neither and
 *   is denied by the `maxAmount` constraint.
 */
function spendingPermissions(policy: ProtectionPolicy): ProtectionPermission[] {
  const state = policy.controls.spend_money;
  const { enabled, approveOver, blockOver } = policy.spending;

  if (state === "block") {
    return [
      basePermission("spend_money", {
        blockedActions: ["purchase"],
        description: "Spend money — blocked"
      })
    ];
  }

  if (!enabled) {
    return [
      basePermission("spend_money", {
        requiresApproval: state === "approve",
        description: state === "approve" ? "Spend money — needs approval" : "Spend money"
      })
    ];
  }

  if (state === "allow") {
    return [
      basePermission("spend_money", {
        description: `Spend money up to ${blockOver}`,
        constraints: { maxAmount: blockOver }
      })
    ];
  }

  const permissions: ProtectionPermission[] = [];
  if (approveOver > 0) {
    permissions.push(
      basePermission("spend_money", {
        description: `Spend money up to ${approveOver} without asking`,
        constraints: { maxAmount: approveOver }
      })
    );
  }
  permissions.push(
    basePermission("spend_money", {
      description: `Spend money from ${approveOver} to ${blockOver} — needs approval`,
      requiresApproval: true,
      constraints: { maxAmount: blockOver }
    })
  );
  return permissions;
}

function permissionsForControl(
  controlId: ProtectionControlId,
  policy: ProtectionPolicy
): ProtectionPermission[] {
  if (controlId === "spend_money") return spendingPermissions(policy);

  const control = getProtectionControl(controlId);
  const state = policy.controls[controlId];

  if (state === "block") {
    return [
      basePermission(controlId, {
        blockedActions: [control.action],
        description: `${control.label} — blocked`
      })
    ];
  }

  const constraints = mergeConstraints(
    pathConstraintsFor(controlId, policy),
    commandConstraintsFor(controlId, policy),
    environmentConstraintsFor(controlId)
  );

  return [
    basePermission(controlId, {
      requiresApproval: state === "approve",
      description: state === "approve" ? `${control.label} — needs approval` : control.label,
      constraints
    })
  ];
}

/**
 * Compile the whole policy. Ordering is deterministic: the auto-allow tier of a
 * banded control is always emitted before its approval tier.
 */
export function buildPermissionsFromProtectionPolicy(
  policy: ProtectionPolicy
): ProtectionPermission[] {
  return PROTECTION_CONTROLS.flatMap((controlId) => permissionsForControl(controlId, policy));
}

/** Strip the summary-only fields so the result can be POSTed as a permission body. */
export function protectionPermissionBody(permission: ProtectionPermission) {
  return {
    action: permission.action,
    description: permission.description,
    resource: permission.resource,
    blockedActions: permission.blockedActions,
    requiresApproval: permission.requiresApproval,
    template: permission.template,
    notes: permission.notes,
    constraints: permission.constraints ?? {}
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Readable summary — generated from the same policy the permissions come from
// ────────────────────────────────────────────────────────────────────────────

export type ProtectionSummaryEntry = {
  controlId: ProtectionControlId | "sensitive_files" | "destructive_commands";
  label: string;
  detail?: string;
};

export type ProtectionSummary = {
  allowed: ProtectionSummaryEntry[];
  approval: ProtectionSummaryEntry[];
  blocked: ProtectionSummaryEntry[];
};

function spendingSummary(policy: ProtectionPolicy, bucket: ProtectionState): ProtectionSummaryEntry[] {
  const state = policy.controls.spend_money;
  const { enabled, approveOver, blockOver } = policy.spending;
  const entries: ProtectionSummaryEntry[] = [];

  if (state === "block") {
    if (bucket === "block") entries.push({ controlId: "spend_money", label: "Spend money" });
    return entries;
  }

  if (!enabled) {
    if (state === "approve" && bucket === "approve") {
      entries.push({ controlId: "spend_money", label: "Spend money", detail: "any amount" });
    }
    if (state === "allow" && bucket === "allow") {
      entries.push({ controlId: "spend_money", label: "Spend money", detail: "no limit set" });
    }
    return entries;
  }

  if (state === "allow") {
    if (bucket === "allow") {
      entries.push({ controlId: "spend_money", label: "Purchases", detail: `up to ${blockOver}` });
    }
    if (bucket === "block") {
      entries.push({ controlId: "spend_money", label: "Purchases", detail: `over ${blockOver}` });
    }
    return entries;
  }

  if (bucket === "allow" && approveOver > 0) {
    entries.push({ controlId: "spend_money", label: "Purchases", detail: `up to ${approveOver}` });
  }
  if (bucket === "approve") {
    entries.push({
      controlId: "spend_money",
      label: "Purchases",
      detail: approveOver > 0 ? `${approveOver} to ${blockOver}` : `up to ${blockOver}`
    });
  }
  if (bucket === "block") {
    entries.push({ controlId: "spend_money", label: "Purchases", detail: `over ${blockOver}` });
  }
  return entries;
}

/**
 * Build the "here is your policy" review. Derived entirely from the stored
 * policy so the review can never drift from what gets enforced.
 */
export function summarizeProtectionPolicy(policy: ProtectionPolicy): ProtectionSummary {
  const summary: ProtectionSummary = { allowed: [], approval: [], blocked: [] };

  for (const control of PROTECTION_CONTROL_LIST) {
    if (control.id === "spend_money") {
      summary.allowed.push(...spendingSummary(policy, "allow"));
      summary.approval.push(...spendingSummary(policy, "approve"));
      summary.blocked.push(...spendingSummary(policy, "block"));
      continue;
    }
    const state = policy.controls[control.id];
    const entry: ProtectionSummaryEntry = { controlId: control.id, label: control.label };
    if (state === "allow") summary.allowed.push(entry);
    else if (state === "approve") summary.approval.push(entry);
    else summary.blocked.push(entry);
  }

  if (policy.guards.sensitive_files) {
    summary.blocked.push({
      controlId: "sensitive_files",
      label: "Reading or writing credential files",
      detail: ".env, private keys, cloud credentials"
    });
  }
  if (policy.guards.destructive_commands) {
    summary.blocked.push({
      controlId: "destructive_commands",
      label: "Unrecoverable shell commands",
      detail: "rm -rf /, force push, DROP DATABASE"
    });
  }

  return summary;
}

/** Counts used for the compact "3 allowed · 5 ask you · 2 blocked" line. */
export function protectionPolicyCounts(policy: ProtectionPolicy) {
  const counts = { allow: 0, approve: 0, block: 0 };
  for (const id of PROTECTION_CONTROLS) {
    counts[policy.controls[id]] += 1;
  }
  return counts;
}

export function categoriesWithControls(includeAdvanced = false) {
  return PROTECTION_CATEGORY_LIST.map((category) => ({
    category,
    controls: PROTECTION_CONTROL_LIST.filter(
      (control) => control.category === category.id && (includeAdvanced || !control.advanced)
    )
  })).filter((entry) => entry.controls.length > 0);
}

export function advancedControls() {
  return PROTECTION_CONTROL_LIST.filter((control) => control.advanced);
}

export function categoryStateSummary(
  policy: ProtectionPolicy,
  categoryId: ProtectionCategoryId,
  includeAdvanced = false
) {
  const controls = PROTECTION_CONTROL_LIST.filter(
    (control) => control.category === categoryId && (includeAdvanced || !control.advanced)
  );
  const counts = { allow: 0, approve: 0, block: 0 };
  for (const control of controls) counts[policy.controls[control.id]] += 1;
  return counts;
}
