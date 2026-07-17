import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";
import {
  ACCOUNT_PLANS,
  ACCOUNT_TYPES,
  AGENT_PROVIDERS,
  AGENT_STATUSES,
  AGENT_TYPES,
  APPROVAL_KINDS,
  APPROVAL_STATUSES,
  CLI_AUDIT_EVENT_TYPES,
  CONNECTION_STATUSES,
  INVITE_ROLES,
  INVITE_STATUSES,
  MANAGED_PROFILE_MODES,
  ONBOARDING_USE_CASES,
  PAUSE_SCOPES,
  PERMISSION_STATUSES,
  PERMISSION_TEMPLATES,
  RISK_LEVELS,
  TEAM_SIZES,
  WEBHOOK_ENDPOINT_STATUSES,
  WEBHOOK_EVENT_STATUSES,
  WORKSPACE_ROLES,
  sqlInList
} from "@/lib/db/postgres/enums";

const timestamptz = () => timestamp("created_at", { withTimezone: true, mode: "date" });

function createdUpdatedAt() {
  return {
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  };
}

// ---------------------------------------------------------------------------
// Tenancy & identity
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    accountId: text("account_id").primaryKey(),
    slug: text("slug"),
    name: text("name").notNull(),
    accountType: text("account_type"),
    companyName: text("company_name"),
    website: text("website"),
    teamSize: text("team_size"),
    onboarding: jsonb("onboarding"),
    plan: text("plan").notNull().default("free"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeSubscriptionStatus: text("stripe_subscription_status"),
    stripeTrialEnd: timestamp("stripe_trial_end", { withTimezone: true, mode: "date" }),
    stripeCurrentPeriodEnd: timestamp("stripe_current_period_end", {
      withTimezone: true,
      mode: "date"
    }),
    verificationCount: integer("verification_count").notNull().default(0),
    verificationPeriodStart: timestamp("verification_period_start", {
      withTimezone: true,
      mode: "date"
    })
      .notNull()
      .defaultNow(),
    ...createdUpdatedAt()
  },
  (table) => [
    check("accounts_name_length", sql`length(${table.name}) <= 120`),
    check(
      "accounts_slug_length",
      sql`${table.slug} IS NULL OR length(${table.slug}) <= 63`
    ),
    check("accounts_plan_check", sql`${table.plan} IN (${sql.raw(sqlInList(ACCOUNT_PLANS))})`),
    check(
      "accounts_account_type_check",
      sql`${table.accountType} IS NULL OR ${table.accountType} IN (${sql.raw(sqlInList(ACCOUNT_TYPES))})`
    ),
    check(
      "accounts_team_size_check",
      sql`${table.teamSize} IS NULL OR ${table.teamSize} IN (${sql.raw(sqlInList(TEAM_SIZES))})`
    ),
    check("accounts_verification_count_nonneg", sql`${table.verificationCount} >= 0`),
    index("accounts_plan_idx").on(table.plan),
    uniqueIndex("accounts_slug_uq")
      .on(table.slug)
      .where(sql`${table.slug} IS NOT NULL`),
    uniqueIndex("accounts_stripe_customer_id_uq")
      .on(table.stripeCustomerId)
      .where(sql`${table.stripeCustomerId} IS NOT NULL`)
  ]
);

export const developerUsers = pgTable(
  "developer_users",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    onboardingUseCase: text("onboarding_use_case").notNull().default("sdk"),
    primaryAccountId: text("primary_account_id").references(() => accounts.accountId, {
      onDelete: "set null"
    }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    jobTitle: text("job_title"),
    phone: text("phone"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
      mode: "date"
    }),
    dateOfBirth: date("date_of_birth"),
    emailVerified: boolean("email_verified"),
    emailVerificationTokenHash: text("email_verification_token_hash"),
    emailVerificationCodeHash: text("email_verification_code_hash"),
    passwordResetTokenHash: text("password_reset_token_hash"),
    emailVerificationTokenExpiresAt: timestamp("email_verification_token_expires_at", {
      withTimezone: true,
      mode: "date"
    }),
    passwordResetTokenExpiresAt: timestamp("password_reset_token_expires_at", {
      withTimezone: true,
      mode: "date"
    }),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "developer_users_onboarding_use_case_check",
      sql`${table.onboardingUseCase} IN (${sql.raw(sqlInList(ONBOARDING_USE_CASES))})`
    ),
    uniqueIndex("developer_users_email_lower_uq").on(sql`lower(${table.email})`)
  ]
);

export const developerSessions = pgTable(
  "developer_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => developerUsers.userId, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    activeAccountId: text("active_account_id").references(() => accounts.accountId, {
      onDelete: "set null"
    }),
    createdAt: timestamptz().notNull().defaultNow()
  },
  (table) => [
    index("developer_sessions_user_id_idx").on(table.userId),
    index("developer_sessions_expires_at_idx").on(table.expiresAt)
  ]
);

export const developerApiTokens = pgTable(
  "developer_api_tokens",
  {
    tokenId: text("token_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => developerUsers.userId),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId),
    name: text("name").notNull(),
    tokenPreview: text("token_preview"),
    tokenHash: text("token_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    ...createdUpdatedAt()
  },
  (table) => [
    index("developer_api_tokens_user_id_idx").on(table.userId),
    index("developer_api_tokens_account_id_idx").on(table.accountId)
  ]
);

export const accountMemberships = pgTable(
  "account_memberships",
  {
    membershipId: text("membership_id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => developerUsers.userId, { onDelete: "cascade" }),
    role: text("role").notNull().default("OWNER"),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "account_memberships_role_check",
      sql`${table.role} IN (${sql.raw(sqlInList(WORKSPACE_ROLES))})`
    ),
    uniqueIndex("account_memberships_account_user_uq").on(table.accountId, table.userId),
    index("account_memberships_user_id_idx").on(table.userId),
    index("account_memberships_account_role_idx").on(table.accountId, table.role)
  ]
);

export const accountInvites = pgTable(
  "account_invites",
  {
    inviteId: text("invite_id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    inviteTokenHash: text("invite_token_hash"),
    inviteTokenExpiresAt: timestamp("invite_token_expires_at", {
      withTimezone: true,
      mode: "date"
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    acceptedByUserId: text("accepted_by_user_id").references(() => developerUsers.userId, {
      onDelete: "set null"
    }),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => developerUsers.userId),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "account_invites_role_check",
      sql`${table.role} IN (${sql.raw(sqlInList(INVITE_ROLES))})`
    ),
    check(
      "account_invites_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(INVITE_STATUSES))})`
    ),
    uniqueIndex("account_invites_account_email_status_uq").on(
      table.accountId,
      table.email,
      table.status
    ),
    uniqueIndex("account_invites_invite_token_hash_uq")
      .on(table.inviteTokenHash)
      .where(sql`${table.inviteTokenHash} IS NOT NULL`),
    index("account_invites_email_status_idx").on(table.email, table.status)
  ]
);

// ---------------------------------------------------------------------------
// Agents, permissions, approvals, verification logs
// ---------------------------------------------------------------------------

export const agents = pgTable(
  "agents",
  {
    agentId: text("agent_id").primaryKey(),
    accountId: text("account_id").references(() => accounts.accountId),
    developerUserId: text("developer_user_id").references(() => developerUsers.userId),
    name: text("name").notNull(),
    agentType: text("agent_type").notNull().default("native"),
    provider: text("provider").notNull().default("custom"),
    externalAgentId: text("external_agent_id"),
    externalAgentLabel: text("external_agent_label"),
    connectionStatus: text("connection_status").notNull().default("manual"),
    description: text("description"),
    guidelines: text("guidelines").array().notNull().default(sql`'{}'`),
    publicPassportTokenHash: text("public_passport_token_hash"),
    publicPassportTokenPreview: text("public_passport_token_preview"),
    publicPassportEnabled: boolean("public_passport_enabled").notNull().default(false),
    apiKeyHash: text("api_key_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    keyRotatedAt: timestamp("key_rotated_at", { withTimezone: true, mode: "date" }),
    status: text("status").notNull().default("active"),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "agents_agent_type_check",
      sql`${table.agentType} IN (${sql.raw(sqlInList(AGENT_TYPES))})`
    ),
    check(
      "agents_provider_check",
      sql`${table.provider} IN (${sql.raw(sqlInList(AGENT_PROVIDERS))})`
    ),
    check(
      "agents_connection_status_check",
      sql`${table.connectionStatus} IN (${sql.raw(sqlInList(CONNECTION_STATUSES))})`
    ),
    check(
      "agents_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(AGENT_STATUSES))})`
    ),
    index("agents_account_status_idx").on(table.accountId, table.status),
    index("agents_developer_user_id_idx").on(table.developerUserId)
  ]
);

export const permissions = pgTable(
  "permissions",
  {
    permissionId: text("permission_id").primaryKey(),
    accountId: text("account_id").references(() => accounts.accountId),
    developerUserId: text("developer_user_id").references(() => developerUsers.userId),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.agentId, { onDelete: "cascade" }),
    action: text("action").notNull(),
    description: text("description"),
    resource: text("resource"),
    scope: text("scope"),
    allowedActions: text("allowed_actions").array().notNull().default(sql`'{}'`),
    blockedActions: text("blocked_actions").array().notNull().default(sql`'{}'`),
    requiresApproval: boolean("requires_approval"),
    notes: text("notes"),
    template: text("template"),
    constraints: jsonb("constraints"),
    status: text("status").notNull().default("active"),
    requiredAuthorityLevel: smallint("required_authority_level"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "permissions_template_check",
      sql`${table.template} IS NULL OR ${table.template} IN (${sql.raw(sqlInList(PERMISSION_TEMPLATES))})`
    ),
    check(
      "permissions_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(PERMISSION_STATUSES))})`
    ),
    check(
      "permissions_required_authority_level_check",
      sql`${table.requiredAuthorityLevel} IS NULL OR (${table.requiredAuthorityLevel} >= 0 AND ${table.requiredAuthorityLevel} <= 100)`
    ),
    index("permissions_agent_status_idx").on(table.agentId, table.status),
    index("permissions_account_agent_action_status_idx").on(
      table.accountId,
      table.agentId,
      table.action,
      table.status
    ),
    index("permissions_developer_user_status_idx").on(table.developerUserId, table.status)
  ]
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    approvalId: text("approval_id").primaryKey(),
    requestId: text("request_id").notNull().unique(),
    accountId: text("account_id").references(() => accounts.accountId),
    developerUserId: text("developer_user_id").references(() => developerUsers.userId),
    kind: text("kind").notNull().default("agent_action"),
    agentId: text("agent_id").references(() => agents.agentId, { onDelete: "set null" }),
    permissionId: text("permission_id").references(() => permissions.permissionId, {
      onDelete: "set null"
    }),
    action: text("action").notNull(),
    vendor: text("vendor"),
    amount: numeric("amount"),
    pauseTool: text("pause_tool"),
    pauseRepo: text("pause_repo"),
    pauseBranch: text("pause_branch"),
    pauseDeviceId: text("pause_device_id"),
    pauseScope: text("pause_scope"),
    requestedDurationMinutes: integer("requested_duration_minutes"),
    pauseReason: text("pause_reason"),
    contextReason: text("context_reason"),
    status: text("status").notNull().default("pending"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    grantExpiresAt: timestamp("grant_expires_at", { withTimezone: true, mode: "date" }),
    requiredAuthorityLevel: smallint("required_authority_level"),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "approval_requests_kind_check",
      sql`${table.kind} IN (${sql.raw(sqlInList(APPROVAL_KINDS))})`
    ),
    check(
      "approval_requests_pause_scope_check",
      sql`${table.pauseScope} IS NULL OR ${table.pauseScope} IN (${sql.raw(sqlInList(PAUSE_SCOPES))})`
    ),
    check(
      "approval_requests_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(APPROVAL_STATUSES))})`
    ),
    check(
      "approval_requests_requested_duration_check",
      sql`${table.requestedDurationMinutes} IS NULL OR ${table.requestedDurationMinutes} >= 1`
    ),
    check(
      "approval_requests_required_authority_level_check",
      sql`${table.requiredAuthorityLevel} IS NULL OR (${table.requiredAuthorityLevel} >= 0 AND ${table.requiredAuthorityLevel} <= 100)`
    ),
    index("approval_requests_agent_permission_status_grant_idx").on(
      table.agentId,
      table.permissionId,
      table.status,
      table.grantExpiresAt
    ),
    index("approval_requests_account_status_created_idx").on(
      table.accountId,
      table.status,
      table.createdAt
    ),
    index("approval_requests_developer_status_created_idx").on(
      table.developerUserId,
      table.status,
      table.createdAt
    )
  ]
);

/**
 * High-volume append-only log table. The SQL migration declares this table as
 * RANGE-partitioned by created_at; Drizzle models the composite keys required
 * by Postgres partitioned-table uniqueness rules.
 */
export const verificationLogs = pgTable(
  "verification_logs",
  {
    logId: text("log_id").notNull(),
    requestId: text("request_id").notNull(),
    accountId: text("account_id"),
    developerUserId: text("developer_user_id"),
    agentId: text("agent_id").notNull(),
    permissionId: text("permission_id"),
    action: text("action").notNull(),
    amount: numeric("amount"),
    vendor: text("vendor"),
    allowed: boolean("allowed").notNull(),
    approvalRequired: boolean("approval_required").notNull().default(false),
    reason: text("reason").notNull(),
    risk: text("risk").notNull(),
    metadata: jsonb("metadata"),
    shadow: boolean("shadow").notNull().default(false),
    ...createdUpdatedAt()
  },
  (table) => [
    primaryKey({
      name: "verification_logs_pkey",
      columns: [table.logId, table.createdAt]
    }),
    uniqueIndex("verification_logs_request_created_uq").on(table.requestId, table.createdAt),
    check(
      "verification_logs_risk_check",
      sql`${table.risk} IN (${sql.raw(sqlInList(RISK_LEVELS))})`
    ),
    index("verification_logs_account_created_idx").on(table.accountId, table.createdAt),
    index("verification_logs_account_agent_created_idx").on(
      table.accountId,
      table.agentId,
      table.createdAt
    ),
    index("verification_logs_agent_created_idx").on(table.agentId, table.createdAt),
    index("verification_logs_allowed_idx").on(table.allowed),
    index("verification_logs_developer_created_idx").on(table.developerUserId, table.createdAt)
  ]
);

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    webhookId: text("webhook_id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    developerUserId: text("developer_user_id").references(() => developerUsers.userId),
    url: text("url").notNull(),
    secretHash: text("secret_hash").notNull(),
    secretPreview: text("secret_preview").notNull(),
    events: text("events").array().notNull(),
    status: text("status").notNull().default("active"),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true, mode: "date" }),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "webhook_endpoints_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(WEBHOOK_ENDPOINT_STATUSES))})`
    ),
    index("webhook_endpoints_account_status_idx").on(table.accountId, table.status)
  ]
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId),
    developerUserId: text("developer_user_id").references(() => developerUsers.userId),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
      mode: "date"
    }),
    deadLetter: boolean("dead_letter").notNull().default(false),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "webhook_events_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(WEBHOOK_EVENT_STATUSES))})`
    ),
    index("webhook_events_status_next_attempt_created_idx").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt
    ),
    index("webhook_events_account_dead_letter_created_idx").on(
      table.accountId,
      table.deadLetter,
      table.createdAt
    )
  ]
);

// ---------------------------------------------------------------------------
// Managed Profiles
// ---------------------------------------------------------------------------

export const managedProfilePolicies = pgTable(
  "managed_profile_policies",
  {
    policyId: text("policy_id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .unique()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("UTC"),
    enabled: boolean("enabled").notNull().default(false),
    workHours: jsonb("work_hours").notNull().default(sql`'{}'::jsonb`),
    duringHoursMode: text("during_hours_mode").notNull().default("managed"),
    outsideHoursMode: text("outside_hours_mode").notNull().default("unmanaged"),
    defaultMode: text("default_mode").notNull().default("unmanaged"),
    toolModes: jsonb("tool_modes").notNull().default(sql`'{}'::jsonb`),
    pausePolicy: jsonb("pause_policy").notNull().default(sql`'{}'::jsonb`),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "managed_profile_policies_during_hours_mode_check",
      sql`${table.duringHoursMode} IN (${sql.raw(sqlInList(MANAGED_PROFILE_MODES))})`
    ),
    check(
      "managed_profile_policies_outside_hours_mode_check",
      sql`${table.outsideHoursMode} IN (${sql.raw(sqlInList(MANAGED_PROFILE_MODES))})`
    ),
    check(
      "managed_profile_policies_default_mode_check",
      sql`${table.defaultMode} IN (${sql.raw(sqlInList(MANAGED_PROFILE_MODES))})`
    )
  ]
);

export const managedProfileProtectedRepos = pgTable(
  "managed_profile_protected_repos",
  {
    policyId: text("policy_id")
      .notNull()
      .references(() => managedProfilePolicies.policyId, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId),
    repoHash: text("repo_hash").notNull(),
    label: text("label"),
    mode: text("mode").notNull().default("required"),
    enabled: boolean("enabled").notNull().default(true)
  },
  (table) => [
    primaryKey({ columns: [table.policyId, table.repoHash] }),
    check(
      "managed_profile_protected_repos_mode_check",
      sql`${table.mode} IN (${sql.raw(sqlInList(MANAGED_PROFILE_MODES))})`
    ),
    uniqueIndex("managed_profile_protected_repos_account_repo_uq").on(
      table.accountId,
      table.repoHash
    ),
    index("managed_profile_protected_repos_account_id_idx").on(table.accountId)
  ]
);

/**
 * Managed Profile CLI activity feed (Mongo model: CliAuditLog).
 * Table name uses "activities" to match repository vocabulary; maps 1:1 to cli_audit_logs in the migration plan.
 */
export const cliAuditActivities = pgTable(
  "cli_audit_activities",
  {
    auditId: text("audit_id").primaryKey(),
    accountId: text("account_id"),
    userId: text("user_id"),
    eventType: text("event_type").notNull(),
    tool: text("tool"),
    repo: text("repo"),
    branch: text("branch"),
    mode: text("mode"),
    granted: boolean("granted"),
    reason: text("reason").notNull(),
    metadata: jsonb("metadata"),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "cli_audit_activities_event_type_check",
      sql`${table.eventType} IN (${sql.raw(sqlInList(CLI_AUDIT_EVENT_TYPES))})`
    ),
    check(
      "cli_audit_activities_mode_check",
      sql`${table.mode} IS NULL OR ${table.mode} IN (${sql.raw(sqlInList(MANAGED_PROFILE_MODES))})`
    ),
    index("cli_audit_activities_account_created_idx").on(table.accountId, table.createdAt),
    index("cli_audit_activities_account_event_created_idx").on(
      table.accountId,
      table.eventType,
      table.createdAt
    )
  ]
);

/** All core v1 tables exported for static validation and future repository adapters. */
export const coreTables = {
  accounts,
  developerUsers,
  developerSessions,
  developerApiTokens,
  accountMemberships,
  accountInvites,
  agents,
  permissions,
  approvalRequests,
  verificationLogs,
  webhookEndpoints,
  webhookEvents,
  managedProfilePolicies,
  managedProfileProtectedRepos,
  cliAuditActivities
} as const;

export type CoreTableName = keyof typeof coreTables;
