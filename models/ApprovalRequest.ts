import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * An ApprovalRequest is created when a verify() call passes all hard policy
 * constraints but hits a permission with requiresApproval: true and no
 * approved grant exists for the exact request tuple
 * (agentId, permissionId, action, vendor, amount).
 *
 * Lifecycle:
 *   pending  → approved (human approves in dashboard, grantExpiresAt set to +30min)
 *   pending  → denied   (human denies in dashboard)
 *   approved → used     (agent calls verify() again within the grant window
 *                        with the SAME action/vendor/amount; action allowed)
 *
 * Scoping: an approved grant is only valid for the exact action, vendor, and
 * amount stored on this document. It satisfies only the requiresApproval gate;
 * it never overrides blocked actions, allowedActions narrowing, revoked or
 * expired permissions, disabled agents, maxAmount, allowedVendors, or
 * resource matching — those are re-evaluated on every verify() call before
 * the approval gate is consulted.
 *
 * Multiple verify() calls while pending do NOT create duplicate records for
 * the same request tuple. The upsert in verifyAction uses findOneAndUpdate
 * with the tuple in the filter and $setOnInsert for insert-only fields.
 */
const ApprovalRequestSchema = new Schema(
  {
    approvalId: { type: String, required: true, unique: true, index: true },
    // requestId from the original verify() call that triggered this request
    requestId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, index: true },
    developerUserId: { type: String, index: true },
    agentId: { type: String, required: true, index: true },
    // The permission that requires approval
    permissionId: { type: String, required: true, index: true },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    vendor: { type: String, trim: true, maxlength: 200 },
    amount: { type: Number },
    status: {
      type: String,
      enum: ["pending", "approved", "denied", "used"],
      default: "pending",
      index: true
    },
    // Who resolved this (developer userId)
    resolvedBy: { type: String },
    resolvedAt: { type: Date },
    // When approved: the window in which the next verify() call will be allowed.
    // After this, the grant expires and the agent must request approval again.
    grantExpiresAt: { type: Date }
  },
  { timestamps: true }
);

// Compound index: find an approved non-expired grant for (agentId, permissionId) quickly
ApprovalRequestSchema.index({ agentId: 1, permissionId: 1, status: 1, grantExpiresAt: 1 });
// Compound index: list pending/recent approvals for a developer
ApprovalRequestSchema.index({ developerUserId: 1, status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ accountId: 1, status: 1, createdAt: -1 });

export type ApprovalRequestDocument = InferSchemaType<typeof ApprovalRequestSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ApprovalRequest =
  (mongoose.models.ApprovalRequest as Model<ApprovalRequestDocument> | undefined) ??
  mongoose.model<ApprovalRequestDocument>("ApprovalRequest", ApprovalRequestSchema);

export default ApprovalRequest;

/** How long an approved grant remains valid for the next verify() call. */
export const APPROVAL_GRANT_TTL_MS = 30 * 60 * 1_000; // 30 minutes
