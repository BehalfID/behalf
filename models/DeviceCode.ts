import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const DeviceCodeSchema = new Schema(
  {
    codeId: { type: String, required: true, unique: true, index: true },
    deviceCode: { type: String, required: true, unique: true, index: true },
    userCode: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["pending", "authorized", "denied"], default: "pending" },
    userId: { type: String, default: null },
    sessionToken: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

DeviceCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type DeviceCodeDocument = InferSchemaType<typeof DeviceCodeSchema> & {
  _id: mongoose.Types.ObjectId;
};

const DeviceCode =
  (mongoose.models.DeviceCode as Model<DeviceCodeDocument> | undefined) ??
  mongoose.model<DeviceCodeDocument>("DeviceCode", DeviceCodeSchema);

export default DeviceCode;
