-- Initial Postgres schema (v1)
-- Source: docs/DATABASE_MIGRATION.md §5–§9
-- Runtime: NOT wired — Mongo/Mongoose remains production backing store.
--
-- RLS posture: enabled on all tables with no policies (deny-all for anon/authenticated).
-- Server-side service-role connections bypass RLS. No client-side Supabase queries in v1.
--
-- verification_logs: monthly RANGE partitions on created_at, with guarded maintenance helpers.

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "accounts" (
  "account_id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "account_type" text,
  "company_name" text,
  "website" text,
  "team_size" text,
  "onboarding" jsonb,
  "plan" text DEFAULT 'free' NOT NULL,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "stripe_subscription_status" text,
  "stripe_trial_end" timestamptz,
  "stripe_current_period_end" timestamptz,
  "verification_count" integer DEFAULT 0 NOT NULL,
  "verification_period_start" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "accounts_name_length" CHECK (length("name") <= 120),
  CONSTRAINT "accounts_plan_check" CHECK ("plan" IN ('free', 'pro', 'team', 'business', 'enterprise')),
  CONSTRAINT "accounts_account_type_check" CHECK ("account_type" IS NULL OR "account_type" IN ('individual', 'business')),
  CONSTRAINT "accounts_team_size_check" CHECK ("team_size" IS NULL OR "team_size" IN ('1', '2-5', '6-20', '21-50', '51+')),
  CONSTRAINT "accounts_verification_count_nonneg" CHECK ("verification_count" >= 0)
);

CREATE INDEX IF NOT EXISTS "accounts_plan_idx" ON "accounts" ("plan");
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_stripe_customer_id_uq" ON "accounts" ("stripe_customer_id") WHERE "stripe_customer_id" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- developer_users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "developer_users" (
  "user_id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "onboarding_use_case" text DEFAULT 'sdk' NOT NULL,
  "primary_account_id" text,
  "first_name" text,
  "last_name" text,
  "job_title" text,
  "phone" text,
  "onboarding_completed_at" timestamptz,
  "date_of_birth" date,
  "email_verified" boolean,
  "email_verification_token_hash" text,
  "email_verification_code_hash" text,
  "password_reset_token_hash" text,
  "email_verification_token_expires_at" timestamptz,
  "password_reset_token_expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "developer_users_onboarding_use_case_check" CHECK ("onboarding_use_case" IN ('personal', 'website', 'sdk')),
  CONSTRAINT "developer_users_primary_account_id_accounts_account_id_fk" FOREIGN KEY ("primary_account_id") REFERENCES "accounts"("account_id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "developer_users_email_lower_uq" ON "developer_users" (lower("email"));

-- ---------------------------------------------------------------------------
-- developer_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "developer_sessions" (
  "session_id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "active_account_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "developer_sessions_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "developer_sessions_user_id_developer_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "developer_users"("user_id") ON DELETE CASCADE,
  CONSTRAINT "developer_sessions_active_account_id_accounts_account_id_fk" FOREIGN KEY ("active_account_id") REFERENCES "accounts"("account_id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "developer_sessions_user_id_idx" ON "developer_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "developer_sessions_expires_at_idx" ON "developer_sessions" ("expires_at");

-- ---------------------------------------------------------------------------
-- developer_api_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "developer_api_tokens" (
  "token_id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "account_id" text NOT NULL,
  "name" text NOT NULL,
  "token_preview" text,
  "token_hash" text NOT NULL,
  "last_used_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "developer_api_tokens_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "developer_api_tokens_user_id_developer_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "developer_users"("user_id"),
  CONSTRAINT "developer_api_tokens_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id")
);

CREATE INDEX IF NOT EXISTS "developer_api_tokens_user_id_idx" ON "developer_api_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "developer_api_tokens_account_id_idx" ON "developer_api_tokens" ("account_id");

-- ---------------------------------------------------------------------------
-- account_memberships
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "account_memberships" (
  "membership_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" text DEFAULT 'OWNER' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "account_memberships_role_check" CHECK ("role" IN ('OWNER', 'ENGINEERING_LEAD', 'SENIOR_ENGINEER', 'ENGINEER', 'VIEWER')),
  CONSTRAINT "account_memberships_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "account_memberships_user_id_developer_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "developer_users"("user_id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_memberships_account_user_uq" ON "account_memberships" ("account_id", "user_id");
CREATE INDEX IF NOT EXISTS "account_memberships_user_id_idx" ON "account_memberships" ("user_id");
CREATE INDEX IF NOT EXISTS "account_memberships_account_role_idx" ON "account_memberships" ("account_id", "role");

-- ---------------------------------------------------------------------------
-- account_invites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "account_invites" (
  "invite_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "email" text NOT NULL,
  "role" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "invite_token_hash" text,
  "invite_token_expires_at" timestamptz,
  "accepted_at" timestamptz,
  "accepted_by_user_id" text,
  "invited_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "account_invites_role_check" CHECK ("role" IN ('ENGINEERING_LEAD', 'SENIOR_ENGINEER', 'ENGINEER', 'VIEWER')),
  CONSTRAINT "account_invites_status_check" CHECK ("status" IN ('pending', 'accepted', 'revoked')),
  CONSTRAINT "account_invites_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "account_invites_accepted_by_user_id_developer_users_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "developer_users"("user_id") ON DELETE SET NULL,
  CONSTRAINT "account_invites_invited_by_developer_users_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "developer_users"("user_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_invites_account_email_status_uq" ON "account_invites" ("account_id", "email", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "account_invites_invite_token_hash_uq" ON "account_invites" ("invite_token_hash") WHERE "invite_token_hash" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "account_invites_email_status_idx" ON "account_invites" ("email", "status");

-- ---------------------------------------------------------------------------
-- agents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "agents" (
  "agent_id" text PRIMARY KEY NOT NULL,
  "account_id" text,
  "developer_user_id" text,
  "name" text NOT NULL,
  "agent_type" text DEFAULT 'native' NOT NULL,
  "provider" text DEFAULT 'custom' NOT NULL,
  "external_agent_id" text,
  "external_agent_label" text,
  "connection_status" text DEFAULT 'manual' NOT NULL,
  "description" text,
  "guidelines" text[] DEFAULT '{}' NOT NULL,
  "public_passport_token_hash" text,
  "public_passport_token_preview" text,
  "public_passport_enabled" boolean DEFAULT false NOT NULL,
  "api_key_hash" text NOT NULL,
  "last_used_at" timestamptz,
  "key_rotated_at" timestamptz,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "agents_api_key_hash_unique" UNIQUE("api_key_hash"),
  CONSTRAINT "agents_agent_type_check" CHECK ("agent_type" IN ('native', 'connected')),
  CONSTRAINT "agents_provider_check" CHECK ("provider" IN ('custom', 'ollie', 'chatgpt', 'claude', 'gemini', 'zapier', 'make', 'langchain', 'openai', 'other')),
  CONSTRAINT "agents_connection_status_check" CHECK ("connection_status" IN ('manual', 'connected', 'disconnected')),
  CONSTRAINT "agents_status_check" CHECK ("status" IN ('active', 'disabled')),
  CONSTRAINT "agents_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id"),
  CONSTRAINT "agents_developer_user_id_developer_users_user_id_fk" FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id")
);

CREATE INDEX IF NOT EXISTS "agents_account_status_idx" ON "agents" ("account_id", "status");
CREATE INDEX IF NOT EXISTS "agents_developer_user_id_idx" ON "agents" ("developer_user_id");

-- ---------------------------------------------------------------------------
-- permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "permissions" (
  "permission_id" text PRIMARY KEY NOT NULL,
  "account_id" text,
  "developer_user_id" text,
  "agent_id" text NOT NULL,
  "action" text NOT NULL,
  "description" text,
  "resource" text,
  "scope" text,
  "allowed_actions" text[] DEFAULT '{}' NOT NULL,
  "blocked_actions" text[] DEFAULT '{}' NOT NULL,
  "requires_approval" boolean,
  "notes" text,
  "template" text,
  "constraints" jsonb,
  "status" text DEFAULT 'active' NOT NULL,
  "required_authority_level" smallint,
  "created_by" text,
  "updated_by" text,
  "last_used_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "permissions_template_check" CHECK ("template" IS NULL OR "template" IN ('access_data', 'create_content', 'schedule', 'purchase', 'custom')),
  CONSTRAINT "permissions_status_check" CHECK ("status" IN ('active', 'revoked')),
  CONSTRAINT "permissions_required_authority_level_check" CHECK ("required_authority_level" IS NULL OR ("required_authority_level" >= 0 AND "required_authority_level" <= 100)),
  CONSTRAINT "permissions_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id"),
  CONSTRAINT "permissions_developer_user_id_developer_users_user_id_fk" FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id"),
  CONSTRAINT "permissions_agent_id_agents_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("agent_id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "permissions_agent_status_idx" ON "permissions" ("agent_id", "status");
CREATE INDEX IF NOT EXISTS "permissions_account_agent_action_status_idx" ON "permissions" ("account_id", "agent_id", "action", "status");
CREATE INDEX IF NOT EXISTS "permissions_developer_user_status_idx" ON "permissions" ("developer_user_id", "status");

-- ---------------------------------------------------------------------------
-- approval_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "approval_requests" (
  "approval_id" text PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL,
  "account_id" text,
  "developer_user_id" text,
  "kind" text DEFAULT 'agent_action' NOT NULL,
  "agent_id" text,
  "permission_id" text,
  "action" text NOT NULL,
  "vendor" text,
  "amount" numeric,
  "pause_tool" text,
  "pause_repo" text,
  "pause_branch" text,
  "pause_device_id" text,
  "pause_scope" text,
  "requested_duration_minutes" integer,
  "pause_reason" text,
  "context_reason" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "resolved_by" text,
  "resolved_at" timestamptz,
  "grant_expires_at" timestamptz,
  "required_authority_level" smallint,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "approval_requests_request_id_unique" UNIQUE("request_id"),
  CONSTRAINT "approval_requests_kind_check" CHECK ("kind" IN ('agent_action', 'managed_profile_pause')),
  CONSTRAINT "approval_requests_pause_scope_check" CHECK ("pause_scope" IS NULL OR "pause_scope" IN ('current_repo', 'all')),
  CONSTRAINT "approval_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'denied', 'used')),
  CONSTRAINT "approval_requests_requested_duration_check" CHECK ("requested_duration_minutes" IS NULL OR "requested_duration_minutes" >= 1),
  CONSTRAINT "approval_requests_required_authority_level_check" CHECK ("required_authority_level" IS NULL OR ("required_authority_level" >= 0 AND "required_authority_level" <= 100)),
  CONSTRAINT "approval_requests_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id"),
  CONSTRAINT "approval_requests_developer_user_id_developer_users_user_id_fk" FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id"),
  CONSTRAINT "approval_requests_agent_id_agents_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("agent_id") ON DELETE SET NULL,
  CONSTRAINT "approval_requests_permission_id_permissions_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "permissions"("permission_id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "approval_requests_agent_permission_status_grant_idx" ON "approval_requests" ("agent_id", "permission_id", "status", "grant_expires_at");
CREATE INDEX IF NOT EXISTS "approval_requests_account_status_created_idx" ON "approval_requests" ("account_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "approval_requests_developer_status_created_idx" ON "approval_requests" ("developer_user_id", "status", "created_at" DESC);

-- Partial unique indexes for pending approval dedupe (Postgres 15+ NULLS NOT DISTINCT)
CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_agent_action_pending_uq"
  ON "approval_requests" ("agent_id", "permission_id", "action", "vendor", "amount")
  NULLS NOT DISTINCT
  WHERE "status" = 'pending' AND "kind" = 'agent_action';

CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_managed_profile_pause_pending_uq"
  ON "approval_requests" ("account_id", "developer_user_id", "pause_tool", "pause_scope", "pause_repo", "pause_device_id")
  NULLS NOT DISTINCT
  WHERE "status" = 'pending' AND "kind" = 'managed_profile_pause';

-- ---------------------------------------------------------------------------
-- verification_logs (high volume — no enforced FKs on log refs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "verification_logs" (
  "log_id" text NOT NULL,
  "request_id" text NOT NULL,
  "account_id" text,
  "developer_user_id" text,
  "agent_id" text NOT NULL,
  "permission_id" text,
  "action" text NOT NULL,
  "amount" numeric,
  "vendor" text,
  "allowed" boolean NOT NULL,
  "approval_required" boolean DEFAULT false NOT NULL,
  "reason" text NOT NULL,
  "risk" text NOT NULL,
  "metadata" jsonb,
  "shadow" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "verification_logs_pkey" PRIMARY KEY("log_id", "created_at"),
  CONSTRAINT "verification_logs_request_created_uq" UNIQUE("request_id", "created_at"),
  CONSTRAINT "verification_logs_risk_check" CHECK ("risk" IN ('low', 'medium', 'high'))
) PARTITION BY RANGE ("created_at");

CREATE INDEX IF NOT EXISTS "verification_logs_account_created_idx" ON "verification_logs" ("account_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "verification_logs_account_agent_created_idx" ON "verification_logs" ("account_id", "agent_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "verification_logs_agent_created_idx" ON "verification_logs" ("agent_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "verification_logs_allowed_idx" ON "verification_logs" ("allowed");
CREATE INDEX IF NOT EXISTS "verification_logs_developer_created_idx" ON "verification_logs" ("developer_user_id", "created_at" DESC);

-- Creates UTC calendar-month partitions around the current month. The default
-- partition remains as a fail-safe for out-of-window timestamps; the daily
-- maintenance job should normally keep all current writes out of it.
CREATE OR REPLACE FUNCTION behalf_ensure_verification_log_partitions(
  target_schema text,
  months_ahead integer DEFAULT 3,
  months_behind integer DEFAULT 13
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  parent_table regclass;
  month_start timestamptz;
  final_month timestamptz;
  partition_name text;
  created_count integer := 0;
BEGIN
  IF months_ahead < 0 OR months_ahead > 36 THEN
    RAISE EXCEPTION 'months_ahead must be between 0 and 36';
  END IF;
  IF months_behind < 0 OR months_behind > 120 THEN
    RAISE EXCEPTION 'months_behind must be between 0 and 120';
  END IF;

  parent_table := to_regclass(format('%I.verification_logs', target_schema));
  IF parent_table IS NULL THEN
    RAISE EXCEPTION 'verification_logs does not exist in schema %', target_schema;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = parent_table AND relkind = 'p'
  ) THEN
    RAISE EXCEPTION '%.verification_logs is not a partitioned table', target_schema;
  END IF;

  month_start :=
    date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    - make_interval(months => months_behind);
  final_month :=
    date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    + make_interval(months => months_ahead);

  WHILE month_start <= final_month LOOP
    partition_name := 'verification_logs_' || to_char(month_start AT TIME ZONE 'UTC', 'YYYY_MM');
    IF to_regclass(format('%I.%I', target_schema, partition_name)) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE %I.%I PARTITION OF %I.verification_logs FOR VALUES FROM (%L) TO (%L)',
        target_schema,
        partition_name,
        target_schema,
        month_start,
        month_start + interval '1 month'
      );
      created_count := created_count + 1;
    END IF;
    month_start := month_start + interval '1 month';
  END LOOP;

  RETURN created_count;
END;
$function$;

REVOKE ALL ON FUNCTION behalf_ensure_verification_log_partitions(text, integer, integer) FROM PUBLIC;

SELECT behalf_ensure_verification_log_partitions(current_schema(), 3, 13);
CREATE TABLE IF NOT EXISTS "verification_logs_default"
  PARTITION OF "verification_logs" DEFAULT;

-- Physically enforces the existing plan-derived retention policy plus a grace
-- window. Missing/deleted accounts receive the longest retention period.
CREATE OR REPLACE FUNCTION behalf_purge_verification_logs(
  target_schema text,
  batch_size integer DEFAULT 10000,
  grace_days integer DEFAULT 30,
  max_batches integer DEFAULT 100
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  parent_table regclass;
  deleted_count integer := 0;
  total_deleted bigint := 0;
  completed_batches integer := 0;
BEGIN
  IF batch_size < 1 OR batch_size > 100000 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 100000';
  END IF;
  IF grace_days < 0 OR grace_days > 365 THEN
    RAISE EXCEPTION 'grace_days must be between 0 and 365';
  END IF;
  IF max_batches < 1 OR max_batches > 1000 THEN
    RAISE EXCEPTION 'max_batches must be between 1 and 1000';
  END IF;

  parent_table := to_regclass(format('%I.verification_logs', target_schema));
  IF parent_table IS NULL THEN
    RAISE EXCEPTION 'verification_logs does not exist in schema %', target_schema;
  END IF;

  LOOP
    EXECUTE format(
      $query$
        WITH expired AS (
          SELECT logs.tableoid AS source_table, logs.ctid AS row_id
          FROM %1$I.verification_logs AS logs
          LEFT JOIN %1$I.accounts AS account
            ON account.account_id = logs.account_id
          WHERE logs.created_at < CURRENT_TIMESTAMP - (
            (
              CASE COALESCE(account.plan, 'enterprise')
                WHEN 'free' THEN 7
                WHEN 'team' THEN 30
                WHEN 'pro' THEN 90
                WHEN 'business' THEN 180
                ELSE 365
              END
              + $1
            ) * interval '1 day'
          )
          ORDER BY logs.created_at
          LIMIT $2
        )
        DELETE FROM %1$I.verification_logs AS logs
        USING expired
        WHERE logs.tableoid = expired.source_table
          AND logs.ctid = expired.row_id
      $query$,
      target_schema
    )
    USING grace_days, batch_size;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    completed_batches := completed_batches + 1;
    EXIT WHEN deleted_count < batch_size OR completed_batches >= max_batches;
  END LOOP;

  RETURN total_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION behalf_purge_verification_logs(text, integer, integer, integer) FROM PUBLIC;

-- Drops only empty monthly partitions that are wholly older than the maximum
-- supported retention window. The default partition is never selected.
CREATE OR REPLACE FUNCTION behalf_drop_expired_verification_log_partitions(
  target_schema text,
  max_retention_days integer DEFAULT 365,
  grace_days integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  partition_name text;
  partition_month date;
  has_rows boolean;
  dropped_count integer := 0;
BEGIN
  IF max_retention_days < 1 OR max_retention_days > 3650 THEN
    RAISE EXCEPTION 'max_retention_days must be between 1 and 3650';
  END IF;
  IF grace_days < 0 OR grace_days > 365 THEN
    RAISE EXCEPTION 'grace_days must be between 0 and 365';
  END IF;

  FOR partition_name IN
    SELECT child.relname
    FROM pg_inherits
    JOIN pg_class AS child ON child.oid = inhrelid
    JOIN pg_namespace AS child_namespace ON child_namespace.oid = child.relnamespace
    JOIN pg_class AS parent ON parent.oid = inhparent
    JOIN pg_namespace AS parent_namespace ON parent_namespace.oid = parent.relnamespace
    WHERE parent_namespace.nspname = target_schema
      AND child_namespace.nspname = target_schema
      AND parent.relname = 'verification_logs'
      AND child.relname ~ '^verification_logs_[0-9]{4}_[0-9]{2}$'
  LOOP
    partition_month := to_date(right(partition_name, 7), 'YYYY_MM');
    IF partition_month + interval '1 month'
      <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
        - make_interval(days => max_retention_days + grace_days)
    THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.%I LIMIT 1)',
        target_schema,
        partition_name
      ) INTO has_rows;

      IF NOT has_rows THEN
        EXECUTE format('DROP TABLE %I.%I', target_schema, partition_name);
        dropped_count := dropped_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN dropped_count;
END;
$function$;

REVOKE ALL ON FUNCTION behalf_drop_expired_verification_log_partitions(text, integer, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION behalf_run_verification_log_retention(
  target_schema text,
  batch_size integer DEFAULT 10000,
  grace_days integer DEFAULT 30,
  max_batches integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  purged_rows bigint;
  dropped_partitions integer;
BEGIN
  EXECUTE format(
    'SELECT %I.behalf_purge_verification_logs($1, $2, $3, $4)',
    target_schema
  ) INTO purged_rows USING target_schema, batch_size, grace_days, max_batches;

  EXECUTE format(
    'SELECT %I.behalf_drop_expired_verification_log_partitions($1, 365, $2)',
    target_schema
  ) INTO dropped_partitions USING target_schema, grace_days;

  RETURN jsonb_build_object(
    'purgedRows', purged_rows,
    'droppedPartitions', dropped_partitions
  );
END;
$function$;

REVOKE ALL ON FUNCTION behalf_run_verification_log_retention(text, integer, integer, integer) FROM PUBLIC;

-- Installs named pg_cron jobs when the extension is enabled. Keeping extension
-- enablement explicit avoids breaking vanilla Postgres development databases.
CREATE OR REPLACE FUNCTION behalf_schedule_verification_log_maintenance(target_schema text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  partition_job_name text := left('behalf_' || target_schema || '_verification_partitions', 63);
  retention_job_name text := left('behalf_' || target_schema || '_verification_retention', 63);
  partition_command text;
  retention_command text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN false;
  END IF;

  partition_command := format(
    'SELECT %I.behalf_ensure_verification_log_partitions(%L, 3, 0)',
    target_schema,
    target_schema
  );
  retention_command := format(
    'SELECT %I.behalf_run_verification_log_retention(%L, 10000, 30, 100)',
    target_schema,
    target_schema
  );

  EXECUTE 'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1'
    USING partition_job_name;
  EXECUTE 'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1'
    USING retention_job_name;
  EXECUTE 'SELECT cron.schedule($1, $2, $3)'
    USING partition_job_name, '15 0 * * *', partition_command;
  EXECUTE 'SELECT cron.schedule($1, $2, $3)'
    USING retention_job_name, '30 2 * * *', retention_command;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION behalf_schedule_verification_log_maintenance(text) FROM PUBLIC;

DO $block$
BEGIN
  IF current_schema() = 'public' THEN
    PERFORM behalf_schedule_verification_log_maintenance('public');
  END IF;
END;
$block$;

-- ---------------------------------------------------------------------------
-- webhook_endpoints
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
  "webhook_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "developer_user_id" text,
  "url" text NOT NULL,
  "secret_hash" text NOT NULL,
  "secret_preview" text NOT NULL,
  "events" text[] NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_triggered_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_endpoints_status_check" CHECK ("status" IN ('active', 'disabled')),
  CONSTRAINT "webhook_endpoints_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "webhook_endpoints_developer_user_id_developer_users_user_id_fk" FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id")
);

CREATE INDEX IF NOT EXISTS "webhook_endpoints_account_status_idx" ON "webhook_endpoints" ("account_id", "status");

-- ---------------------------------------------------------------------------
-- webhook_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "developer_user_id" text,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamptz DEFAULT now() NOT NULL,
  "processing_started_at" timestamptz,
  "dead_letter" boolean DEFAULT false NOT NULL,
  "last_error" text,
  "completed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_events_status_check" CHECK ("status" IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT "webhook_events_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id"),
  CONSTRAINT "webhook_events_developer_user_id_developer_users_user_id_fk" FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id")
);

CREATE INDEX IF NOT EXISTS "webhook_events_status_next_attempt_created_idx" ON "webhook_events" ("status", "next_attempt_at", "created_at");
CREATE INDEX IF NOT EXISTS "webhook_events_account_dead_letter_created_idx" ON "webhook_events" ("account_id", "dead_letter", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- managed_profile_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "managed_profile_policies" (
  "policy_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "work_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "during_hours_mode" text DEFAULT 'managed' NOT NULL,
  "outside_hours_mode" text DEFAULT 'unmanaged' NOT NULL,
  "default_mode" text DEFAULT 'unmanaged' NOT NULL,
  "tool_modes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pause_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "managed_profile_policies_account_id_unique" UNIQUE("account_id"),
  CONSTRAINT "managed_profile_policies_during_hours_mode_check" CHECK ("during_hours_mode" IN ('unmanaged', 'managed', 'required')),
  CONSTRAINT "managed_profile_policies_outside_hours_mode_check" CHECK ("outside_hours_mode" IN ('unmanaged', 'managed', 'required')),
  CONSTRAINT "managed_profile_policies_default_mode_check" CHECK ("default_mode" IN ('unmanaged', 'managed', 'required')),
  CONSTRAINT "managed_profile_policies_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- managed_profile_protected_repos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "managed_profile_protected_repos" (
  "policy_id" text NOT NULL,
  "account_id" text NOT NULL,
  "repo_hash" text NOT NULL,
  "label" text,
  "mode" text DEFAULT 'required' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  CONSTRAINT "managed_profile_protected_repos_policy_id_repo_hash_pk" PRIMARY KEY("policy_id", "repo_hash"),
  CONSTRAINT "managed_profile_protected_repos_mode_check" CHECK ("mode" IN ('unmanaged', 'managed', 'required')),
  CONSTRAINT "managed_profile_protected_repos_policy_id_managed_profile_policies_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "managed_profile_policies"("policy_id") ON DELETE CASCADE,
  CONSTRAINT "managed_profile_protected_repos_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "managed_profile_protected_repos_account_repo_uq" ON "managed_profile_protected_repos" ("account_id", "repo_hash");
CREATE INDEX IF NOT EXISTS "managed_profile_protected_repos_account_id_idx" ON "managed_profile_protected_repos" ("account_id");

-- ---------------------------------------------------------------------------
-- cli_audit_activities (Managed Profile activity feed; Mongo: CliAuditLog)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cli_audit_activities" (
  "audit_id" text PRIMARY KEY NOT NULL,
  "account_id" text,
  "user_id" text,
  "event_type" text NOT NULL,
  "tool" text,
  "repo" text,
  "branch" text,
  "mode" text,
  "granted" boolean,
  "reason" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "cli_audit_activities_event_type_check" CHECK ("event_type" IN ('cli_session_policy', 'cli_pause_grant', 'cli_pause_deny', 'cli_pause_approval_requested')),
  CONSTRAINT "cli_audit_activities_mode_check" CHECK ("mode" IS NULL OR "mode" IN ('unmanaged', 'managed', 'required'))
);

CREATE INDEX IF NOT EXISTS "cli_audit_activities_account_created_idx" ON "cli_audit_activities" ("account_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "cli_audit_activities_account_event_created_idx" ON "cli_audit_activities" ("account_id", "event_type", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security (deny-all baseline — no policies)
-- Server-side service-role connections bypass RLS. Safe while runtime uses Mongo.
-- ---------------------------------------------------------------------------
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "developer_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "developer_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "developer_api_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "managed_profile_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "managed_profile_protected_repos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cli_audit_activities" ENABLE ROW LEVEL SECURITY;
