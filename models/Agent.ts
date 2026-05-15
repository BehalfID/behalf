import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AgentSchema = new Schema(
  {
    agentId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, index: true },
    developerUserId: { type: String, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    agentType: {
      type: String,
      enum: ["native", "connected"],
      default: "native",
      index: true
    },
    provider: {
      type: String,
      enum: ["custom", "ollie", "chatgpt", "claude", "gemini", "zapier", "make", "langchain", "openai", "other"],
      default: "custom",
      index: true
    },
    externalAgentId: { type: String, trim: true, maxlength: 180 },
    externalAgentLabel: { type: String, trim: true, maxlength: 180 },
    connectionStatus: {
      type: String,
      enum: ["manual", "connected", "disconnected"],
      default: "manual",
      index: true
    },
    description: { type: String, trim: true, maxlength: 800 },
    guidelines: [{ type: String, trim: true, maxlength: 500 }],
    publicPassportTokenHash: { type: String, select: false },
    publicPassportTokenPreview: { type: String },
    publicPassportEnabled: { type: Boolean, default: false, index: true },
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
