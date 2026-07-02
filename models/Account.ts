import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AccountSchema = new Schema(
  {
    accountId: { type: String, required: true, unique: true, index: true },
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
    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
      required: true,
      index: true
    },
    stripeCustomerId: { type: String, trim: true, index: true, sparse: true },
    stripeSubscriptionId: { type: String, trim: true },
    stripeSubscriptionStatus: { type: String, trim: true },
    stripeTrialEnd: { type: Date, default: null },
    stripeCurrentPeriodEnd: { type: Date, default: null },
    verificationCount: { type: Number, default: 0, required: true },
    verificationPeriodStart: { type: Date, default: Date.now, required: true }
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
