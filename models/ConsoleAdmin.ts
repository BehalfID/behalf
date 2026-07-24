import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const ConsoleAdminSchema = new Schema(
  {
    adminId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["owner", "operator"], default: "owner", required: true },
    lastLoginAt: { type: Date, default: null },
    disabledAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export type ConsoleAdminDocument = InferSchemaType<typeof ConsoleAdminSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ConsoleAdmin =
  (mongoose.models.ConsoleAdmin as Model<ConsoleAdminDocument> | undefined) ??
  mongoose.model<ConsoleAdminDocument>("ConsoleAdmin", ConsoleAdminSchema);

export default ConsoleAdmin;
