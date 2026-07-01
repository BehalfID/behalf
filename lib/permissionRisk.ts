import { AUTHORITY_LEVELS, type WorkspaceRole } from "@/lib/authority";

export type PermissionClassificationInput = {
  action: string;
  resource?: string | null;
  scope?: string | null;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean;
  template?: string;
  constraints?: {
    maxAmount?: number;
    allowedVendors?: string[];
  };
};

type ClassificationResult = {
  requiredAuthorityLevel: number;
  requiredRole: WorkspaceRole;
  classified: boolean;
};

const OWNER_LEVEL = AUTHORITY_LEVELS.OWNER;
const LEAD_LEVEL = AUTHORITY_LEVELS.ENGINEERING_LEAD;
const SENIOR_LEVEL = AUTHORITY_LEVELS.SENIOR_ENGINEER;
const ENGINEER_LEVEL = AUTHORITY_LEVELS.ENGINEER;
const UNCLASSIFIED_DEFAULT_LEVEL = LEAD_LEVEL;

const ACTION_ALIASES: Record<string, string> = {
  repo_read: "repo.read",
  github_issue_read: "github.issue.read",
  github_pr_comment: "github.pr.comment",
  github_push_main: "github.push.main",
  deploy_production: "deploy.production",
  deploy_staging: "deploy.staging",
  dependency_update: "dependency.update",
  secrets_write: "secrets.write",
  secrets_read: "secrets.read",
  billing_vendor_api: "billing.vendor_api",
  database_migrate_production: "database.migrate.production"
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeAction(action: string): string {
  const normalized = normalize(action).replace(/ /g, "_");
  return ACTION_ALIASES[normalized] ?? normalized;
}

function joinSignals(input: PermissionClassificationInput): string {
  return [
    input.action,
    input.resource,
    input.scope,
    ...(input.allowedActions ?? []),
    ...(input.blockedActions ?? [])
  ]
    .map(normalize)
    .filter(Boolean)
    .join(" ");
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function isProductionEnv(signals: string): boolean {
  return includesAny(signals, ["production", "prod", "live"]);
}

function isNonProductionDeployEnv(signals: string): boolean {
  return includesAny(signals, [
    "staging",
    "stage",
    "preview",
    "development",
    "dev",
    "sandbox",
    "test",
    "deploy.staging",
    "deploy to staging"
  ]);
}

function isProtectedBranchSignal(signals: string): boolean {
  return includesAny(signals, [
    "main",
    "master",
    "protected branch",
    "push main",
    "push to main",
    "push master",
    "github.push.main",
    "direct push"
  ]);
}

function isWorkspaceAdminSignal(signals: string, action: string): boolean {
  const normalizedAction = normalizeAction(action);
  if (
    includesAny(signals, [
      "workspace.billing",
      "workspace.admin",
      "workspace.security",
      "billing settings",
      "security settings",
      "admin settings"
    ])
  ) {
    return true;
  }
  return includesAny(normalizedAction, ["workspace_admin", "workspace_billing", "workspace_security"]);
}

function isSecretsSignal(signals: string, action: string): boolean {
  const normalizedAction = normalizeAction(action);
  if (normalizedAction === "secrets.write" || normalizedAction === "secrets.read") return true;
  return includesAny(signals, [
    "secrets.write",
    "secrets read",
    "secret write",
    "write secret",
    ".env",
    "credentials file",
    "read credentials",
    "read .env",
    "write .env"
  ]);
}

function isBillingVendorSignal(signals: string, action: string): boolean {
  const normalizedAction = normalizeAction(action);
  if (normalizedAction === "billing.vendor_api") return true;
  return includesAny(signals, ["billing.vendor", "vendor api", "billing api", "payment provider api"]);
}

function isDestructiveDatabaseSignal(signals: string, action: string): boolean {
  const normalizedAction = normalizeAction(action);
  if (normalizedAction === "database.migrate.production") return true;
  return includesAny(signals, [
    "database migrate production",
    "database.migrate.production",
    "migrate production",
    "drop table",
    "drop database",
    "truncate table",
    "destructive migration",
    "destructive db"
  ]);
}

function isDependencyProductionSignal(signals: string): boolean {
  return includesAny(signals, [
    "dependency.update production",
    "dependency update production",
    "production dependency",
    "upgrade production dependency"
  ]);
}

function isSafeEngineerSignal(signals: string, action: string): boolean {
  const normalizedAction = normalizeAction(action);
  const engineerActions = new Set([
    "repo.read",
    "github.issue.read",
    "github.pr.comment",
    "github.pr.read",
    "read_file",
    "browse_web",
    "access_data",
    "create_content",
    "github_issue_comment"
  ]);
  if (engineerActions.has(normalizedAction)) return true;
  return includesAny(signals, [
    "repo read",
    "issue read",
    "pr comment",
    "read files",
    "write files",
    "run tests",
    "run linter",
    "read issue",
    "comment on pr"
  ]);
}

function toResult(level: number, classified: boolean): ClassificationResult {
  if (level >= OWNER_LEVEL) {
    return { requiredAuthorityLevel: OWNER_LEVEL, requiredRole: "OWNER", classified };
  }
  if (level >= LEAD_LEVEL) {
    return { requiredAuthorityLevel: LEAD_LEVEL, requiredRole: "ENGINEERING_LEAD", classified };
  }
  if (level >= SENIOR_LEVEL) {
    return { requiredAuthorityLevel: SENIOR_LEVEL, requiredRole: "SENIOR_ENGINEER", classified };
  }
  return { requiredAuthorityLevel: ENGINEER_LEVEL, requiredRole: "ENGINEER", classified };
}

export function classifyPermissionRisk(input: PermissionClassificationInput): ClassificationResult {
  const action = normalizeAction(input.action);
  const signals = joinSignals({ ...input, action });

  if (!action) {
    return toResult(UNCLASSIFIED_DEFAULT_LEVEL, false);
  }

  if (isWorkspaceAdminSignal(signals, action)) {
    return toResult(OWNER_LEVEL, true);
  }

  if (
    isSecretsSignal(signals, action) ||
    isBillingVendorSignal(signals, action) ||
    isDestructiveDatabaseSignal(signals, action) ||
    isDependencyProductionSignal(signals) ||
    action === "deploy.production" ||
    action === "github.push.main" ||
    (action === "deploy" && isProductionEnv(signals) && !isNonProductionDeployEnv(signals)) ||
    isProtectedBranchSignal(signals)
  ) {
    return toResult(LEAD_LEVEL, true);
  }

  if (
    (action === "deploy" ||
      action === "deploy.staging" ||
      action === "dependency.update") &&
    isNonProductionDeployEnv(signals) &&
    !isProductionEnv(signals)
  ) {
    return toResult(SENIOR_LEVEL, true);
  }

  if (action === "dependency.update" || action === "dependency_update") {
    return toResult(SENIOR_LEVEL, true);
  }

  if (isSafeEngineerSignal(signals, action)) {
    return toResult(ENGINEER_LEVEL, true);
  }

  const legacyLowRiskActions = new Set(["schedule", "send_email", "purchase"]);
  if (legacyLowRiskActions.has(action) && !isProductionEnv(signals)) {
    return toResult(ENGINEER_LEVEL, true);
  }

  return toResult(UNCLASSIFIED_DEFAULT_LEVEL, false);
}

export function getRequiredAuthorityForAction(
  action: string,
  options?: {
    vendor?: string | null;
    resource?: string | null;
    env?: string | null;
    params?: Record<string, unknown>;
  }
): number {
  const metadataEnv =
    typeof options?.params?.env === "string" ? options.params.env : options?.env ?? undefined;
  return classifyPermissionRisk({
    action,
    resource: options?.resource ?? metadataEnv ?? options?.vendor ?? undefined,
    allowedActions: options?.params?.allowedActions as string[] | undefined
  }).requiredAuthorityLevel;
}
