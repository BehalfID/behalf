import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const SiteAccessLogSchema = new Schema(
  {
    requestId: { type: String, required: true, unique: true, index: true },
    siteId: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true },
    developerUserId: { type: String, required: true, index: true },
    ruleId: { type: String, default: null, index: true },
    domain: { type: String, required: true, trim: true, lowercase: true, maxlength: 253 },
    path: { type: String, required: true, trim: true, maxlength: 500 },
    userAgent: { type: String, required: true, trim: true, maxlength: 500 },
    agentIdentifier: { type: String, trim: true, maxlength: 180 },
    allowed: { type: Boolean, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    risk: { type: String, enum: ["low", "medium", "high"], required: true }
  },
  { timestamps: true }
);

SiteAccessLogSchema.index({ accountId: 1, siteId: 1, createdAt: -1 });
SiteAccessLogSchema.index({ developerUserId: 1, createdAt: -1 });

export type SiteAccessLogDocument = InferSchemaType<typeof SiteAccessLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

const SiteAccessLog =
  (mongoose.models.SiteAccessLog as Model<SiteAccessLogDocument> | undefined) ??
  mongoose.model<SiteAccessLogDocument>("SiteAccessLog", SiteAccessLogSchema);

export default SiteAccessLog;
