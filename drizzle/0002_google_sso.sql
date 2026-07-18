-- Google SSO: nullable password, google_sub, auth_providers, account.sso, pending signups
ALTER TABLE "developer_users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "developer_users" ADD COLUMN IF NOT EXISTS "google_sub" text;
ALTER TABLE "developer_users" ADD COLUMN IF NOT EXISTS "auth_providers" jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS "developer_users_google_sub_uq" ON "developer_users" ("google_sub") WHERE "google_sub" IS NOT NULL;

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "sso" jsonb;

CREATE TABLE IF NOT EXISTS "oauth_pending_signups" (
  "pending_id" text PRIMARY KEY NOT NULL,
  "google_sub" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean NOT NULL,
  "first_name" text,
  "last_name" text,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauth_pending_signups_google_sub_idx" ON "oauth_pending_signups" ("google_sub");
CREATE INDEX IF NOT EXISTS "oauth_pending_signups_expires_at_idx" ON "oauth_pending_signups" ("expires_at");
