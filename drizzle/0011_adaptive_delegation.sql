-- Adaptive Delegation recommendations + advisory lifecycle events.
-- JSONB columns hold nested proposal/evidence payloads (Mongo subdocument parity).

CREATE TABLE IF NOT EXISTS "adaptive_delegation_recommendations" (
  "recommendation_id" text PRIMARY KEY,
  "account_id" text NOT NULL REFERENCES "accounts"("account_id"),
  "agent_id" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'reusable_permission',
  "status" text NOT NULL DEFAULT 'active',
  "action" text NOT NULL,
  "resource" text,
  "confidence" integer NOT NULL,
  "explanation" text NOT NULL,
  "factors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "evidence" jsonb NOT NULL,
  "proposed_permission" jsonb,
  "proposed_trust_profile" jsonb,
  "proposed_org_delegation" jsonb,
  "affected_tools" text[] NOT NULL DEFAULT '{}'::text[],
  "affected_resources" text[] NOT NULL DEFAULT '{}'::text[],
  "estimated_approval_reduction" integer NOT NULL DEFAULT 0,
  "security_impact" jsonb NOT NULL,
  "rollback_instructions" text NOT NULL,
  "fingerprint" text NOT NULL,
  "dismiss_reason" text,
  "remind_at" timestamp with time zone,
  "accepted_permission_id" text,
  "accepted_profile_id" text,
  "accepted_agent_ids" text[],
  "accepted_by" text,
  "dismissed_by" text,
  "viewed_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "adaptive_delegation_recommendations_kind_check"
    CHECK ("kind" IN ('reusable_permission', 'trust_profile', 'context_scoped_permission', 'organization_delegation')),
  CONSTRAINT "adaptive_delegation_recommendations_status_check"
    CHECK ("status" IN ('active', 'postponed', 'accepted', 'dismissed', 'superseded')),
  CONSTRAINT "adaptive_delegation_recommendations_dismiss_reason_check"
    CHECK ("dismiss_reason" IS NULL OR "dismiss_reason" IN ('keep_manual', 'never_suggest'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "adaptive_delegation_recommendations_account_fingerprint_uq"
  ON "adaptive_delegation_recommendations" ("account_id", "fingerprint");
CREATE INDEX IF NOT EXISTS "adaptive_delegation_rec_account_status_conf_idx"
  ON "adaptive_delegation_recommendations" ("account_id", "status", "confidence" DESC);
CREATE INDEX IF NOT EXISTS "adaptive_delegation_recommendations_agent_idx"
  ON "adaptive_delegation_recommendations" ("agent_id");
ALTER TABLE "adaptive_delegation_recommendations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "adaptive_delegation_events" (
  "event_id" text PRIMARY KEY,
  "account_id" text NOT NULL REFERENCES "accounts"("account_id"),
  "recommendation_id" text NOT NULL,
  "actor_user_id" text,
  "type" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "adaptive_delegation_events_type_check"
    CHECK ("type" IN (
      'recommendation_generated',
      'recommendation_viewed',
      'recommendation_accepted',
      'recommendation_dismissed',
      'recommendation_postponed'
    ))
);

CREATE INDEX IF NOT EXISTS "adaptive_delegation_events_account_created_idx"
  ON "adaptive_delegation_events" ("account_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "adaptive_delegation_events_recommendation_created_idx"
  ON "adaptive_delegation_events" ("recommendation_id", "created_at" DESC);
ALTER TABLE "adaptive_delegation_events" ENABLE ROW LEVEL SECURITY;
