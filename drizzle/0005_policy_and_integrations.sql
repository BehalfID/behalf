-- Phase B′ continuation: policy documents + collaboration integrations.
-- Forward-only. Safe for existing Postgres data (additive tables/indexes).
-- Does not switch app runtime off MongoDB.
--
-- Mirrors models/PolicyDocument.ts and models/IntegrationBinding.ts
-- (including CollaborationMessageRef).

-- ---------------------------------------------------------------------------
-- policy_documents (one active document per account)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "policy_documents" (
  "policy_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "name" text,
  "version" integer DEFAULT 1 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_by" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "policy_documents_version_check" CHECK ("version" >= 1),
  CONSTRAINT "policy_documents_account_id_accounts_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "policy_documents_account_id_unique"
  ON "policy_documents" ("account_id");
CREATE INDEX IF NOT EXISTS "policy_documents_enabled_idx"
  ON "policy_documents" ("enabled");
CREATE INDEX IF NOT EXISTS "policy_documents_updated_by_idx"
  ON "policy_documents" ("updated_by");
CREATE INDEX IF NOT EXISTS "policy_documents_account_enabled_idx"
  ON "policy_documents" ("account_id", "enabled");

-- ---------------------------------------------------------------------------
-- integration_bindings (Slack workspace/channel bindings)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "integration_bindings" (
  "binding_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "team_id" text NOT NULL,
  "team_name" text,
  "channel_id" text NOT NULL,
  "channel_name" text,
  "bot_token" text NOT NULL,
  "signing_secret" text NOT NULL,
  "identity_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "integration_bindings_provider_check"
    CHECK ("provider" IN ('slack')),
  CONSTRAINT "integration_bindings_status_check"
    CHECK ("status" IN ('active', 'disabled')),
  CONSTRAINT "integration_bindings_account_id_accounts_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "integration_bindings_account_provider_team_channel_uq"
  ON "integration_bindings" ("account_id", "provider", "team_id", "channel_id");
CREATE INDEX IF NOT EXISTS "integration_bindings_account_id_idx"
  ON "integration_bindings" ("account_id");
CREATE INDEX IF NOT EXISTS "integration_bindings_provider_idx"
  ON "integration_bindings" ("provider");
CREATE INDEX IF NOT EXISTS "integration_bindings_status_idx"
  ON "integration_bindings" ("status");
CREATE INDEX IF NOT EXISTS "integration_bindings_team_id_idx"
  ON "integration_bindings" ("team_id");
CREATE INDEX IF NOT EXISTS "integration_bindings_created_by_idx"
  ON "integration_bindings" ("created_by");
CREATE INDEX IF NOT EXISTS "integration_bindings_account_provider_status_idx"
  ON "integration_bindings" ("account_id", "provider", "status");

-- ---------------------------------------------------------------------------
-- collaboration_message_refs (outbound message lifecycle tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "collaboration_message_refs" (
  "ref_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider" text NOT NULL,
  "binding_id" text NOT NULL,
  "approval_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "message_ts" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "collaboration_message_refs_provider_check"
    CHECK ("provider" IN ('slack')),
  CONSTRAINT "collaboration_message_refs_status_check"
    CHECK ("status" IN ('pending', 'approved', 'denied', 'used'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "collaboration_message_refs_account_approval_provider_uq"
  ON "collaboration_message_refs" ("account_id", "approval_id", "provider");
CREATE INDEX IF NOT EXISTS "collaboration_message_refs_account_id_idx"
  ON "collaboration_message_refs" ("account_id");
CREATE INDEX IF NOT EXISTS "collaboration_message_refs_provider_idx"
  ON "collaboration_message_refs" ("provider");
CREATE INDEX IF NOT EXISTS "collaboration_message_refs_binding_id_idx"
  ON "collaboration_message_refs" ("binding_id");
CREATE INDEX IF NOT EXISTS "collaboration_message_refs_approval_id_idx"
  ON "collaboration_message_refs" ("approval_id");
CREATE INDEX IF NOT EXISTS "collaboration_message_refs_status_idx"
  ON "collaboration_message_refs" ("status");

-- ---------------------------------------------------------------------------
-- RLS deny-all baseline (service role bypasses; no policies)
-- ---------------------------------------------------------------------------
ALTER TABLE "policy_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_bindings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collaboration_message_refs" ENABLE ROW LEVEL SECURITY;
