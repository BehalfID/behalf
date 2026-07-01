import { createPublicId } from "@/lib/ids";

export type DemoScenarioId =
  | "deploy-approval"
  | "migration-denied"
  | "github-read-allowed"
  | "push-main-denied"
  | "secret-write-denied"
  | "dependency-approval";

export const DEMO_SCENARIO_IDS = new Set<string>([
  "deploy-approval",
  "migration-denied",
  "github-read-allowed",
  "push-main-denied",
  "secret-write-denied",
  "dependency-approval"
]);

type DemoPermission = {
  action: string;
  allowedActions?: string[];
  blockedActions?: string[];
  resource?: string;
  requiresApproval?: boolean;
  constraints?: {
    maxAmount?: number;
    allowedVendors?: string[];
  };
  status: "active" | "revoked";
};

type DemoInput = {
  action: string;
  vendor?: string;
  amount?: number;
};

type DemoDecision = {
  allowed: boolean;
  approvalRequired: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
};

type DemoScenario = {
  input: DemoInput;
  permissions: DemoPermission[];
};

const SCENARIOS: Record<DemoScenarioId, DemoScenario> = {
  "deploy-approval": {
    input: { action: "deploy_production", vendor: "vercel.com" },
    permissions: [{
      action: "deploy_production",
      resource: "vercel.com",
      requiresApproval: true,
      status: "active"
    }]
  },
  "migration-denied": {
    input: { action: "db_migrate", vendor: "prod-postgres" },
    permissions: [{ action: "db_read", resource: "prod-postgres", status: "active" }]
  },
  "github-read-allowed": {
    input: { action: "github_issue_read", vendor: "github.com" },
    permissions: [{ action: "github_issue_read", resource: "github.com", status: "active" }]
  },
  "push-main-denied": {
    input: { action: "git_push_main", vendor: "github.com" },
    permissions: [{
      action: "git_push",
      allowedActions: ["git_push"],
      blockedActions: ["git_push_main"],
      resource: "github.com",
      status: "active"
    }]
  },
  "secret-write-denied": {
    input: { action: "write_env", vendor: "repo" },
    permissions: [{
      action: "read_file",
      allowedActions: ["read_file"],
      blockedActions: ["write_env"],
      resource: "repo",
      status: "active"
    }]
  },
  "dependency-approval": {
    input: { action: "update_dependencies", vendor: "npm" },
    permissions: [{
      action: "update_dependencies",
      resource: "npm",
      requiresApproval: true,
      status: "active"
    }]
  }
};

function permissionMatchesInput(permission: DemoPermission, input: DemoInput): boolean {
  const blocked = permission.blockedActions ?? [];
  if (blocked.includes(input.action)) return true;
  if (permission.action === input.action) return true;
  const allowed = permission.allowedActions ?? [];
  return allowed.includes(input.action);
}

function vendorMatches(resource: string | undefined, vendor: string | undefined): boolean {
  if (!resource) return true;
  if (!vendor) return false;
  return resource === vendor;
}

function evaluatePermission(permission: DemoPermission, input: DemoInput): DemoDecision {
  const blocked = permission.blockedActions ?? [];
  if (blocked.includes(input.action)) {
    return { allowed: false, approvalRequired: false, reason: "Action is blocked by this permission.", risk: "high" };
  }

  const allowedActions = permission.allowedActions ?? [];
  if (allowedActions.length > 0 && !allowedActions.includes(input.action)) {
    return { allowed: false, approvalRequired: false, reason: "Action is not included in allowedActions.", risk: "high" };
  }

  if (!vendorMatches(permission.resource, input.vendor)) {
    return { allowed: false, approvalRequired: false, reason: "Resource does not match permission resource.", risk: "high" };
  }

  if (permission.requiresApproval) {
    return { allowed: false, approvalRequired: true, reason: "Permission requires approval before execution.", risk: "medium" };
  }

  const maxAmount = permission.constraints?.maxAmount;
  if (typeof maxAmount === "number" && input.amount !== undefined && input.amount > maxAmount) {
    return { allowed: false, approvalRequired: false, reason: "Amount exceeds maxAmount constraint.", risk: "high" };
  }

  return { allowed: true, approvalRequired: false, reason: "Action allowed by active permission.", risk: "low" };
}

function evaluateDemoPermissions(permissions: DemoPermission[], input: DemoInput): DemoDecision {
  const active = permissions.filter((p) => p.status === "active");
  const matching = active.filter((p) => permissionMatchesInput(p, input));

  if (matching.length === 0) {
    return { allowed: false, approvalRequired: false, reason: "No active permission exists for this action.", risk: "high" };
  }

  // Blocking permissions win
  const blocker = matching.find((p) => (p.blockedActions ?? []).includes(input.action));
  if (blocker) return evaluatePermission(blocker, input);

  for (const perm of matching) {
    const result = evaluatePermission(perm, input);
    if (result.allowed) return result;
  }

  return evaluatePermission(matching[0], input);
}

export type DemoVerifyResult = {
  requestId: string;
  allowed: boolean;
  approvalRequired: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  timestamp: string;
  scenarioId: DemoScenarioId;
};

export function runDemoScenario(scenarioId: DemoScenarioId): DemoVerifyResult {
  const scenario = SCENARIOS[scenarioId];
  const decision = evaluateDemoPermissions(scenario.permissions, scenario.input);
  return {
    requestId: createPublicId("req"),
    allowed: decision.allowed,
    approvalRequired: decision.approvalRequired,
    reason: decision.reason,
    risk: decision.risk,
    timestamp: new Date().toISOString(),
    scenarioId
  };
}
