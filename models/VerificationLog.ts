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
    reason: { type: String, required: true },
    risk: { type: String, enum: ["low", "medium", "high"], required: true },
    metadata: { type: Schema.Types.Mixed, default: undefined }
  },
  { timestamps: true }
);

VerificationLogSchema.index({ accountId: 1, agentId: 1, createdAt: -1 });
VerificationLogSchema.index({ developerUserId: 1, agentId: 1, createdAt: -1 });
// Supports today's log count in getDashboardSummary and general log listing
// without an agentId filter (when no agentId is in the query).
VerificationLogSchema.index({ developerUserId: 1, createdAt: -1 });

export type VerificationLogDocument = InferSchemaType<typeof VerificationLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

const VerificationLog =
  (mongoose.models.VerificationLog as Model<VerificationLogDocument> | undefined) ??
  mongoose.model<VerificationLogDocument>("VerificationLog", VerificationLogSchema);

export default VerificationLog;
