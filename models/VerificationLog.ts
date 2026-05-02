import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const VerificationLogSchema = new Schema(
  {
    logId: { type: String, required: true, unique: true, index: true },
    agentId: { type: String, required: true, index: true },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number },
    vendor: { type: String, trim: true, maxlength: 200 },
    allowed: { type: Boolean, required: true },
    reason: { type: String, required: true },
    risk: { type: String, enum: ["low", "medium", "high"], required: true }
  },
  { timestamps: true }
);

VerificationLogSchema.index({ agentId: 1, createdAt: -1 });

export type VerificationLogDocument = InferSchemaType<typeof VerificationLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

const VerificationLog =
  (mongoose.models.VerificationLog as Model<VerificationLogDocument> | undefined) ??
  mongoose.model<VerificationLogDocument>("VerificationLog", VerificationLogSchema);

export default VerificationLog;
