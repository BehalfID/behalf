-- Purpose-bound recent-authentication proofs + OAuth reauth mode + audit actions.
-- Applied via operator-controlled migration (not auto-applied by this hotfix).

CREATE TABLE IF NOT EXISTS "reauth_proofs" (
  "proof_id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "developer_users"("user_id") ON DELETE CASCADE,
  "purpose" text NOT NULL,
  "method" text NOT NULL,
  "proof_hash" text NOT NULL,
  "session_id" text,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reauth_proofs_purpose_check" CHECK ("purpose" IN ('account_delete')),
  CONSTRAINT "reauth_proofs_method_check" CHECK ("method" IN ('password', 'github', 'google', 'passkey')),
  CONSTRAINT "reauth_proofs_proof_hash_uq" UNIQUE ("proof_hash")
);

CREATE INDEX IF NOT EXISTS "reauth_proofs_user_expires_idx"
  ON "reauth_proofs" ("user_id", "expires_at");

ALTER TABLE "oauth_authorization_states"
  DROP CONSTRAINT IF EXISTS "oauth_authorization_states_mode_check";
ALTER TABLE "oauth_authorization_states"
  ADD CONSTRAINT "oauth_authorization_states_mode_check"
  CHECK ("mode" IN ('login', 'signup', 'link', 'reauth'));

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
    'method_removal_rejected',
    'account_deletion_reauth_started',
    'account_deletion_reauth_succeeded',
    'account_deletion_reauth_failed',
    'account_deletion_completed',
    'account_deletion_blocked'
  ));
