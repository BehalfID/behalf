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
  APPROVAL_ARGUMENT_KINDS,
  APPROVAL_KINDS,
  APPROVAL_STATUSES,
  CLI_AUDIT_EVENT_TYPES,
  COLLABORATION_MESSAGE_STATUSES,
  CONNECTION_STATUSES,
  DEVICE_CODE_STATUSES,
  ENTERPRISE_INQUIRY_STATUSES,
  INTEGRATION_BINDING_STATUSES,
  INTEGRATION_PROVIDERS,
  INVITE_ROLES,
  INVITE_STATUSES,
  MANAGED_PROFILE_MODES,
  ONBOARDING_USE_CASES,
  PAUSE_SCOPES,
  PERMISSION_PROFILE_STATUSES,
  PERMISSION_STATUSES,
  PERMISSION_TEMPLATES,
  RISK_LEVELS,
  SITE_GUARD_KEY_STATUSES,
  SITE_STATUSES,
  STATUS_COMPONENT_STATUSES,
  STATUS_INCIDENT_SEVERITIES,
  STATUS_INCIDENT_STATUSES,
  TEAM_SIZES,
  WEBHOOK_DELIVERY_STATUSES,
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
    sso: jsonb("sso"),
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
    /** Nullable for Google-only accounts. */
    passwordHash: text("password_hash"),
    googleSub: text("google_sub"),
    authProviders: jsonb("auth_providers").$type<Array<"password" | "google">>(),
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
    uniqueIndex("developer_users_email_lower_uq").on(sql`lower(${table.email})`),
    uniqueIndex("developer_users_google_sub_uq")
      .on(table.googleSub)
      .where(sql`${table.googleSub} IS NOT NULL`)
  ]
);

export const oauthPendingSignups = pgTable(
  "oauth_pending_signups",
  {
    pendingId: text("pending_id").primaryKey(),
    googleSub: text("google_sub").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamptz().notNull().defaultNow()
  },
  (table) => [
    index("oauth_pending_signups_google_sub_idx").on(table.googleSub),
    index("oauth_pending_signups_expires_at_idx").on(table.expiresAt)
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
    /**
     * Last authenticated activity. Required in Mongo with default Date.now on insert.
     * Sliding inactivity window updates this field together with expires_at
     * (see lib/developerAuth.ts). Application expiry checks remain authoritative;
     * pg_cron TTL cleanup is best-effort storage hygiene only.
     */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
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
    /** Bound approval target for execute_command / read_file / write_file. */
    argumentKind: text("argument_kind"),
    /** SHA-256 hex digest of the versioned canonical approval intent. */
    argumentFingerprint: text("argument_fingerprint"),
    /** Bounded, best-effort-redacted preview for Action Inbox display. */
    argumentPreview: text("argument_preview"),
    argumentPreviewTruncated: boolean("argument_preview_truncated"),
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
    /** When an approved grant was atomically consumed by verify(). Distinct from resolved_at. */
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
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
      "approval_requests_argument_kind_check",
      sql`${table.argumentKind} IS NULL OR ${table.argumentKind} IN (${sql.raw(sqlInList(APPROVAL_ARGUMENT_KINDS))})`
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
    /**
     * Mirrors Mongo `approval_pending_tuple_unique` (partial unique on pending agent_action),
     * including argumentFingerprint so distinct commands/paths cannot collide.
     * NULLS NOT DISTINCT matches Mongo unique-index null equality.
     * Declared in SQL migration (Drizzle cannot express NULLS NOT DISTINCT + partial WHERE).
     */
    index("approval_requests_argument_fingerprint_idx").on(table.argumentFingerprint),
    index("approval_requests_agent_permission_status_grant_idx").on(
      table.agentId,
      table.permissionId,
      table.status,
      table.grantExpiresAt
    ),
    index("approval_requests_grant_lookup_idx").on(
      table.agentId,
      table.permissionId,
      table.action,
      table.vendor,
      table.amount,
      table.argumentFingerprint,
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
    ),
    /**
     * Mirrors Mongo's NON-unique managed_profile_pause compound index
     * (accountId, developerUserId, kind, pauseTool, pauseScope, pauseRepo, pauseDeviceId, status).
     * Mongo does NOT enforce uniqueness on the pending pause tuple — dedupe happens via an
     * atomic upsert — so this index is intentionally non-unique. Migration 0000 shipped a
     * stricter partial UNIQUE index (approval_requests_managed_profile_pause_pending_uq) that
     * migration 0004 drops to restore Mongo parity.
     */
    index("approval_requests_pause_pending_lookup_idx").on(
      table.accountId,
      table.developerUserId,
      table.kind,
      table.pauseTool,
      table.pauseScope,
      table.pauseRepo,
      table.pauseDeviceId,
      table.status
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

// ---------------------------------------------------------------------------
// Device codes, permission profiles, webhook deliveries, billing, CLI leases
// ---------------------------------------------------------------------------

export const deviceCodes = pgTable(
  "device_codes",
  {
    codeId: text("code_id").primaryKey(),
    deviceCode: text("device_code").notNull().unique(),
    userCode: text("user_code").notNull().unique(),
    status: text("status").notNull().default("pending"),
    userId: text("user_id").references(() => developerUsers.userId, { onDelete: "set null" }),
    /** Plain session token issued on authorize — repository-restricted read (mirrors Mongo). */
    sessionToken: text("session_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamptz().notNull().defaultNow()
  },
  (table) => [
    check(
      "device_codes_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(DEVICE_CODE_STATUSES))})`
    ),
    index("device_codes_expires_at_idx").on(table.expiresAt)
  ]
);

export const permissionProfiles = pgTable(
  "permission_profiles",
  {
    profileId: text("profile_id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Template permission snapshots applied into `permissions` rows — never filtered by sub-field. */
    permissions: jsonb("permissions").notNull().default(sql`'[]'::jsonb`),
    requiredAuthorityLevel: smallint("required_authority_level").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => developerUsers.userId),
    status: text("status").notNull().default("active"),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "permission_profiles_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(PERMISSION_PROFILE_STATUSES))})`
    ),
    check(
      "permission_profiles_required_authority_level_check",
      sql`${table.requiredAuthorityLevel} >= 0 AND ${table.requiredAuthorityLevel} <= 100`
    ),
    index("permission_profiles_account_id_idx").on(table.accountId),
    index("permission_profiles_required_authority_level_idx").on(table.requiredAuthorityLevel),
    index("permission_profiles_created_by_idx").on(table.createdBy),
    index("permission_profiles_status_idx").on(table.status),
    index("permission_profiles_account_name_status_idx").on(
      table.accountId,
      table.name,
      table.status
    )
  ]
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    deliveryId: text("delivery_id").primaryKey(),
    accountId: text("account_id").notNull(),
    developerUserId: text("developer_user_id"),
    webhookId: text("webhook_id").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    status: text("status").notNull(),
    httpStatus: integer("http_status"),
    error: text("error"),
    attempt: integer("attempt").notNull().default(1),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: "date" }),
    maxAttempts: integer("max_attempts").notNull().default(5),
    createdAt: timestamptz().notNull().defaultNow()
  },
  (table) => [
    check(
      "webhook_deliveries_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(WEBHOOK_DELIVERY_STATUSES))})`
    ),
    index("webhook_deliveries_account_id_idx").on(table.accountId),
    index("webhook_deliveries_developer_user_id_idx").on(table.developerUserId),
    index("webhook_deliveries_webhook_id_idx").on(table.webhookId),
    index("webhook_deliveries_event_id_idx").on(table.eventId),
    index("webhook_deliveries_event_type_idx").on(table.eventType),
    index("webhook_deliveries_account_webhook_created_idx").on(
      table.accountId,
      table.webhookId,
      table.createdAt
    ),
    index("webhook_deliveries_developer_webhook_created_idx").on(
      table.developerUserId,
      table.webhookId,
      table.createdAt
    )
  ]
);

export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    type: text("type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    ...createdUpdatedAt()
  }
);

export const enterpriseInquiries = pgTable(
  "enterprise_inquiries",
  {
    inquiryId: text("inquiry_id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company").notNull(),
    message: text("message").notNull().default(""),
    status: text("status").notNull().default("new"),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "enterprise_inquiries_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(ENTERPRISE_INQUIRY_STATUSES))})`
    ),
    index("enterprise_inquiries_status_idx").on(table.status)
  ]
);

export const cliPauseLeases = pgTable(
  "cli_pause_leases",
  {
    leaseId: text("lease_id").primaryKey(),
    accountId: text("account_id").references(() => accounts.accountId, { onDelete: "set null" }),
    userId: text("user_id").references(() => developerUsers.userId, { onDelete: "set null" }),
    deviceId: text("device_id"),
    tool: text("tool"),
    repo: text("repo"),
    branch: text("branch"),
    scope: text("scope").default("current_repo"),
    reason: text("reason").notNull(),
    granted: boolean("granted").notNull(),
    deniedReason: text("denied_reason"),
    mode: text("mode").default("unmanaged"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "cli_pause_leases_scope_check",
      sql`${table.scope} IS NULL OR ${table.scope} IN (${sql.raw(sqlInList(PAUSE_SCOPES))})`
    ),
    check(
      "cli_pause_leases_mode_check",
      sql`${table.mode} IS NULL OR ${table.mode} IN (${sql.raw(sqlInList(MANAGED_PROFILE_MODES))})`
    ),
    index("cli_pause_leases_account_id_idx").on(table.accountId),
    index("cli_pause_leases_user_id_idx").on(table.userId),
    index("cli_pause_leases_device_id_idx").on(table.deviceId),
    index("cli_pause_leases_expires_at_idx").on(table.expiresAt),
    index("cli_pause_leases_account_user_expires_idx").on(
      table.accountId,
      table.userId,
      table.expiresAt
    ),
    index("cli_pause_leases_device_expires_idx").on(table.deviceId, table.expiresAt)
  ]
);

// ---------------------------------------------------------------------------
// Site Guard
// ---------------------------------------------------------------------------

export const sites = pgTable(
  "sites",
  {
    siteId: text("site_id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    developerUserId: text("developer_user_id")
      .notNull()
      .references(() => developerUsers.userId),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    status: text("status").notNull().default("active"),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "sites_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(SITE_STATUSES))})`
    ),
    uniqueIndex("sites_account_domain_uq").on(table.accountId, table.domain),
    index("sites_account_id_idx").on(table.accountId),
    index("sites_developer_user_id_idx").on(table.developerUserId),
    index("sites_domain_idx").on(table.domain),
    index("sites_status_idx").on(table.status),
    index("sites_developer_created_idx").on(table.developerUserId, table.createdAt)
  ]
);

export const siteAccessRules = pgTable(
  "site_access_rules",
  {
    ruleId: text("rule_id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.siteId, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    developerUserId: text("developer_user_id")
      .notNull()
      .references(() => developerUsers.userId),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    agentIdentifier: text("agent_identifier"),
    userAgentPattern: text("user_agent_pattern"),
    allowedPaths: text("allowed_paths").array().notNull().default(sql`'{}'`),
    blockedPaths: text("blocked_paths").array().notNull().default(sql`'{}'`),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    notes: text("notes"),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "site_access_rules_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(SITE_STATUSES))})`
    ),
    index("site_access_rules_site_id_idx").on(table.siteId),
    index("site_access_rules_account_id_idx").on(table.accountId),
    index("site_access_rules_developer_user_id_idx").on(table.developerUserId),
    index("site_access_rules_status_idx").on(table.status),
    index("site_access_rules_account_site_created_idx").on(
      table.accountId,
      table.siteId,
      table.createdAt
    )
  ]
);

export const siteAccessLogs = pgTable(
  "site_access_logs",
  {
    requestId: text("request_id").primaryKey(),
    siteId: text("site_id").notNull(),
    accountId: text("account_id").notNull(),
    developerUserId: text("developer_user_id").notNull(),
    ruleId: text("rule_id"),
    domain: text("domain").notNull(),
    path: text("path").notNull(),
    userAgent: text("user_agent").notNull(),
    agentIdentifier: text("agent_identifier"),
    allowed: boolean("allowed").notNull(),
    reason: text("reason").notNull(),
    risk: text("risk").notNull(),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "site_access_logs_risk_check",
      sql`${table.risk} IN (${sql.raw(sqlInList(RISK_LEVELS))})`
    ),
    index("site_access_logs_site_id_idx").on(table.siteId),
    index("site_access_logs_account_id_idx").on(table.accountId),
    index("site_access_logs_developer_user_id_idx").on(table.developerUserId),
    index("site_access_logs_rule_id_idx").on(table.ruleId),
    index("site_access_logs_account_site_created_idx").on(
      table.accountId,
      table.siteId,
      table.createdAt
    ),
    index("site_access_logs_developer_created_idx").on(table.developerUserId, table.createdAt)
  ]
);

export const siteGuardKeys = pgTable(
  "site_guard_keys",
  {
    keyId: text("key_id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.siteId, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    developerUserId: text("developer_user_id")
      .notNull()
      .references(() => developerUsers.userId),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPreview: text("key_preview").notNull(),
    status: text("status").notNull().default("active"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "site_guard_keys_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(SITE_GUARD_KEY_STATUSES))})`
    ),
    index("site_guard_keys_site_id_idx").on(table.siteId),
    index("site_guard_keys_account_id_idx").on(table.accountId),
    index("site_guard_keys_developer_user_id_idx").on(table.developerUserId),
    index("site_guard_keys_status_idx").on(table.status),
    index("site_guard_keys_site_status_idx").on(table.siteId, table.status),
    index("site_guard_keys_account_created_idx").on(table.accountId, table.createdAt)
  ]
);

// ---------------------------------------------------------------------------
// Status page (global)
// ---------------------------------------------------------------------------

export const statusComponents = pgTable(
  "status_components",
  {
    componentId: text("component_id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    group: text("group"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("operational"),
    enabled: boolean("enabled").notNull().default(true),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "status_components_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(STATUS_COMPONENT_STATUSES))})`
    ),
    index("status_components_group_idx").on(table.group),
    index("status_components_sort_order_idx").on(table.sortOrder),
    index("status_components_status_idx").on(table.status),
    index("status_components_enabled_idx").on(table.enabled)
  ]
);

export const statusIncidents = pgTable(
  "status_incidents",
  {
    incidentId: text("incident_id").primaryKey(),
    title: text("title").notNull(),
    message: text("message"),
    status: text("status").notNull().default("investigating"),
    severity: text("severity").notNull().default("minor"),
    componentIds: text("component_ids").array().notNull().default(sql`'{}'`),
    /** Embedded incident timeline (Mongo subdocs with optional _id) — always read whole. */
    updates: jsonb("updates").notNull().default(sql`'[]'::jsonb`),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "status_incidents_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(STATUS_INCIDENT_STATUSES))})`
    ),
    check(
      "status_incidents_severity_check",
      sql`${table.severity} IN (${sql.raw(sqlInList(STATUS_INCIDENT_SEVERITIES))})`
    ),
    index("status_incidents_status_idx").on(table.status),
    index("status_incidents_severity_idx").on(table.severity)
  ]
);

// ---------------------------------------------------------------------------
// Policy documents & collaboration integrations
// ---------------------------------------------------------------------------

export const policyDocuments = pgTable(
  "policy_documents",
  {
    policyId: text("policy_id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .unique()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    name: text("name"),
    version: integer("version").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    /** Ordered policy rules (id, priority, when[], then, reason). */
    rules: jsonb("rules").notNull().default(sql`'[]'::jsonb`),
    updatedBy: text("updated_by"),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "policy_documents_version_check",
      sql`${table.version} >= 1`
    ),
    index("policy_documents_enabled_idx").on(table.enabled),
    index("policy_documents_updated_by_idx").on(table.updatedBy),
    index("policy_documents_account_enabled_idx").on(table.accountId, table.enabled)
  ]
);

export const integrationBindings = pgTable(
  "integration_bindings",
  {
    bindingId: text("binding_id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("active"),
    teamId: text("team_id").notNull(),
    teamName: text("team_name"),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name"),
    /** Slack bot token — never return in lean list queries. */
    botToken: text("bot_token").notNull(),
    /** Slack signing secret for interactive payloads. */
    signingSecret: text("signing_secret").notNull(),
    /** External user id → Behalf user id mappings. */
    identityMap: jsonb("identity_map").notNull().default(sql`'[]'::jsonb`),
    createdBy: text("created_by").notNull(),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "integration_bindings_provider_check",
      sql`${table.provider} IN (${sql.raw(sqlInList(INTEGRATION_PROVIDERS))})`
    ),
    check(
      "integration_bindings_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(INTEGRATION_BINDING_STATUSES))})`
    ),
    uniqueIndex("integration_bindings_account_provider_team_channel_uq").on(
      table.accountId,
      table.provider,
      table.teamId,
      table.channelId
    ),
    index("integration_bindings_account_id_idx").on(table.accountId),
    index("integration_bindings_provider_idx").on(table.provider),
    index("integration_bindings_status_idx").on(table.status),
    index("integration_bindings_team_id_idx").on(table.teamId),
    index("integration_bindings_created_by_idx").on(table.createdBy),
    index("integration_bindings_account_provider_status_idx").on(
      table.accountId,
      table.provider,
      table.status
    )
  ]
);

export const collaborationMessageRefs = pgTable(
  "collaboration_message_refs",
  {
    refId: text("ref_id").primaryKey(),
    accountId: text("account_id").notNull(),
    provider: text("provider").notNull(),
    bindingId: text("binding_id").notNull(),
    approvalId: text("approval_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageTs: text("message_ts").notNull(),
    status: text("status").notNull().default("pending"),
    ...createdUpdatedAt()
  },
  (table) => [
    check(
      "collaboration_message_refs_provider_check",
      sql`${table.provider} IN (${sql.raw(sqlInList(INTEGRATION_PROVIDERS))})`
    ),
    check(
      "collaboration_message_refs_status_check",
      sql`${table.status} IN (${sql.raw(sqlInList(COLLABORATION_MESSAGE_STATUSES))})`
    ),
    uniqueIndex("collaboration_message_refs_account_approval_provider_uq").on(
      table.accountId,
      table.approvalId,
      table.provider
    ),
    index("collaboration_message_refs_account_id_idx").on(table.accountId),
    index("collaboration_message_refs_provider_idx").on(table.provider),
    index("collaboration_message_refs_binding_id_idx").on(table.bindingId),
    index("collaboration_message_refs_approval_id_idx").on(table.approvalId),
    index("collaboration_message_refs_status_idx").on(table.status)
  ]
);

/** All schema tables exported for static validation and future repository adapters. */
export const coreTables = {
  accounts,
  developerUsers,
  oauthPendingSignups,
  developerSessions,
  developerApiTokens,
  accountMemberships,
  accountInvites,
  deviceCodes,
  agents,
  permissions,
  permissionProfiles,
  approvalRequests,
  verificationLogs,
  webhookEndpoints,
  webhookEvents,
  webhookDeliveries,
  stripeWebhookEvents,
  enterpriseInquiries,
  managedProfilePolicies,
  managedProfileProtectedRepos,
  cliPauseLeases,
  cliAuditActivities,
  sites,
  siteAccessRules,
  siteAccessLogs,
  siteGuardKeys,
  statusComponents,
  statusIncidents,
  policyDocuments,
  integrationBindings,
  collaborationMessageRefs
} as const;

export type CoreTableName = keyof typeof coreTables;
