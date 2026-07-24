import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Lifecycle audit for permission replacement.
 * Distinct from VerificationLog — these never record authorization decisions.
 */
const PermissionReplacementAuditSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    agentId: { type: String, required: true, index: true },
    actorUserId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["attempted", "rejected", "completed", "interrupted"],
      required: true,
      index: true
    },
    oldPermissionId: { type: String, required: true, index: true },
    replacementPermissionId: { type: String, index: true },
    idempotencyKey: { type: String, index: true },
    reason: { type: String, trim: true, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: undefined }
  },
  { timestamps: true }
);

PermissionReplacementAuditSchema.index({ accountId: 1, createdAt: -1 });
PermissionReplacementAuditSchema.index({ oldPermissionId: 1, createdAt: -1 });
PermissionReplacementAuditSchema.index({ replacementPermissionId: 1, createdAt: -1 });

export type PermissionReplacementAuditDocument = InferSchemaType<
  typeof PermissionReplacementAuditSchema
> & {
  _id: mongoose.Types.ObjectId;
};

const PermissionReplacementAudit =
  (mongoose.models.PermissionReplacementAudit as
    | Model<PermissionReplacementAuditDocument>
    | undefined) ??
  mongoose.model<PermissionReplacementAuditDocument>(
    "PermissionReplacementAudit",
    PermissionReplacementAuditSchema
  );

export default PermissionReplacementAudit;
