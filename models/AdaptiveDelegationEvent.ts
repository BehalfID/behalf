import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Advisory lifecycle events for Adaptive Delegation.
 * Separate from VerificationLog — these never record authorization decisions.
 */
const AdaptiveDelegationEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    recommendationId: { type: String, required: true, index: true },
    actorUserId: { type: String, default: null, index: true },
    type: {
      type: String,
      enum: [
        "recommendation_generated",
        "recommendation_viewed",
        "recommendation_accepted",
        "recommendation_dismissed",
        "recommendation_postponed"
      ],
      required: true,
      index: true
    },
    metadata: { type: Schema.Types.Mixed, default: undefined }
  },
  { timestamps: true }
);

AdaptiveDelegationEventSchema.index({ accountId: 1, createdAt: -1 });
AdaptiveDelegationEventSchema.index({ recommendationId: 1, createdAt: -1 });

export type AdaptiveDelegationEventDocument = InferSchemaType<typeof AdaptiveDelegationEventSchema> & {
  _id: mongoose.Types.ObjectId;
};

const AdaptiveDelegationEvent =
  (mongoose.models.AdaptiveDelegationEvent as Model<AdaptiveDelegationEventDocument> | undefined) ??
  mongoose.model<AdaptiveDelegationEventDocument>(
    "AdaptiveDelegationEvent",
    AdaptiveDelegationEventSchema
  );

export default AdaptiveDelegationEvent;
