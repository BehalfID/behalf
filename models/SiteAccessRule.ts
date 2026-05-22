import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const SiteAccessRuleSchema = new Schema(
  {
    ruleId: { type: String, required: true, unique: true, index: true },
    siteId: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true },
    developerUserId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true
    },
    agentIdentifier: { type: String, trim: true, maxlength: 180 },
    userAgentPattern: { type: String, trim: true, maxlength: 240 },
    allowedPaths: [{ type: String, trim: true, maxlength: 500 }],
    blockedPaths: [{ type: String, trim: true, maxlength: 500 }],
    requiresApproval: { type: Boolean, default: false },
    notes: { type: String, trim: true, maxlength: 1000 }
  },
  { timestamps: true }
);

SiteAccessRuleSchema.index({ accountId: 1, siteId: 1, createdAt: -1 });

export type SiteAccessRuleDocument = InferSchemaType<typeof SiteAccessRuleSchema> & {
  _id: mongoose.Types.ObjectId;
};

const SiteAccessRule =
  (mongoose.models.SiteAccessRule as Model<SiteAccessRuleDocument> | undefined) ??
  mongoose.model<SiteAccessRuleDocument>("SiteAccessRule", SiteAccessRuleSchema);

export default SiteAccessRule;
