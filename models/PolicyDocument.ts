import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const PolicyPredicateSchema = new Schema(
  {
    type: { type: String, required: true, trim: true, maxlength: 64 },
    pattern: { type: String, trim: true, maxlength: 500 },
    max: { type: Number },
    status: { type: String, trim: true, maxlength: 32 },
    level: { type: String, trim: true, maxlength: 16 },
    action: { type: String, trim: true, maxlength: 80 },
    vendor: { type: String, trim: true, maxlength: 200 },
    value: { type: Boolean }
  },
  { _id: false, strict: false }
);

const PolicyRuleSchema = new Schema(
  {
    id: { type: String, required: true, trim: true, maxlength: 120 },
    priority: { type: Number, required: true },
    when: { type: [PolicyPredicateSchema], default: [] },
    then: {
      type: String,
      required: true,
      enum: ["allow", "auto_approve", "require_human", "deny"]
    },
    reason: { type: String, required: true, trim: true, maxlength: 500 }
  },
  { _id: false }
);

/**
 * Account-scoped guardrail policy. One active document per account
 * (unique accountId). Version increments on each successful update.
 */
const PolicyDocumentSchema = new Schema(
  {
    policyId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, unique: true, index: true },
    name: { type: String, trim: true, maxlength: 120 },
    version: { type: Number, required: true, min: 1, default: 1 },
    enabled: { type: Boolean, required: true, default: true, index: true },
    rules: { type: [PolicyRuleSchema], default: [] },
    updatedBy: { type: String, index: true }
  },
  { timestamps: true }
);

PolicyDocumentSchema.index({ accountId: 1, enabled: 1 });

export type PolicyDocumentRecord = InferSchemaType<typeof PolicyDocumentSchema> & {
  _id: mongoose.Types.ObjectId;
};

const PolicyDocumentModel =
  (mongoose.models.PolicyDocument as Model<PolicyDocumentRecord> | undefined) ??
  mongoose.model<PolicyDocumentRecord>("PolicyDocument", PolicyDocumentSchema);

export default PolicyDocumentModel;
