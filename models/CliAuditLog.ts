import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CliAuditLogSchema = new Schema(
  {
    auditId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, index: true },
    userId: { type: String, index: true },
    eventType: {
      type: String,
      required: true,
      enum: ["cli_session_policy", "cli_pause_grant", "cli_pause_deny"],
      index: true,
    },
    tool: { type: String, trim: true, maxlength: 32 },
    repo: { type: String, trim: true, maxlength: 256 },
    branch: { type: String, trim: true, maxlength: 120 },
    mode: { type: String, enum: ["unmanaged", "managed", "required"] },
    granted: { type: Boolean },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

CliAuditLogSchema.index({ accountId: 1, createdAt: -1 });

export type CliAuditLogDocument = InferSchemaType<typeof CliAuditLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

const CliAuditLog =
  (mongoose.models.CliAuditLog as Model<CliAuditLogDocument> | undefined) ??
  mongoose.model<CliAuditLogDocument>("CliAuditLog", CliAuditLogSchema);

export default CliAuditLog;
