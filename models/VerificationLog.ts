import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const VerificationLogSchema = new Schema(
  {
    logId: { type: String, required: true, unique: true, index: true },
    requestId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, index: true },
    developerUserId: { type: String, index: true },
    agentId: { type: String, required: true, index: true },
    permissionId: { type: String, default: null, index: true },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number },
    vendor: { type: String, trim: true, maxlength: 200 },
    allowed: { type: Boolean, required: true },
    approvalRequired: { type: Boolean, default: false },
    reason: { type: String, required: true },
    risk: { type: String, enum: ["low", "medium", "high"], required: true },
    metadata: { type: Schema.Types.Mixed, default: undefined },
    shadow: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

VerificationLogSchema.index({ accountId: 1, agentId: 1, createdAt: -1 });
VerificationLogSchema.index({ developerUserId: 1, agentId: 1, createdAt: -1 });
// Supports today's log count in getDashboardSummary and general log listing
// without an agentId filter (when no agentId is in the query).
VerificationLogSchema.index({ developerUserId: 1, createdAt: -1 });
// Dashboard /api/dashboard/logs scopes by accountId and sorts by createdAt desc
// without requiring agentId. The accountId+agentId+createdAt compound cannot
// efficiently serve that sort (agentId sits between the equality and range keys).
VerificationLogSchema.index({ accountId: 1, createdAt: -1 });

// Mongo $text indexes intentionally skipped for smart log search:
// - Search uses case-insensitive substring regex across discrete fields
//   (requestId, action, vendor, reason, agentId, permissionId), not $text.
// - A text index would not accelerate that pattern and would force a query rewrite.
// - Queries are filter-first (account + optional decision/risk/agent/range) and
//   paginated; per-workspace list volume does not justify text-index write cost.

export type VerificationLogDocument = InferSchemaType<typeof VerificationLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

const VerificationLog =
  (mongoose.models.VerificationLog as Model<VerificationLogDocument> | undefined) ??
  mongoose.model<VerificationLogDocument>("VerificationLog", VerificationLogSchema);

export default VerificationLog;
