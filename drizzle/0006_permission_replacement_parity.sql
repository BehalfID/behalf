-- Phase 4: permission replacement fields + inactive status (Mongo Permission parity).
-- Fail-closed replacement staging uses status='inactive' and audit/idempotency columns.

ALTER TABLE "permissions" DROP CONSTRAINT IF EXISTS "permissions_status_check";--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_status_check" CHECK ("status" IN ('active', 'revoked', 'inactive'));--> statement-breakpoint

ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "replaces_permission_id" text;--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "replaced_by_permission_id" text;--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "replacement_idempotency_key" text;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "permissions_replaces_permission_id_idx" ON "permissions" ("replaces_permission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "permissions_replaced_by_permission_id_idx" ON "permissions" ("replaced_by_permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "permissions_account_replacement_idempotency_uq"
  ON "permissions" ("account_id", "replacement_idempotency_key")
  WHERE "replacement_idempotency_key" IS NOT NULL;--> statement-breakpoint
