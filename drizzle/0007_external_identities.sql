-- External login identities, server-side OAuth authorization state, and
-- durable identity audit history.
--
-- Replaces the "one nullable provider column per provider on developer_users"
-- pattern (google_sub) with a provider-neutral link table. google_sub stays in
-- place and is backfilled here so the Google flow keeps working during rollout;
-- it becomes read-only legacy once Google reads move to external_identities.

CREATE TABLE IF NOT EXISTS "external_identities" (
  "identity_id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "developer_users"("user_id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "provider_username" text,
  "provider_email" text,
  "provider_email_verified" boolean DEFAULT false NOT NULL,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "external_identities_provider_check" CHECK ("provider" IN ('github', 'google'))
);

-- One provider account belongs to at most one BehalfID user. This is what makes
-- "reject sign-in when the identity is linked to a different account" a storage
-- guarantee rather than an application-code convention.
CREATE UNIQUE INDEX IF NOT EXISTS "external_identities_provider_account_uq"
  ON "external_identities" ("provider", "provider_account_id");
-- A user holds at most one identity per provider.
CREATE UNIQUE INDEX IF NOT EXISTS "external_identities_user_provider_uq"
  ON "external_identities" ("user_id", "provider");

ALTER TABLE "external_identities" ENABLE ROW LEVEL SECURITY;

-- Backfill existing Google links so external_identities is authoritative.
INSERT INTO "external_identities" (
  "identity_id", "user_id", "provider", "provider_account_id",
  "provider_email", "provider_email_verified", "linked_at"
)
SELECT
  'extid_' || replace(gen_random_uuid()::text, '-', ''),
  "user_id",
  'google',
  "google_sub",
  "email",
  true,
  COALESCE("created_at", now())
FROM "developer_users"
WHERE "google_sub" IS NOT NULL
ON CONFLICT DO NOTHING;

-- In-flight OAuth authorization requests. The PKCE verifier stays here rather
-- than inside the state string so it is never exposed to the browser, the
-- provider, or referrer/proxy logs.
CREATE TABLE IF NOT EXISTS "oauth_authorization_states" (
  "state_id" text PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "mode" text NOT NULL,
  "state_hash" text NOT NULL UNIQUE,
  "code_verifier" text NOT NULL,
  "next" text,
  "user_id" text REFERENCES "developer_users"("user_id") ON DELETE CASCADE,
  "consumed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "oauth_authorization_states_provider_check" CHECK ("provider" IN ('github', 'google')),
  CONSTRAINT "oauth_authorization_states_mode_check" CHECK ("mode" IN ('login', 'signup', 'link'))
);

CREATE INDEX IF NOT EXISTS "oauth_authorization_states_expires_at_idx"
  ON "oauth_authorization_states" ("expires_at");

ALTER TABLE "oauth_authorization_states" ENABLE ROW LEVEL SECURITY;

-- Durable, user-attributed identity lifecycle history. Deliberately separate
-- from auth_events, which is short-lived IP-hashed brute-force telemetry.
CREATE TABLE IF NOT EXISTS "identity_audit_logs" (
  "entry_id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "action" text NOT NULL,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "provider_username" text,
  "ip_hash" text,
  "context" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "identity_audit_logs_action_check" CHECK ("action" IN (
    'identity_linked', 'identity_unlinked', 'identity_registered',
    'identity_login', 'identity_link_rejected'
  )),
  CONSTRAINT "identity_audit_logs_provider_check" CHECK ("provider" IN ('github', 'google'))
);

CREATE INDEX IF NOT EXISTS "identity_audit_logs_user_created_idx"
  ON "identity_audit_logs" ("user_id", "created_at");

ALTER TABLE "identity_audit_logs" ENABLE ROW LEVEL SECURITY;

-- Pending OAuth signups become provider-neutral. google_sub stays populated for
-- Google so rows created before this migration still resolve.
ALTER TABLE "oauth_pending_signups" ALTER COLUMN "google_sub" DROP NOT NULL;
ALTER TABLE "oauth_pending_signups"
  ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'google' NOT NULL;
ALTER TABLE "oauth_pending_signups"
  ADD COLUMN IF NOT EXISTS "provider_account_id" text;
UPDATE "oauth_pending_signups"
  SET "provider_account_id" = "google_sub"
  WHERE "provider_account_id" IS NULL AND "google_sub" IS NOT NULL;
ALTER TABLE "oauth_pending_signups"
  DROP CONSTRAINT IF EXISTS "oauth_pending_signups_provider_check";
ALTER TABLE "oauth_pending_signups"
  ADD CONSTRAINT "oauth_pending_signups_provider_check"
  CHECK ("provider" IN ('github', 'google'));
CREATE INDEX IF NOT EXISTS "oauth_pending_signups_provider_account_idx"
  ON "oauth_pending_signups" ("provider", "provider_account_id");

-- Mongo expires authorization states with a TTL index; Postgres needs the same
-- sweep registered alongside the other TTL collections from 0003.
CREATE OR REPLACE FUNCTION behalf_purge_expired_oauth_authorization_states()
RETURNS void AS $$
BEGIN
  DELETE FROM "oauth_authorization_states" WHERE "expires_at" < now();
END;
$$ LANGUAGE plpgsql;
