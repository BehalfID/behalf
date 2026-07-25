import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AdminAuditLogSchema = new Schema(
  {
    entryId: { type: String, required: true, unique: true, index: true },
    adminId: { type: String, required: true, index: true },
    action: { type: String, required: true, trim: true, maxlength: 120, index: true },
    target: { type: String, trim: true, maxlength: 200 },
    requestId: { type: String, trim: true, maxlength: 80 },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AdminAuditLogSchema.index({ createdAt: -1 });

export type AdminAuditLogDocument = InferSchemaType<typeof AdminAuditLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

const AdminAuditLog =
  (mongoose.models.AdminAuditLog as Model<AdminAuditLogDocument> | undefined) ??
  mongoose.model<AdminAuditLogDocument>("AdminAuditLog", AdminAuditLogSchema);

export default AdminAuditLog;
