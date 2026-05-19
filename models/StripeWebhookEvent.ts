import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const StripeWebhookEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
    processedAt: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true }
);

export type StripeWebhookEventDocument = InferSchemaType<typeof StripeWebhookEventSchema> & {
  _id: mongoose.Types.ObjectId;
};

const StripeWebhookEvent =
  (mongoose.models.StripeWebhookEvent as Model<StripeWebhookEventDocument> | undefined) ??
  mongoose.model<StripeWebhookEventDocument>("StripeWebhookEvent", StripeWebhookEventSchema);

export default StripeWebhookEvent;
