import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const DeveloperUserSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false }
  },
  { timestamps: true }
);

export type DeveloperUserDocument = InferSchemaType<typeof DeveloperUserSchema> & {
  _id: mongoose.Types.ObjectId;
};

const DeveloperUser =
  (mongoose.models.DeveloperUser as Model<DeveloperUserDocument> | undefined) ??
  mongoose.model<DeveloperUserDocument>("DeveloperUser", DeveloperUserSchema);

export default DeveloperUser;
