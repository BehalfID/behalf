import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AgentSchema = new Schema(
  {
    agentId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    apiKeyHash: { type: String, required: true, select: false }
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
