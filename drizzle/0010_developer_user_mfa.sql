-- MFA fields on developer_users (Mongo DeveloperUser parity).
-- Required for TOTP enrollment, verification, and backup codes under Postgres.

ALTER TABLE "developer_users"
  ADD COLUMN IF NOT EXISTS "mfa_totp_secret_enc" text;
ALTER TABLE "developer_users"
  ADD COLUMN IF NOT EXISTS "mfa_totp_pending_secret_enc" text;
ALTER TABLE "developer_users"
  ADD COLUMN IF NOT EXISTS "mfa_enabled_at" timestamp with time zone;
ALTER TABLE "developer_users"
  ADD COLUMN IF NOT EXISTS "mfa_backup_code_hashes" jsonb;
