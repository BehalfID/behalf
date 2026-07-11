import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * An ApprovalRequest is created when a verify() call passes all hard policy
 * constraints but hits a permission with requiresApproval: true and no
 * approved grant exists for the exact request tuple
 * (agentId, permissionId, action, vendor, amount[, argumentFingerprint]).
 *
 * For execute_command / read_file / write_file, the tuple also includes a
 * deterministic SHA-256 argumentFingerprint of the canonical command or file
 * path. Grants without a fingerprint cannot authorize those actions.
 *
 * Lifecycle:
 *   pending  → approved (human approves in dashboard, grantExpiresAt set to +30min;
 *                        resolvedAt records approval time)
 *   pending  → denied   (human denies in dashboard)
 *   approved → used     (agent calls verify() again within the grant window
 *                        with the SAME tuple; action allowed; usedAt records
 *                        consumption time — distinct from resolvedAt)
 *
 * Scoping: an approved grant is only valid for the exact action, vendor,
 * amount, and argumentFingerprint (when present) stored on this document.
 * It satisfies only the requiresApproval gate; it never overrides blocked
 * actions, allowedActions narrowing, revoked or expired permissions, disabled
 * agents, maxAmount, allowedVendors, or resource matching — those are
 * re-evaluated on every verify() call before the approval gate is consulted.
 *
 * Multiple verify() calls while pending do NOT create duplicate records for
 * the same request tuple. The upsert in verifyAction uses findOneAndUpdate
 * with the tuple in the filter and $setOnInsert for insert-only fields, plus
 * a partial unique index on the pending tuple.
 */
const ApprovalRequestSchema = new Schema(
  {
    approvalId: { type: String, required: true, unique: true, index: true },
    // requestId from the original verify() call that triggered this request
    requestId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, index: true },
    developerUserId: { type: String, index: true },
    /** agent_action (default) or managed_profile_pause for CLI pause in required mode. */
    kind: {
      type: String,
      enum: ["agent_action", "managed_profile_pause"],
      default: "agent_action",
      index: true,
    },
    agentId: { type: String, index: true },
    // The permission that requires approval (agent_action only)
    permissionId: { type: String, index: true },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    vendor: { type: String, trim: true, maxlength: 200 },
    amount: { type: Number },
    /**
     * Bound approval target for agent_action execute_command / read_file / write_file.
     * Not used for managed_profile_pause or generic action/vendor/amount approvals.
     */
    argumentKind: {
      type: String,
      enum: ["command", "file_path"],
      maxlength: 16
    },
    /** SHA-256 hex digest of the versioned canonical approval intent. */
    argumentFingerprint: { type: String, maxlength: 64, index: true },
    /** Bounded, best-effort-redacted preview for Action Inbox display. */
    argumentPreview: { type: String, maxlength: 500 },
    argumentPreviewTruncated: { type: Boolean },
    /** CLI pause approval — tool (claude, codex, cursor). */
    pauseTool: { type: String, trim: true, maxlength: 32 },
    /** CLI pause approval — policy repo hash or null when scope=all. */
    pauseRepo: { type: String, trim: true, maxlength: 64 },
    pauseBranch: { type: String, trim: true, maxlength: 120 },
    pauseDeviceId: { type: String, trim: true, maxlength: 80 },
    pauseScope: { type: String, enum: ["current_repo", "all"] },
    requestedDurationMinutes: { type: Number, min: 1 },
    /** Developer-provided pause reason. */
    pauseReason: { type: String, trim: true, maxlength: 500 },
    /** Why the context is in required mode (from session policy). */
    contextReason: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ["pending", "approved", "denied", "used"],
      default: "pending",
      index: true
    },
    // Who resolved this (developer userId)
    resolvedBy: { type: String },
    /** When a human approved or denied this request. */
    resolvedAt: { type: Date },
    /** When an approved grant was atomically consumed by verify(). */
    usedAt: { type: Date },
    // When approved: the window in which the next verify() call will be allowed.
    // After this, the grant expires and the agent must request approval again.
    grantExpiresAt: { type: Date },
    /** Minimum workspace authority required to approve this request. */
    requiredAuthorityLevel: { type: Number, min: 0, max: 100, index: true }
  },
  { timestamps: true }
);

// Compound index: find an approved non-expired grant for (agentId, permissionId) quickly
ApprovalRequestSchema.index({ agentId: 1, permissionId: 1, status: 1, grantExpiresAt: 1 });
// Grant lookup including argument fingerprint
ApprovalRequestSchema.index({
  agentId: 1,
  permissionId: 1,
  action: 1,
  vendor: 1,
  amount: 1,
  argumentFingerprint: 1,
  status: 1,
  grantExpiresAt: 1
});
// Partial unique: one pending agent_action per exact request tuple (incl. fingerprint)
ApprovalRequestSchema.index(
  {
    agentId: 1,
    permissionId: 1,
    action: 1,
    vendor: 1,
    amount: 1,
    argumentFingerprint: 1,
    status: 1
  },
  {
    unique: true,
    name: "approval_pending_tuple_unique",
    partialFilterExpression: {
      status: "pending",
      kind: "agent_action"
    }
  }
);
// Compound index: list pending/recent approvals for a developer
ApprovalRequestSchema.index({ developerUserId: 1, status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ accountId: 1, status: 1, createdAt: -1 });
// Compound index: dedupe pending CLI pause approvals
ApprovalRequestSchema.index({
  accountId: 1,
  developerUserId: 1,
  kind: 1,
  pauseTool: 1,
  pauseScope: 1,
  pauseRepo: 1,
  pauseDeviceId: 1,
  status: 1,
});

export type ApprovalRequestDocument = InferSchemaType<typeof ApprovalRequestSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ApprovalRequest =
  (mongoose.models.ApprovalRequest as Model<ApprovalRequestDocument> | undefined) ??
  mongoose.model<ApprovalRequestDocument>("ApprovalRequest", ApprovalRequestSchema);

export default ApprovalRequest;

/** How long an approved grant remains valid for the next verify() call. */
export const APPROVAL_GRANT_TTL_MS = 30 * 60 * 1_000; // 30 minutes
