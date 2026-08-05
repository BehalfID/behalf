import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Append-only ledger of complimentary plan grants and revocations.
 *
 * The Account document holds current state; this collection holds how that
 * state was reached. Rows are never updated or deleted — a revocation is a new
 * row, so who comped a workspace, when, why and on whose authority survives the
 * revocation.
 *
 * `billingPlanAtChange` records the Stripe-owned `Account.plan` at the moment of
 * the change, which is what makes it possible to tell a comp apart from a paid
 * upgrade after the fact.
 */
const AccountPlanGrantSchema = new Schema(
  {
    grantId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    action: { type: String, enum: ["grant", "revoke"], required: true, index: true },
    /** Plan awarded. null for a revoke. */
    plan: { type: String, enum: ["pro", "team", "business", "enterprise", null], default: null },
    /** Complimentary plan in effect immediately before this entry. */
    previousPlan: {
      type: String,
      enum: ["pro", "team", "business", "enterprise", null],
      default: null
    },
    billingPlanAtChange: {
      type: String,
      enum: ["free", "pro", "team", "business", "enterprise"],
      required: true
    },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    /** null means the grant does not expire (lifetime). */
    expiresAt: { type: Date, default: null },
    actor: { type: String, required: true, trim: true },
    actorType: {
      type: String,
      enum: ["console_admin", "operator_script"],
      required: true
    },
    metadata: { type: Schema.Types.Mixed, default: undefined }
  },
  { timestamps: true }
);

AccountPlanGrantSchema.index({ accountId: 1, createdAt: -1 });
AccountPlanGrantSchema.index({ createdAt: -1 });

export type AccountPlanGrantDocument = InferSchemaType<typeof AccountPlanGrantSchema> & {
  _id: mongoose.Types.ObjectId;
};

const AccountPlanGrant =
  (mongoose.models.AccountPlanGrant as Model<AccountPlanGrantDocument> | undefined) ??
  mongoose.model<AccountPlanGrantDocument>("AccountPlanGrant", AccountPlanGrantSchema);

export default AccountPlanGrant;
