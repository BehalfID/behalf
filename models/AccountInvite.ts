import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AccountInviteSchema = new Schema(
  {
    inviteId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: {
      type: String,
      enum: ["ENGINEERING_LEAD", "SENIOR_ENGINEER", "ENGINEER", "VIEWER"],
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked"],
      default: "pending",
      index: true
    },
    /** SHA-256 hash of the invite acceptance token. Never returned in API responses. */
    inviteTokenHash: { type: String, select: false, index: true, sparse: true },
    inviteTokenExpiresAt: { type: Date, select: false },
    acceptedAt: { type: Date, default: null },
    acceptedByUserId: { type: String, index: true, sparse: true },
    invitedBy: { type: String, required: true, index: true }
  },
  { timestamps: true }
);

AccountInviteSchema.index({ accountId: 1, email: 1, status: 1 }, { unique: true });

export type AccountInviteDocument = InferSchemaType<typeof AccountInviteSchema> & {
  _id: mongoose.Types.ObjectId;
};

const AccountInvite =
  (mongoose.models.AccountInvite as Model<AccountInviteDocument> | undefined) ??
  mongoose.model<AccountInviteDocument>("AccountInvite", AccountInviteSchema);

export default AccountInvite;
