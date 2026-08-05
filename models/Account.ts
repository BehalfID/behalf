import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AccountSchema = new Schema(
  {
    accountId: { type: String, required: true, unique: true, index: true },
    /** Stable human-facing workspace URL identity. Immutable after assignment in v1. */
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 63,
      unique: true,
      sparse: true,
      index: true
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    accountType: {
      type: String,
      enum: ["individual", "business"],
      index: true,
      sparse: true
    },
    companyName: { type: String, trim: true, maxlength: 200 },
    website: { type: String, trim: true },
    teamSize: {
      type: String,
      enum: ["1", "2-5", "6-20", "21-50", "51+"]
    },
    onboarding: {
      agentTools: [{ type: String }],
      agentToolsOther: { type: String, trim: true, maxlength: 120 },
      controlAreas: [{ type: String }],
      controlAreasOther: { type: String, trim: true, maxlength: 200 },
      primaryGoal: {
        type: String,
        enum: ["approvals", "block", "audit", "limits"]
      },
      firstSetupGoal: {
        type: String,
        enum: [
          "create_agent",
          "setup_deploy_approvals",
          "apply_permission_profile",
          "invite_team",
          "explore_sandbox"
        ]
      }
    },
    /**
     * Billing-owned plan. Stripe webhooks write this field and only this field.
     */
    plan: {
      type: String,
      enum: ["free", "pro", "team", "business", "enterprise"],
      default: "free",
      required: true,
      index: true
    },
    /**
     * Complimentary plan grant, deliberately kept out of `plan`.
     *
     * Every Stripe webhook branch ends in an unconditional `$set: { plan }`
     * — "free" on cancellation, on a failed invoice, and on any non-active
     * subscription status. A comp stored in `plan` is one webhook away from
     * being erased with no record it existed. These fields are never written by
     * billing code, so the overwrite is structurally impossible rather than
     * merely unlikely. `lib/planGrants.ts` resolves the effective plan.
     *
     * "free" is not grantable: a grant raises entitlements above billing, so
     * granting "free" would be a no-op that still read as an active comp.
     */
    complimentaryPlan: {
      type: String,
      enum: ["pro", "team", "business", "enterprise"],
      default: null,
      index: true,
      sparse: true
    },
    complimentaryPlanReason: { type: String, trim: true, maxlength: 500, default: null },
    complimentaryPlanGrantedBy: { type: String, trim: true, default: null },
    complimentaryPlanGrantedAt: { type: Date, default: null },
    /** null means the grant does not expire (lifetime). */
    complimentaryPlanExpiresAt: { type: Date, default: null },
    stripeCustomerId: { type: String, trim: true, index: true, sparse: true },
    stripeSubscriptionId: { type: String, trim: true },
    stripeSubscriptionStatus: { type: String, trim: true },
    stripeTrialEnd: { type: Date, default: null },
    stripeCurrentPeriodEnd: { type: Date, default: null },
    verificationCount: { type: Number, default: 0, required: true },
    verificationPeriodStart: { type: Date, default: Date.now, required: true },
    /** Workspace Google SSO (domain allowlist + optional password login enforcement). */
    sso: {
      provider: { type: String, enum: ["google"], default: "google" },
      enabled: { type: Boolean, default: false },
      enforce: { type: Boolean, default: false },
      allowedEmailDomains: {
        type: [{ type: String, lowercase: true, trim: true, maxlength: 253 }],
        default: []
      }
    }
  },
  { timestamps: true }
);

export type AccountDocument = InferSchemaType<typeof AccountSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Account =
  (mongoose.models.Account as Model<AccountDocument> | undefined) ??
  mongoose.model<AccountDocument>("Account", AccountSchema);

export default Account;
