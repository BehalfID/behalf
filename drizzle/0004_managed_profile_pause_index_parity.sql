-- 0004: Managed-profile-pause pending index parity with Mongo.
-- Forward-only. Safe for existing Postgres data (drops one index, ensures another).
-- Does not switch app runtime off MongoDB and changes no application behavior.
--
-- Rationale:
--   The Mongoose ApprovalRequest model (models/ApprovalRequest.ts) does NOT enforce
--   uniqueness on the pending managed_profile_pause tuple. Its partial UNIQUE index
--   (`approval_pending_tuple_unique`) is scoped to kind = 'agent_action' only. For
--   managed_profile_pause it maintains a plain NON-unique compound index:
--     { accountId, developerUserId, kind, pauseTool, pauseScope, pauseRepo, pauseDeviceId, status }
--   Dedupe is achieved at the application layer via an atomic findOneAndUpdate upsert,
--   so Mongo PERMITS multiple pending managed_profile_pause rows sharing that tuple.
--
--   Migration 0000 shipped a stricter partial UNIQUE index
--   (`approval_requests_managed_profile_pause_pending_uq`) that REJECTS rows Mongo
--   permits. Drop it to restore Mongo parity and rely on the non-unique lookup index
--   (`approval_requests_pause_pending_lookup_idx`, first added in 0003) for the intended
--   pending-pause lookup.

-- Drop the stricter Postgres-only partial UNIQUE index.
DROP INDEX IF EXISTS "approval_requests_managed_profile_pause_pending_uq";

-- Equivalent NON-unique compound index defined by Mongo. Same columns and ordering;
-- Mongo defines no partial predicate for this index, so neither do we.
CREATE INDEX IF NOT EXISTS "approval_requests_pause_pending_lookup_idx"
  ON "approval_requests" (
    "account_id",
    "developer_user_id",
    "kind",
    "pause_tool",
    "pause_scope",
    "pause_repo",
    "pause_device_id",
    "status"
  );
