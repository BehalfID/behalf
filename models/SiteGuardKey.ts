import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const SiteGuardKeySchema = new Schema(
  {
    keyId: { type: String, required: true, unique: true, index: true },
    siteId: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true },
    developerUserId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    keyHash: { type: String, required: true, unique: true, select: false },
    keyPreview: { type: String, required: true },
    status: { type: String, enum: ["active", "revoked"], default: "active", index: true },
    lastUsedAt: { type: Date }
  },
  { timestamps: true }
);

SiteGuardKeySchema.index({ siteId: 1, status: 1 });
SiteGuardKeySchema.index({ accountId: 1, createdAt: -1 });

export type SiteGuardKeyDocument = InferSchemaType<typeof SiteGuardKeySchema> & {
  _id: mongoose.Types.ObjectId;
};

const SiteGuardKey =
  (mongoose.models.SiteGuardKey as Model<SiteGuardKeyDocument> | undefined) ??
  mongoose.model<SiteGuardKeyDocument>("SiteGuardKey", SiteGuardKeySchema);

export default SiteGuardKey;
