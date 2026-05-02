import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AgentSchema = new Schema(
  {
    agentId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    apiKeyHash: { type: String, required: true, select: false },
    lastUsedAt: { type: Date },
    keyRotatedAt: { type: Date },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true
    }
  },
  { timestamps: true }
);

export type AgentDocument = InferSchemaType<typeof AgentSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Agent =
  (mongoose.models.Agent as Model<AgentDocument> | undefined) ??
  mongoose.model<AgentDocument>("Agent", AgentSchema);

export default Agent;
