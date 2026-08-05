-- Complimentary plan grants.
--
-- Every Stripe webhook branch ends in an unconditional write to accounts.plan
-- ("free" on cancellation, on a failed invoice, and on any non-active
-- subscription status). A comp stored in accounts.plan is therefore one webhook
-- away from silent erasure. These columns are never written by billing code, so
-- the grant survives any subscription lifecycle event, and account_plan_grants
-- records how the current state was reached.

ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "complimentary_plan" text;
ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "complimentary_plan_reason" text;
ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "complimentary_plan_granted_by" text;
ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "complimentary_plan_granted_at" timestamp with time zone;
ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "complimentary_plan_expires_at" timestamp with time zone;

-- "free" is not grantable: a grant exists to raise entitlements above billing,
-- so granting "free" would be a no-op that still read as an active comp.
ALTER TABLE "accounts"
  DROP CONSTRAINT IF EXISTS "accounts_complimentary_plan_check";
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_complimentary_plan_check"
  CHECK ("complimentary_plan" IS NULL OR "complimentary_plan" IN ('pro', 'team', 'business', 'enterprise'));

-- An expiry, reason or grantor without a plan is an orphaned half-grant: it
-- reads as "this workspace was comped" while granting nothing.
ALTER TABLE "accounts"
  DROP CONSTRAINT IF EXISTS "accounts_complimentary_plan_coherent";
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_complimentary_plan_coherent"
  CHECK (
    "complimentary_plan" IS NOT NULL
    OR (
      "complimentary_plan_expires_at" IS NULL
      AND "complimentary_plan_reason" IS NULL
      AND "complimentary_plan_granted_by" IS NULL
      AND "complimentary_plan_granted_at" IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS "accounts_complimentary_plan_idx"
  ON "accounts" ("complimentary_plan")
  WHERE "complimentary_plan" IS NOT NULL;

-- Append-only ledger. Rows are never updated or deleted: a revocation is a new
-- row, so who comped a workspace, when, why and on whose authority survives the
-- revocation. billing_plan_at_change captures the Stripe-owned plan at the time,
-- which is what lets a comp be told apart from a paid upgrade after the fact.
CREATE TABLE IF NOT EXISTS "account_plan_grants" (
  "grant_id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "action" text NOT NULL,
  "plan" text,
  "previous_plan" text,
  "billing_plan_at_change" text NOT NULL,
  "reason" text NOT NULL,
  "expires_at" timestamp with time zone,
  "actor" text NOT NULL,
  "actor_type" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "account_plan_grants_account_id_accounts_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE CASCADE,
  CONSTRAINT "account_plan_grants_action_check"
    CHECK ("action" IN ('grant', 'revoke')),
  CONSTRAINT "account_plan_grants_actor_type_check"
    CHECK ("actor_type" IN ('console_admin', 'operator_script')),
  CONSTRAINT "account_plan_grants_plan_check"
    CHECK ("plan" IS NULL OR "plan" IN ('pro', 'team', 'business', 'enterprise')),
  CONSTRAINT "account_plan_grants_previous_plan_check"
    CHECK ("previous_plan" IS NULL OR "previous_plan" IN ('pro', 'team', 'business', 'enterprise')),
  CONSTRAINT "account_plan_grants_billing_plan_check"
    CHECK ("billing_plan_at_change" IN ('free', 'pro', 'team', 'business', 'enterprise')),
  CONSTRAINT "account_plan_grants_grant_has_plan"
    CHECK ("action" <> 'grant' OR "plan" IS NOT NULL),
  CONSTRAINT "account_plan_grants_reason_length"
    CHECK (length("reason") BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS "account_plan_grants_account_created_idx"
  ON "account_plan_grants" ("account_id", "created_at");
CREATE INDEX IF NOT EXISTS "account_plan_grants_created_at_idx"
  ON "account_plan_grants" ("created_at");

ALTER TABLE "account_plan_grants" ENABLE ROW LEVEL SECURITY;
