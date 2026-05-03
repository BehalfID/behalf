import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const WebhookEndpointSchema = new Schema(
  {
    webhookId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    developerUserId: { type: String, index: true },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    secretHash: { type: String, required: true, select: false },
    secretPreview: { type: String, required: true },
    events: [{ type: String, required: true, trim: true }],
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true
    },
    lastTriggeredAt: { type: Date }
  },
  { timestamps: true }
);

WebhookEndpointSchema.index({ accountId: 1, status: 1 });
WebhookEndpointSchema.index({ developerUserId: 1, status: 1 });

export type WebhookEndpointDocument = InferSchemaType<typeof WebhookEndpointSchema> & {
  _id: mongoose.Types.ObjectId;
};

const WebhookEndpoint =
  (mongoose.models.WebhookEndpoint as Model<WebhookEndpointDocument> | undefined) ??
  mongoose.model<WebhookEndpointDocument>("WebhookEndpoint", WebhookEndpointSchema);

export default WebhookEndpoint;
