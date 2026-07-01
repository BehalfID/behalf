import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AccountMembershipSchema = new Schema(
  {
    membershipId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: {
      type: String,
      enum: ["OWNER", "ENGINEERING_LEAD", "SENIOR_ENGINEER", "ENGINEER", "VIEWER"],
      default: "OWNER",
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

AccountMembershipSchema.index({ accountId: 1, userId: 1 }, { unique: true });

export type AccountMembershipDocument = InferSchemaType<typeof AccountMembershipSchema> & {
  _id: mongoose.Types.ObjectId;
};

const AccountMembership =
  (mongoose.models.AccountMembership as Model<AccountMembershipDocument> | undefined) ??
  mongoose.model<AccountMembershipDocument>("AccountMembership", AccountMembershipSchema);

export default AccountMembership;
