-- Passkey/WebAuthn credentials, challenge storage, and account-level
-- authentication usage metadata.
--
-- Additive and backward-compatible: existing production code that does not
-- read these columns/tables continues to operate. Apply before deploying the
-- application revision that registers or authenticates passkeys.
--
-- Do NOT edit 0007_external_identities.sql — it has already been applied.

-- Account-level last-sign-in + password last-used (unknown until first success).
ALTER TABLE "developer_users"
  ADD COLUMN IF NOT EXISTS "password_last_used_at" timestamp with time zone;
ALTER TABLE "developer_users"
  ADD COLUMN IF NOT EXISTS "last_sign_in_at" timestamp with time zone;
ALTER TABLE "developer_users"
  ADD COLUMN IF NOT EXISTS "last_sign_in_method" text;
ALTER TABLE "developer_users"
  ADD COLUMN IF NOT EXISTS "last_sign_in_user_agent" text;

ALTER TABLE "developer_users"
  DROP CONSTRAINT IF EXISTS "developer_users_last_sign_in_method_check";
ALTER TABLE "developer_users"
  ADD CONSTRAINT "developer_users_last_sign_in_method_check"
  CHECK (
    "last_sign_in_method" IS NULL
    OR "last_sign_in_method" IN ('password', 'google', 'github', 'passkey')
  );

-- WebAuthn public-key credentials (never private keys / biometrics).
CREATE TABLE IF NOT EXISTS "passkey_credentials" (
  "credential_record_id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "developer_users"("user_id") ON DELETE CASCADE,
  "credential_id" text NOT NULL,
  "public_key" text NOT NULL,
  "sign_count" integer NOT NULL DEFAULT 0,
  "transports" jsonb,
  "nickname" text NOT NULL,
  "user_handle" text NOT NULL,
  "device_type" text,
  "backed_up" boolean NOT NULL DEFAULT false,
  "aaguid" text,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "passkey_credentials_credential_id_uq"
  ON "passkey_credentials" ("credential_id");
CREATE INDEX IF NOT EXISTS "passkey_credentials_user_created_idx"
  ON "passkey_credentials" ("user_id", "created_at");

ALTER TABLE "passkey_credentials" ENABLE ROW LEVEL SECURITY;

-- Short-lived single-use WebAuthn ceremony challenges.
CREATE TABLE IF NOT EXISTS "webauthn_challenges" (
  "challenge_id" text PRIMARY KEY NOT NULL,
  "challenge_hash" text NOT NULL UNIQUE,
  "kind" text NOT NULL,
  "user_id" text REFERENCES "developer_users"("user_id") ON DELETE CASCADE,
  "consumed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "webauthn_challenges_kind_check"
    CHECK ("kind" IN ('registration', 'authentication'))
);

CREATE INDEX IF NOT EXISTS "webauthn_challenges_expires_at_idx"
  ON "webauthn_challenges" ("expires_at");
CREATE INDEX IF NOT EXISTS "webauthn_challenges_user_id_idx"
  ON "webauthn_challenges" ("user_id");

ALTER TABLE "webauthn_challenges" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION behalf_purge_expired_webauthn_challenges()
RETURNS void AS $$
BEGIN
  DELETE FROM "webauthn_challenges" WHERE "expires_at" < now();
END;
$$ LANGUAGE plpgsql;

-- Expand identity audit provider / action CHECKs for password + passkey events.
ALTER TABLE "identity_audit_logs"
  DROP CONSTRAINT IF EXISTS "identity_audit_logs_provider_check";
ALTER TABLE "identity_audit_logs"
  ADD CONSTRAINT "identity_audit_logs_provider_check"
  CHECK ("provider" IN ('github', 'google', 'password', 'passkey'));

ALTER TABLE "identity_audit_logs"
  DROP CONSTRAINT IF EXISTS "identity_audit_logs_action_check";
ALTER TABLE "identity_audit_logs"
  ADD CONSTRAINT "identity_audit_logs_action_check"
  CHECK ("action" IN (
    'identity_linked',
    'identity_unlinked',
    'identity_registered',
    'identity_login',
    'identity_link_rejected',
    'password_login',
    'passkey_registered',
    'passkey_renamed',
    'passkey_removed',
    'method_removal_rejected'
  ));
