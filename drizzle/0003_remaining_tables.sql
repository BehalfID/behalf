-- Remaining Mongo models → Postgres (PR B follow-up).
-- Also enables RLS on oauth_pending_signups (omitted from 0002).

-- ---------------------------------------------------------------------------
-- device_codes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "device_codes" (
  "code_id" text PRIMARY KEY NOT NULL,
  "device_code" text NOT NULL UNIQUE,
  "user_code" text NOT NULL UNIQUE,
  "status" text DEFAULT 'pending' NOT NULL,
  "user_id" text,
  "session_token" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "device_codes_status_check" CHECK ("status" IN ('pending', 'authorized', 'denied')),
  CONSTRAINT "device_codes_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "developer_users"("user_id") ON DELETE SET NULL
);
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
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "permission_profiles_status_check" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "permission_profiles_required_authority_level_check" CHECK ("required_authority_level" >= 0 AND "required_authority_level" <= 100),
  CONSTRAINT "permission_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "permission_profiles_account_status_idx" ON "permission_profiles" ("account_id", "status");

-- ---------------------------------------------------------------------------
-- webhook_deliveries (log table — logical refs only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "delivery_id" text PRIMARY KEY NOT NULL,
  "account_id" text,
  "developer_user_id" text,
  "webhook_id" text NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "status" text NOT NULL,
  "http_status" integer,
  "error" text,
  "attempt" integer DEFAULT 1 NOT NULL,
  "next_retry_at" timestamp with time zone,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_deliveries_status_check" CHECK ("status" IN ('success', 'failed'))
);
CREATE INDEX IF NOT EXISTS "webhook_deliveries_account_webhook_created_idx" ON "webhook_deliveries" ("account_id", "webhook_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "webhook_deliveries_event_id_idx" ON "webhook_deliveries" ("event_id");

-- ---------------------------------------------------------------------------
-- stripe_webhook_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "enterprise_inquiries_status_check" CHECK ("status" IN ('new', 'reviewed'))
);
CREATE INDEX IF NOT EXISTS "enterprise_inquiries_status_idx" ON "enterprise_inquiries" ("status");

-- ---------------------------------------------------------------------------
-- cli_pause_leases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cli_pause_leases" (
  "lease_id" text PRIMARY KEY NOT NULL,
  "account_id" text,
  "user_id" text,
  "device_id" text,
  "tool" text,
  "repo" text,
  "branch" text,
  "scope" text DEFAULT 'current_repo' NOT NULL,
  "reason" text NOT NULL,
  "granted" boolean NOT NULL,
  "denied_reason" text,
  "mode" text DEFAULT 'unmanaged' NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cli_pause_leases_scope_check" CHECK ("scope" IN ('current_repo', 'all')),
  CONSTRAINT "cli_pause_leases_mode_check" CHECK ("mode" IN ('unmanaged', 'managed', 'required')),
  CONSTRAINT "cli_pause_leases_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "cli_pause_leases_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "developer_users"("user_id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "cli_pause_leases_account_user_expires_idx" ON "cli_pause_leases" ("account_id", "user_id", "expires_at");
CREATE INDEX IF NOT EXISTS "cli_pause_leases_device_expires_idx" ON "cli_pause_leases" ("device_id", "expires_at");

-- ---------------------------------------------------------------------------
-- sites / site_access_rules / site_access_logs / site_guard_keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sites" (
  "site_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "developer_user_id" text NOT NULL,
  "name" text NOT NULL,
  "domain" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sites_status_check" CHECK ("status" IN ('active', 'disabled')),
  CONSTRAINT "sites_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "sites_developer_user_id_fk" FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sites_account_domain_uq" ON "sites" ("account_id", "domain");
CREATE INDEX IF NOT EXISTS "sites_developer_created_idx" ON "sites" ("developer_user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "site_access_rules" (
  "rule_id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL,
  "account_id" text NOT NULL,
  "developer_user_id" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "agent_identifier" text,
  "user_agent_pattern" text,
  "allowed_paths" text[] DEFAULT '{}' NOT NULL,
  "blocked_paths" text[] DEFAULT '{}' NOT NULL,
  "requires_approval" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "site_access_rules_status_check" CHECK ("status" IN ('active', 'disabled')),
  CONSTRAINT "site_access_rules_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "sites"("site_id") ON DELETE CASCADE,
  CONSTRAINT "site_access_rules_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "site_access_rules_developer_user_id_fk" FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id")
);
CREATE INDEX IF NOT EXISTS "site_access_rules_site_status_idx" ON "site_access_rules" ("site_id", "status");
CREATE INDEX IF NOT EXISTS "site_access_rules_account_site_created_idx" ON "site_access_rules" ("account_id", "site_id", "created_at" DESC);

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
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "site_access_logs_risk_check" CHECK ("risk" IN ('low', 'medium', 'high'))
);
CREATE INDEX IF NOT EXISTS "site_access_logs_account_site_created_idx" ON "site_access_logs" ("account_id", "site_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "site_access_logs_developer_created_idx" ON "site_access_logs" ("developer_user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "site_guard_keys" (
  "key_id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL,
  "account_id" text NOT NULL,
  "developer_user_id" text NOT NULL,
  "name" text NOT NULL,
  "key_hash" text NOT NULL UNIQUE,
  "key_preview" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "site_guard_keys_status_check" CHECK ("status" IN ('active', 'revoked')),
  CONSTRAINT "site_guard_keys_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "sites"("site_id") ON DELETE CASCADE,
  CONSTRAINT "site_guard_keys_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "site_guard_keys_developer_user_id_fk" FOREIGN KEY ("developer_user_id") REFERENCES "developer_users"("user_id")
);
CREATE INDEX IF NOT EXISTS "site_guard_keys_site_status_idx" ON "site_guard_keys" ("site_id", "status");
CREATE INDEX IF NOT EXISTS "site_guard_keys_account_created_idx" ON "site_guard_keys" ("account_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- status_components / status_incidents (global, not tenant-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "status_components" (
  "component_id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "group" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'operational' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "status_components_status_check" CHECK ("status" IN ('operational', 'performance_issues', 'partial_outage', 'major_outage'))
);
CREATE INDEX IF NOT EXISTS "status_components_group_idx" ON "status_components" ("group");
CREATE INDEX IF NOT EXISTS "status_components_sort_order_idx" ON "status_components" ("sort_order");
CREATE INDEX IF NOT EXISTS "status_components_enabled_idx" ON "status_components" ("enabled");

CREATE TABLE IF NOT EXISTS "status_incidents" (
  "incident_id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "message" text,
  "status" text DEFAULT 'investigating' NOT NULL,
  "severity" text DEFAULT 'minor' NOT NULL,
  "component_ids" text[] DEFAULT '{}' NOT NULL,
  "updates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "status_incidents_status_check" CHECK ("status" IN ('investigating', 'identified', 'watching', 'fixed')),
  CONSTRAINT "status_incidents_severity_check" CHECK ("severity" IN ('minor', 'major', 'critical'))
);
CREATE INDEX IF NOT EXISTS "status_incidents_status_idx" ON "status_incidents" ("status");
CREATE INDEX IF NOT EXISTS "status_incidents_severity_idx" ON "status_incidents" ("severity");

-- ---------------------------------------------------------------------------
-- Row Level Security (deny-all baseline — no policies)
-- ---------------------------------------------------------------------------
ALTER TABLE "oauth_pending_signups" ENABLE ROW LEVEL SECURITY;
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
