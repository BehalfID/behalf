-- Approval request parity with Mongo: argument binding + used_at consumption timestamp.
-- Rebuilds the agent_action pending unique index to include argument_fingerprint.

ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "argument_kind" text;
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "argument_fingerprint" text;
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "argument_preview" text;
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "argument_preview_truncated" boolean;
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "used_at" timestamp with time zone;

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

DROP INDEX IF EXISTS "approval_requests_agent_action_pending_uq";

CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_agent_action_pending_uq"
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
