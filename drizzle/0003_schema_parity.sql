-- Phase B′: schema parity with current Mongoose models.
-- Forward-only. Safe for existing Postgres data (additive columns/tables/indexes).
-- Does not switch app runtime off MongoDB.
--
-- Prerequisites / preflight (before applying to a populated database):
-- 1. No two pending agent_action approval_requests may share the same
--    (agent_id, permission_id, action, vendor, amount, argument_fingerprint)
--    including NULL equality (NULLS NOT DISTINCT). The prior unique index already
--    blocked collisions without fingerprint; adding fingerprint only narrows further.
-- 2. Backfill last_activity_at from created_at for existing sessions (done below).
-- 3. Application-level expiry checks remain authoritative; TTL purge functions are
--    storage hygiene only. Enable pg_cron scheduling separately (see docs).

-- ---------------------------------------------------------------------------
-- Developer sessions: last_activity_at (Mongo required + default Date.now)
-- ---------------------------------------------------------------------------
ALTER TABLE "developer_sessions"
  ADD COLUMN IF NOT EXISTS "last_activity_at" timestamptz;

UPDATE "developer_sessions"
SET "last_activity_at" = COALESCE("created_at", now())
WHERE "last_activity_at" IS NULL;

ALTER TABLE "developer_sessions"
  ALTER COLUMN "last_activity_at" SET DEFAULT now();

ALTER TABLE "developer_sessions"
  ALTER COLUMN "last_activity_at" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Approval requests: argument binding + used_at
-- ---------------------------------------------------------------------------
ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "argument_kind" text;
ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "argument_fingerprint" text;
ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "argument_preview" text;
ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "argument_preview_truncated" boolean;
ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "used_at" timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'approval_requests_argument_kind_check'
  ) THEN
    ALTER TABLE "approval_requests"
      ADD CONSTRAINT "approval_requests_argument_kind_check"
      CHECK ("argument_kind" IS NULL OR "argument_kind" IN ('command', 'file_path'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "approval_requests_argument_fingerprint_idx"
  ON "approval_requests" ("argument_fingerprint");

CREATE INDEX IF NOT EXISTS "approval_requests_grant_lookup_idx"
  ON "approval_requests" (
    "agent_id",
    "permission_id",
    "action",
    "vendor",
    "amount",
    "argument_fingerprint",
    "status",
    "grant_expires_at"
  );

CREATE INDEX IF NOT EXISTS "approval_requests_pause_pending_lookup_idx"
  ON "approval_requests" (
    "account_id",
    "developer_user_id",
    "kind",
    "pause_tool",
    "pause_scope",
    "pause_repo",
    "pause_device_id",
    "status"
  );

-- Recreate pending agent_action unique index to include argument_fingerprint
-- (mirrors Mongo approval_pending_tuple_unique).
DROP INDEX IF EXISTS "approval_requests_agent_action_pending_uq";
CREATE UNIQUE INDEX "approval_requests_agent_action_pending_uq"
  ON "approval_requests" (
    "agent_id",
    "permission_id",
    "action",
    "vendor",
    "amount",
    "argument_fingerprint"
  )
  NULLS NOT DISTINCT
  WHERE "status" = 'pending' AND "kind" = 'agent_action';

-- ---------------------------------------------------------------------------
-- device_codes (Mongo TTL on expiresAt)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "device_codes" (
  "code_id" text PRIMARY KEY NOT NULL,
  "device_code" text NOT NULL,
  "user_code" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "user_id" text,
  "session_token" text,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "device_codes_status_check" CHECK ("status" IN ('pending', 'authorized', 'denied')),
  CONSTRAINT "device_codes_user_id_developer_users_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "developer_users"("user_id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "device_codes_device_code_unique" ON "device_codes" ("device_code");
CREATE UNIQUE INDEX IF NOT EXISTS "device_codes_user_code_unique" ON "device_codes" ("user_code");
CREATE INDEX IF NOT EXISTS "device_codes_expires_at_idx" ON "device_codes" ("expires_at");

-- ---------------------------------------------------------------------------
-- permission_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "permission_profiles" (
  "profile_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "required_authority_level" smallint NOT NULL,
  "created_by" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "permission_profiles_status_check" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "permission_profiles_required_authority_level_check"
    CHECK ("required_authority_level" >= 0 AND "required_authority_level" <= 100),
  CONSTRAINT "permission_profiles_account_id_accounts_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "permission_profiles_created_by_developer_users_user_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "developer_users"("user_id")
);
CREATE INDEX IF NOT EXISTS "permission_profiles_account_id_idx" ON "permission_profiles" ("account_id");
CREATE INDEX IF NOT EXISTS "permission_profiles_required_authority_level_idx"
  ON "permission_profiles" ("required_authority_level");
CREATE INDEX IF NOT EXISTS "permission_profiles_created_by_idx" ON "permission_profiles" ("created_by");
CREATE INDEX IF NOT EXISTS "permission_profiles_status_idx" ON "permission_profiles" ("status");
CREATE INDEX IF NOT EXISTS "permission_profiles_account_name_status_idx"
  ON "permission_profiles" ("account_id", "name", "status");

-- ---------------------------------------------------------------------------
-- webhook_deliveries (log table — no enforced FKs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "delivery_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "developer_user_id" text,
  "webhook_id" text NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "status" text NOT NULL,
  "http_status" integer,
  "error" text,
  "attempt" integer DEFAULT 1 NOT NULL,
  "next_retry_at" timestamptz,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_deliveries_status_check" CHECK ("status" IN ('success', 'failed'))
);
CREATE INDEX IF NOT EXISTS "webhook_deliveries_account_id_idx" ON "webhook_deliveries" ("account_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_developer_user_id_idx"
  ON "webhook_deliveries" ("developer_user_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries" ("webhook_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_event_id_idx" ON "webhook_deliveries" ("event_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_event_type_idx" ON "webhook_deliveries" ("event_type");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_account_webhook_created_idx"
  ON "webhook_deliveries" ("account_id", "webhook_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "webhook_deliveries_developer_webhook_created_idx"
  ON "webhook_deliveries" ("developer_user_id", "webhook_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- stripe_webhook_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "processed_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- enterprise_inquiries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "enterprise_inquiries" (
  "inquiry_id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "company" text NOT NULL,
  "message" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'new' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "enterprise_inquiries_status_check" CHECK ("status" IN ('new', 'reviewed'))
);
CREATE INDEX IF NOT EXISTS "enterprise_inquiries_status_idx" ON "enterprise_inquiries" ("status");

-- ---------------------------------------------------------------------------
-- cli_pause_leases (app-level expiry only — no Mongo TTL)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cli_pause_leases" (
  "lease_id" text PRIMARY KEY NOT NULL,
  "account_id" text,
  "user_id" text,
  "device_id" text,
  "tool" text,
  "repo" text,
  "branch" text,
  "scope" text DEFAULT 'current_repo',
  "reason" text NOT NULL,
  "granted" boolean NOT NULL,
  "denied_reason" text,
  "mode" text DEFAULT 'unmanaged',
  "expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "cli_pause_leases_scope_check"
    CHECK ("scope" IS NULL OR "scope" IN ('current_repo', 'all')),
  CONSTRAINT "cli_pause_leases_mode_check"
    CHECK ("mode" IS NULL OR "mode" IN ('unmanaged', 'managed', 'required')),
  CONSTRAINT "cli_pause_leases_account_id_accounts_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE SET NULL,
  CONSTRAINT "cli_pause_leases_user_id_developer_users_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "developer_users"("user_id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "cli_pause_leases_account_id_idx" ON "cli_pause_leases" ("account_id");
CREATE INDEX IF NOT EXISTS "cli_pause_leases_user_id_idx" ON "cli_pause_leases" ("user_id");
CREATE INDEX IF NOT EXISTS "cli_pause_leases_device_id_idx" ON "cli_pause_leases" ("device_id");
CREATE INDEX IF NOT EXISTS "cli_pause_leases_expires_at_idx" ON "cli_pause_leases" ("expires_at");
CREATE INDEX IF NOT EXISTS "cli_pause_leases_account_user_expires_idx"
  ON "cli_pause_leases" ("account_id", "user_id", "expires_at");
CREATE INDEX IF NOT EXISTS "cli_pause_leases_device_expires_idx"
  ON "cli_pause_leases" ("device_id", "expires_at");

-- ---------------------------------------------------------------------------
-- Site Guard
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sites" (
  "site_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "developer_user_id" text NOT NULL,
  "name" text NOT NULL,
  "domain" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "sites_status_check" CHECK ("status" IN ('active', 'disabled')),
  CONSTRAINT "sites_account_id_accounts_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "sites_developer_user_id_developer_users_user_id_fk"
    FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sites_account_domain_uq" ON "sites" ("account_id", "domain");
CREATE INDEX IF NOT EXISTS "sites_account_id_idx" ON "sites" ("account_id");
CREATE INDEX IF NOT EXISTS "sites_developer_user_id_idx" ON "sites" ("developer_user_id");
CREATE INDEX IF NOT EXISTS "sites_domain_idx" ON "sites" ("domain");
CREATE INDEX IF NOT EXISTS "sites_status_idx" ON "sites" ("status");
CREATE INDEX IF NOT EXISTS "sites_developer_created_idx"
  ON "sites" ("developer_user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "site_access_rules" (
  "rule_id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL,
  "account_id" text NOT NULL,
  "developer_user_id" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "agent_identifier" text,
  "user_agent_pattern" text,
  "allowed_paths" text[] DEFAULT '{}'::text[] NOT NULL,
  "blocked_paths" text[] DEFAULT '{}'::text[] NOT NULL,
  "requires_approval" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "site_access_rules_status_check" CHECK ("status" IN ('active', 'disabled')),
  CONSTRAINT "site_access_rules_site_id_sites_site_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "sites"("site_id") ON DELETE CASCADE,
  CONSTRAINT "site_access_rules_account_id_accounts_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "site_access_rules_developer_user_id_developer_users_user_id_fk"
    FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id")
);
CREATE INDEX IF NOT EXISTS "site_access_rules_site_id_idx" ON "site_access_rules" ("site_id");
CREATE INDEX IF NOT EXISTS "site_access_rules_account_id_idx" ON "site_access_rules" ("account_id");
CREATE INDEX IF NOT EXISTS "site_access_rules_developer_user_id_idx"
  ON "site_access_rules" ("developer_user_id");
CREATE INDEX IF NOT EXISTS "site_access_rules_status_idx" ON "site_access_rules" ("status");
CREATE INDEX IF NOT EXISTS "site_access_rules_account_site_created_idx"
  ON "site_access_rules" ("account_id", "site_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "site_access_logs" (
  "request_id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL,
  "account_id" text NOT NULL,
  "developer_user_id" text NOT NULL,
  "rule_id" text,
  "domain" text NOT NULL,
  "path" text NOT NULL,
  "user_agent" text NOT NULL,
  "agent_identifier" text,
  "allowed" boolean NOT NULL,
  "reason" text NOT NULL,
  "risk" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "site_access_logs_risk_check" CHECK ("risk" IN ('low', 'medium', 'high'))
);
CREATE INDEX IF NOT EXISTS "site_access_logs_site_id_idx" ON "site_access_logs" ("site_id");
CREATE INDEX IF NOT EXISTS "site_access_logs_account_id_idx" ON "site_access_logs" ("account_id");
CREATE INDEX IF NOT EXISTS "site_access_logs_developer_user_id_idx"
  ON "site_access_logs" ("developer_user_id");
CREATE INDEX IF NOT EXISTS "site_access_logs_rule_id_idx" ON "site_access_logs" ("rule_id");
CREATE INDEX IF NOT EXISTS "site_access_logs_account_site_created_idx"
  ON "site_access_logs" ("account_id", "site_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "site_access_logs_developer_created_idx"
  ON "site_access_logs" ("developer_user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "site_guard_keys" (
  "key_id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL,
  "account_id" text NOT NULL,
  "developer_user_id" text NOT NULL,
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "key_preview" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_used_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "site_guard_keys_status_check" CHECK ("status" IN ('active', 'revoked')),
  CONSTRAINT "site_guard_keys_site_id_sites_site_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "sites"("site_id") ON DELETE CASCADE,
  CONSTRAINT "site_guard_keys_account_id_accounts_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "site_guard_keys_developer_user_id_developer_users_user_id_fk"
    FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "site_guard_keys_key_hash_unique" ON "site_guard_keys" ("key_hash");
CREATE INDEX IF NOT EXISTS "site_guard_keys_site_id_idx" ON "site_guard_keys" ("site_id");
CREATE INDEX IF NOT EXISTS "site_guard_keys_account_id_idx" ON "site_guard_keys" ("account_id");
CREATE INDEX IF NOT EXISTS "site_guard_keys_developer_user_id_idx"
  ON "site_guard_keys" ("developer_user_id");
CREATE INDEX IF NOT EXISTS "site_guard_keys_status_idx" ON "site_guard_keys" ("status");
CREATE INDEX IF NOT EXISTS "site_guard_keys_site_status_idx"
  ON "site_guard_keys" ("site_id", "status");
CREATE INDEX IF NOT EXISTS "site_guard_keys_account_created_idx"
  ON "site_guard_keys" ("account_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- Status page (global)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "status_components" (
  "component_id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "group" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'operational' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "status_components_status_check" CHECK (
    "status" IN ('operational', 'performance_issues', 'partial_outage', 'major_outage')
  )
);
CREATE INDEX IF NOT EXISTS "status_components_group_idx" ON "status_components" ("group");
CREATE INDEX IF NOT EXISTS "status_components_sort_order_idx" ON "status_components" ("sort_order");
CREATE INDEX IF NOT EXISTS "status_components_status_idx" ON "status_components" ("status");
CREATE INDEX IF NOT EXISTS "status_components_enabled_idx" ON "status_components" ("enabled");

CREATE TABLE IF NOT EXISTS "status_incidents" (
  "incident_id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "message" text,
  "status" text DEFAULT 'investigating' NOT NULL,
  "severity" text DEFAULT 'minor' NOT NULL,
  "component_ids" text[] DEFAULT '{}'::text[] NOT NULL,
  "updates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "status_incidents_status_check" CHECK (
    "status" IN ('investigating', 'identified', 'watching', 'fixed')
  ),
  CONSTRAINT "status_incidents_severity_check" CHECK (
    "severity" IN ('minor', 'major', 'critical')
  )
);
CREATE INDEX IF NOT EXISTS "status_incidents_status_idx" ON "status_incidents" ("status");
CREATE INDEX IF NOT EXISTS "status_incidents_severity_idx" ON "status_incidents" ("severity");

-- ---------------------------------------------------------------------------
-- RLS deny-all baseline (service role bypasses; no policies)
-- ---------------------------------------------------------------------------
ALTER TABLE "device_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permission_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enterprise_inquiries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cli_pause_leases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "site_access_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "site_access_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "site_guard_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "status_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "status_incidents" ENABLE ROW LEVEL SECURITY;

-- oauth_pending_signups may already exist from 0002; ensure RLS if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'oauth_pending_signups'
  ) THEN
    EXECUTE 'ALTER TABLE "oauth_pending_signups" ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- TTL cleanup (Mongo expireAfterSeconds: 0 on expiresAt)
-- Tables: developer_sessions, device_codes, oauth_pending_signups
-- Application expiry checks remain authoritative.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION behalf_purge_expired_developer_sessions(
  target_schema text DEFAULT 'public',
  batch_size integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  IF batch_size < 1 OR batch_size > 100000 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 100000';
  END IF;

  EXECUTE format(
    $query$
      WITH doomed AS (
        SELECT session_id FROM %1$I.developer_sessions
        WHERE expires_at < now()
        ORDER BY expires_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM %1$I.developer_sessions AS sessions
      USING doomed
      WHERE sessions.session_id = doomed.session_id
    $query$,
    target_schema
  ) USING batch_size;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION behalf_purge_expired_developer_sessions(text, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION behalf_purge_expired_device_codes(
  target_schema text DEFAULT 'public',
  batch_size integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  IF batch_size < 1 OR batch_size > 100000 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 100000';
  END IF;

  EXECUTE format(
    $query$
      WITH doomed AS (
        SELECT code_id FROM %1$I.device_codes
        WHERE expires_at < now()
        ORDER BY expires_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM %1$I.device_codes AS codes
      USING doomed
      WHERE codes.code_id = doomed.code_id
    $query$,
    target_schema
  ) USING batch_size;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION behalf_purge_expired_device_codes(text, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION behalf_purge_expired_oauth_pending_signups(
  target_schema text DEFAULT 'public',
  batch_size integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  deleted_count integer := 0;
  table_reg regclass;
BEGIN
  IF batch_size < 1 OR batch_size > 100000 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 100000';
  END IF;

  table_reg := to_regclass(format('%I.oauth_pending_signups', target_schema));
  IF table_reg IS NULL THEN
    RETURN 0;
  END IF;

  EXECUTE format(
    $query$
      WITH doomed AS (
        SELECT pending_id FROM %1$I.oauth_pending_signups
        WHERE expires_at < now()
        ORDER BY expires_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM %1$I.oauth_pending_signups AS pending
      USING doomed
      WHERE pending.pending_id = doomed.pending_id
    $query$,
    target_schema
  ) USING batch_size;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION behalf_purge_expired_oauth_pending_signups(text, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION behalf_run_ttl_cleanup(
  target_schema text DEFAULT 'public',
  batch_size integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  sessions_deleted integer;
  device_codes_deleted integer;
  oauth_deleted integer;
BEGIN
  EXECUTE format(
    'SELECT %I.behalf_purge_expired_developer_sessions(%L, $1)',
    target_schema,
    target_schema
  ) INTO sessions_deleted USING batch_size;
  EXECUTE format(
    'SELECT %I.behalf_purge_expired_device_codes(%L, $1)',
    target_schema,
    target_schema
  ) INTO device_codes_deleted USING batch_size;
  EXECUTE format(
    'SELECT %I.behalf_purge_expired_oauth_pending_signups(%L, $1)',
    target_schema,
    target_schema
  ) INTO oauth_deleted USING batch_size;

  RETURN jsonb_build_object(
    'developerSessions', COALESCE(sessions_deleted, 0),
    'deviceCodes', COALESCE(device_codes_deleted, 0),
    'oauthPendingSignups', COALESCE(oauth_deleted, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION behalf_run_ttl_cleanup(text, integer) FROM PUBLIC;

-- Returns true when pg_cron job was scheduled; false when extension unavailable.
-- Operators must enable the pg_cron extension before calling this in production.
CREATE OR REPLACE FUNCTION behalf_schedule_ttl_cleanup(target_schema text DEFAULT 'public')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  job_name text := left('behalf_' || target_schema || '_ttl_cleanup', 63);
  cleanup_command text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN false;
  END IF;

  cleanup_command := format(
    'SELECT %I.behalf_run_ttl_cleanup(%L, 1000)',
    target_schema,
    target_schema
  );

  EXECUTE 'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1'
    USING job_name;
  EXECUTE 'SELECT cron.schedule($1, $2, $3)'
    USING job_name, '*/15 * * * *', cleanup_command;

  RETURN true;
EXCEPTION
  WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
    RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION behalf_schedule_ttl_cleanup(text) FROM PUBLIC;
