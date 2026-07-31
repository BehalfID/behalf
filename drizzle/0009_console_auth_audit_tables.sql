-- Auth events, console admins, admin audit, permission replacement audit
-- (domains previously Mongo-only; required for Postgres cutover).

CREATE TABLE IF NOT EXISTS "auth_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "surface" text NOT NULL,
  "outcome" text DEFAULT 'failure' NOT NULL,
  "reason" text NOT NULL,
  "ip_hash" text NOT NULL,
  "identity_hint" text,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_events_created_at_idx" ON "auth_events" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_events_expires_at_idx" ON "auth_events" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_events_surface_idx" ON "auth_events" ("surface");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "console_admins" (
  "admin_id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'owner' NOT NULL,
  "last_login_at" timestamptz,
  "disabled_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "console_admins_email_uq" ON "console_admins" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "console_admins_disabled_at_idx" ON "console_admins" ("disabled_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "entry_id" text PRIMARY KEY NOT NULL,
  "admin_id" text NOT NULL,
  "action" text NOT NULL,
  "target" text,
  "request_id" text,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_at_idx" ON "admin_audit_logs" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_logs_admin_id_idx" ON "admin_audit_logs" ("admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx" ON "admin_audit_logs" ("action");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "permission_replacement_audits" (
  "event_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "actor_user_id" text NOT NULL,
  "type" text NOT NULL,
  "old_permission_id" text NOT NULL,
  "replacement_permission_id" text,
  "idempotency_key" text,
  "reason" text,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "permission_replacement_audits_account_created_idx"
  ON "permission_replacement_audits" ("account_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "permission_replacement_audits_old_permission_idx"
  ON "permission_replacement_audits" ("old_permission_id");
