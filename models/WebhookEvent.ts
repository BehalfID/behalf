import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const WebhookEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    developerUserId: { type: String, index: true },
    type: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true
    },
    attempts: { type: Number, required: true, default: 0 },
    nextAttemptAt: { type: Date, required: true, default: Date.now },
    processingStartedAt: { type: Date },
    deadLetter: { type: Boolean, required: true, default: false, index: true },
    lastError: { type: String, maxlength: 500, default: null },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

WebhookEventSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
WebhookEventSchema.index({ accountId: 1, deadLetter: 1, createdAt: -1 });
WebhookEventSchema.index({ developerUserId: 1, deadLetter: 1, createdAt: -1 });
// Supports pending-event count in getDashboardSummary.
WebhookEventSchema.index({ developerUserId: 1, status: 1 });

export type WebhookEventDocument = InferSchemaType<typeof WebhookEventSchema> & {
  _id: mongoose.Types.ObjectId;
};

const WebhookEvent =
  (mongoose.models.WebhookEvent as Model<WebhookEventDocument> | undefined) ??
  mongoose.model<WebhookEventDocument>("WebhookEvent", WebhookEventSchema);

export default WebhookEvent;
