import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const SiteSchema = new Schema(
  {
    siteId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    developerUserId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    domain: { type: String, required: true, trim: true, lowercase: true, maxlength: 253, index: true },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true
    }
  },
  { timestamps: true }
);

SiteSchema.index({ accountId: 1, domain: 1 }, { unique: true });
SiteSchema.index({ developerUserId: 1, createdAt: -1 });

export type SiteDocument = InferSchemaType<typeof SiteSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Site =
  (mongoose.models.Site as Model<SiteDocument> | undefined) ??
  mongoose.model<SiteDocument>("Site", SiteSchema);

export default Site;
