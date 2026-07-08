/**
 * Stable enum value sets for Postgres CHECK constraints.
 * Mirrors Mongoose schemas and lib/authority.ts — not enforced at runtime yet.
 */

export const ACCOUNT_PLANS = ["free", "pro", "team", "business", "enterprise"] as const;
export const ACCOUNT_TYPES = ["individual", "business"] as const;
export const TEAM_SIZES = ["1", "2-5", "6-20", "21-50", "51+"] as const;

export const ONBOARDING_USE_CASES = ["personal", "website", "sdk"] as const;

export const WORKSPACE_ROLES = [
  "OWNER",
  "ENGINEERING_LEAD",
  "SENIOR_ENGINEER",
  "ENGINEER",
  "VIEWER"
] as const;

export const INVITE_ROLES = [
  "ENGINEERING_LEAD",
  "SENIOR_ENGINEER",
  "ENGINEER",
  "VIEWER"
] as const;

export const INVITE_STATUSES = ["pending", "accepted", "revoked"] as const;

export const AGENT_TYPES = ["native", "connected"] as const;
export const AGENT_PROVIDERS = [
  "custom",
  "ollie",
  "chatgpt",
  "claude",
  "gemini",
  "zapier",
  "make",
  "langchain",
  "openai",
  "other"
] as const;
export const CONNECTION_STATUSES = ["manual", "connected", "disconnected"] as const;
export const AGENT_STATUSES = ["active", "disabled"] as const;

export const PERMISSION_TEMPLATES = [
  "access_data",
  "create_content",
  "schedule",
  "purchase",
  "custom"
] as const;
export const PERMISSION_STATUSES = ["active", "revoked"] as const;

export const APPROVAL_KINDS = ["agent_action", "managed_profile_pause"] as const;
export const APPROVAL_STATUSES = ["pending", "approved", "denied", "used"] as const;
export const PAUSE_SCOPES = ["current_repo", "all"] as const;

export const RISK_LEVELS = ["low", "medium", "high"] as const;

export const WEBHOOK_ENDPOINT_STATUSES = ["active", "disabled"] as const;
export const WEBHOOK_EVENT_STATUSES = ["pending", "processing", "completed", "failed"] as const;

export const MANAGED_PROFILE_MODES = ["unmanaged", "managed", "required"] as const;

export const CLI_AUDIT_EVENT_TYPES = [
  "cli_session_policy",
  "cli_pause_grant",
  "cli_pause_deny",
  "cli_pause_approval_requested"
] as const;

/** SQL fragment helpers for CHECK constraints in schema and migrations. */
export function sqlInList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}
