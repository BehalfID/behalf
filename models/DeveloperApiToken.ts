import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const DeveloperApiTokenSchema = new Schema(
  {
    tokenId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    tokenPreview: { type: String },
    tokenHash: { type: String, required: true, unique: true, select: false },
    lastUsedAt: { type: Date }
  },
  { timestamps: true }
);

export type DeveloperApiTokenDocument = InferSchemaType<typeof DeveloperApiTokenSchema> & {
  _id: mongoose.Types.ObjectId;
};

const DeveloperApiToken =
  (mongoose.models.DeveloperApiToken as Model<DeveloperApiTokenDocument> | undefined) ??
  mongoose.model<DeveloperApiTokenDocument>("DeveloperApiToken", DeveloperApiTokenSchema);

export default DeveloperApiToken;
