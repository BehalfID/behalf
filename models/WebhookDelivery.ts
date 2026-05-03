import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const WebhookDeliverySchema = new Schema(
  {
    deliveryId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    developerUserId: { type: String, index: true },
    webhookId: { type: String, required: true, index: true },
    eventId: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    status: { type: String, enum: ["success", "failed"], required: true },
    httpStatus: { type: Number },
    error: { type: String, maxlength: 500 },
    attempt: { type: Number, required: true, default: 1 },
    nextRetryAt: { type: Date },
    maxAttempts: { type: Number, required: true, default: 5 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

WebhookDeliverySchema.index({ accountId: 1, webhookId: 1, createdAt: -1 });
WebhookDeliverySchema.index({ developerUserId: 1, webhookId: 1, createdAt: -1 });

export type WebhookDeliveryDocument = InferSchemaType<typeof WebhookDeliverySchema> & {
  _id: mongoose.Types.ObjectId;
};

const WebhookDelivery =
  (mongoose.models.WebhookDelivery as Model<WebhookDeliveryDocument> | undefined) ??
  mongoose.model<WebhookDeliveryDocument>("WebhookDelivery", WebhookDeliverySchema);

export default WebhookDelivery;
