import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CliPauseLeaseSchema = new Schema(
  {
    leaseId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, index: true },
    userId: { type: String, index: true },
    deviceId: { type: String, trim: true, maxlength: 80, index: true },
    tool: { type: String, trim: true, maxlength: 32 },
    repo: { type: String, trim: true, maxlength: 256 },
    branch: { type: String, trim: true, maxlength: 120 },
    scope: { type: String, enum: ["current_repo", "all"], default: "current_repo" },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    granted: { type: Boolean, required: true },
    deniedReason: { type: String, trim: true, maxlength: 500 },
    mode: { type: String, enum: ["unmanaged", "managed", "required"], default: "unmanaged" },
    expiresAt: { type: Date, index: true },
  },
  { timestamps: true }
);

CliPauseLeaseSchema.index({ accountId: 1, userId: 1, expiresAt: 1 });
CliPauseLeaseSchema.index({ deviceId: 1, expiresAt: 1 });

export type CliPauseLeaseDocument = InferSchemaType<typeof CliPauseLeaseSchema> & {
  _id: mongoose.Types.ObjectId;
};

const CliPauseLease =
  (mongoose.models.CliPauseLease as Model<CliPauseLeaseDocument> | undefined) ??
  mongoose.model<CliPauseLeaseDocument>("CliPauseLease", CliPauseLeaseSchema);

export default CliPauseLease;
