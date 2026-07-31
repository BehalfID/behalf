/**
 * Stable enum value sets for Postgres CHECK constraints.
 * Mirrors Mongoose schemas and lib/authority.ts — not enforced at runtime yet.
 */

export const ACCOUNT_PLANS = ["free", "pro", "team", "business", "enterprise"] as const;
export const ACCOUNT_TYPES = ["individual", "business"] as const;
export const TEAM_SIZES = ["1", "2-5", "6-20", "21-50", "51+"] as const;

export const ONBOARDING_USE_CASES = ["personal", "website", "sdk"] as const;

/** Human login identity providers that can be linked to a developer account. */
export const EXTERNAL_IDENTITY_PROVIDERS = ["github", "google"] as const;
/** Modes an OAuth authorization request can be started in. */
export const OAUTH_FLOW_MODES = ["login", "signup", "link"] as const;
/** Identity lifecycle actions recorded in the durable identity audit log. */
export const IDENTITY_AUDIT_ACTIONS = [
  "identity_linked",
  "identity_unlinked",
  "identity_registered",
  "identity_login",
  "identity_link_rejected",
  "password_login",
  "passkey_registered",
  "passkey_renamed",
  "passkey_removed",
  "method_removal_rejected"
] as const;
/** Providers that may appear on identity audit rows. */
export const IDENTITY_AUDIT_PROVIDERS = ["github", "google", "password", "passkey"] as const;
export const LOGIN_METHODS = ["password", "github", "google", "passkey"] as const;
export const WEBAUTHN_CHALLENGE_KINDS = ["registration", "authentication"] as const;

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
export const PERMISSION_STATUSES = ["active", "revoked", "inactive"] as const;

export const APPROVAL_KINDS = ["agent_action", "managed_profile_pause"] as const;
export const APPROVAL_STATUSES = ["pending", "approved", "denied", "used"] as const;
export const APPROVAL_ARGUMENT_KINDS = ["command", "file_path"] as const;
export const PAUSE_SCOPES = ["current_repo", "all"] as const;

export const RISK_LEVELS = ["low", "medium", "high"] as const;

export const WEBHOOK_ENDPOINT_STATUSES = ["active", "disabled"] as const;
export const WEBHOOK_EVENT_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export const WEBHOOK_DELIVERY_STATUSES = ["success", "failed"] as const;

export const DEVICE_CODE_STATUSES = ["pending", "authorized", "denied"] as const;

export const PERMISSION_PROFILE_STATUSES = ["active", "archived"] as const;

export const ENTERPRISE_INQUIRY_STATUSES = ["new", "reviewed"] as const;

export const SITE_STATUSES = ["active", "disabled"] as const;
export const SITE_GUARD_KEY_STATUSES = ["active", "revoked"] as const;

export const STATUS_COMPONENT_STATUSES = [
  "operational",
  "performance_issues",
  "partial_outage",
  "major_outage"
] as const;
export const STATUS_INCIDENT_STATUSES = [
  "investigating",
  "identified",
  "watching",
  "fixed"
] as const;
export const STATUS_INCIDENT_SEVERITIES = ["minor", "major", "critical"] as const;

export const MANAGED_PROFILE_MODES = ["unmanaged", "managed", "required"] as const;

export const POLICY_DECISION_OUTCOMES = [
  "allow",
  "auto_approve",
  "require_human",
  "deny"
] as const;

export const INTEGRATION_PROVIDERS = ["slack"] as const;
export const INTEGRATION_BINDING_STATUSES = ["active", "disabled"] as const;
export const COLLABORATION_MESSAGE_STATUSES = [
  "pending",
  "approved",
  "denied",
  "used"
] as const;

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
