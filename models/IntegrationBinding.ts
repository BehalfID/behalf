import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const IdentityMapSchema = new Schema(
  {
    externalUserId: { type: String, required: true, trim: true, maxlength: 120 },
    userId: { type: String, required: true, trim: true, maxlength: 120 }
  },
  { _id: false }
);

/**
 * Account-scoped collaboration integration binding (Slack workspace/channel).
 * botToken is select:false and only loaded when posting or verifying.
 */
const IntegrationBindingSchema = new Schema(
  {
    bindingId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    provider: {
      type: String,
      required: true,
      enum: ["slack"],
      index: true
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true
    },
    teamId: { type: String, required: true, trim: true, maxlength: 64, index: true },
    teamName: { type: String, trim: true, maxlength: 200 },
    channelId: { type: String, required: true, trim: true, maxlength: 64 },
    channelName: { type: String, trim: true, maxlength: 200 },
    /** Slack bot token — never returned in lean list queries. */
    botToken: { type: String, required: true, select: false },
    /** Slack signing secret for interactive payloads. */
    signingSecret: { type: String, required: true, select: false },
    identityMap: { type: [IdentityMapSchema], default: [] },
    createdBy: { type: String, required: true, index: true }
  },
  { timestamps: true }
);

IntegrationBindingSchema.index({ accountId: 1, provider: 1, status: 1 });
IntegrationBindingSchema.index(
  { accountId: 1, provider: 1, teamId: 1, channelId: 1 },
  { unique: true }
);

export type IntegrationBindingDocument = InferSchemaType<typeof IntegrationBindingSchema> & {
  _id: mongoose.Types.ObjectId;
};

const IntegrationBinding =
  (mongoose.models.IntegrationBinding as Model<IntegrationBindingDocument> | undefined) ??
  mongoose.model<IntegrationBindingDocument>("IntegrationBinding", IntegrationBindingSchema);

export default IntegrationBinding;

/**
 * Tracks outbound Slack (or other) messages so lifecycle updates can edit in place.
 */
const CollaborationMessageRefSchema = new Schema(
  {
    refId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    provider: { type: String, required: true, enum: ["slack"], index: true },
    bindingId: { type: String, required: true, index: true },
    approvalId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    messageTs: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "denied", "used"],
      default: "pending",
      index: true
    }
  },
  { timestamps: true }
);

CollaborationMessageRefSchema.index({ accountId: 1, approvalId: 1, provider: 1 }, { unique: true });

export type CollaborationMessageRefDocument = InferSchemaType<
  typeof CollaborationMessageRefSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const CollaborationMessageRef =
  (mongoose.models.CollaborationMessageRef as Model<CollaborationMessageRefDocument> | undefined) ??
  mongoose.model<CollaborationMessageRefDocument>(
    "CollaborationMessageRef",
    CollaborationMessageRefSchema
  );
