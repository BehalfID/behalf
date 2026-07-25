import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Adaptive Delegation recommendation — advisory only.
 * Acceptance creates a Permission via existing mutation paths; this document
 * never authorizes actions on its own.
 */
const ConfidenceFactorSchema = new Schema(
  {
    code: { type: String, required: true, maxlength: 64 },
    label: { type: String, required: true, maxlength: 240 },
    delta: { type: Number, required: true },
    polarity: { type: String, enum: ["positive", "negative"], required: true }
  },
  { _id: false }
);

const RecommendationEvidenceSchema = new Schema(
  {
    approvedCount: { type: Number, required: true, min: 0 },
    deniedCount: { type: Number, required: true, min: 0 },
    usedCount: { type: Number, required: true, min: 0 },
    pendingCount: { type: Number, required: true, min: 0 },
    approvalRequiredLogCount: { type: Number, required: true, min: 0 },
    distinctAgents: { type: Number, required: true, min: 0 },
    distinctResources: { type: Number, required: true, min: 0 },
    sameAgent: { type: Boolean, required: true },
    sameResource: { type: Boolean, required: true },
    historyDays: { type: Number, required: true, min: 0 },
    firstSeenAt: { type: String, default: null },
    lastSeenAt: { type: String, default: null },
    sampleApprovalIds: [{ type: String, maxlength: 80 }]
  },
  { _id: false }
);

const ProposedPermissionSchema = new Schema(
  {
    action: { type: String, required: true, maxlength: 80 },
    resource: { type: String, maxlength: 240 },
    scope: { type: String, maxlength: 500 },
    requiresApproval: { type: Boolean, required: true, default: false },
    notes: { type: String, maxlength: 800 },
    description: { type: String, maxlength: 400 },
    constraints: {
      allowedBranches: [{ type: String, maxlength: 200 }],
      deniedBranches: [{ type: String, maxlength: 200 }],
      allowedEnvironments: [{ type: String, maxlength: 80 }],
      deniedEnvironments: [{ type: String, maxlength: 80 }],
      allowedRepositories: [{ type: String, maxlength: 240 }],
      deniedRepositories: [{ type: String, maxlength: 240 }]
    }
  },
  { _id: false }
);

const ProposedTrustProfilePermissionSchema = new Schema(
  {
    action: { type: String, required: true, maxlength: 80 },
    resource: { type: String, maxlength: 240 },
    requiresApproval: { type: Boolean, required: true, default: false },
    blockedActions: [{ type: String, maxlength: 160 }],
    notes: { type: String, maxlength: 800 }
  },
  { _id: false }
);

const ProposedTrustProfileSchema = new Schema(
  {
    templateId: { type: String, required: true, maxlength: 64 },
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 500 },
    resourceScope: { type: String, maxlength: 200 },
    matchedActions: [{ type: String, maxlength: 80 }],
    unmatchedActions: [{ type: String, maxlength: 80 }],
    coveragePercent: { type: Number, required: true, min: 0, max: 100 },
    permissions: { type: [ProposedTrustProfilePermissionSchema], default: [] }
  },
  { _id: false }
);

const ProposedOrgDelegationSchema = new Schema(
  {
    templateId: { type: String, required: true, maxlength: 64 },
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 500 },
    department: { type: String, maxlength: 80 },
    minAcceptAuthorityLevel: { type: Number, required: true, min: 0, max: 100 },
    agentIds: [{ type: String, maxlength: 80 }],
    agentLabels: [{ type: String, maxlength: 160 }],
    matchedActions: [{ type: String, maxlength: 80 }],
    unmatchedActions: [{ type: String, maxlength: 80 }],
    coveragePercent: { type: Number, required: true, min: 0, max: 100 },
    permissions: { type: [ProposedTrustProfilePermissionSchema], default: [] }
  },
  { _id: false }
);

const SecurityImpactSchema = new Schema(
  {
    summary: { type: String, required: true, maxlength: 800 },
    authorityLevel: { type: Number, required: true, min: 0, max: 100 },
    removesApprovalGate: { type: Boolean, required: true },
    riskNotes: [{ type: String, maxlength: 400 }]
  },
  { _id: false }
);

const AdaptiveDelegationRecommendationSchema = new Schema(
  {
    recommendationId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    agentId: { type: String, required: true, index: true },
    kind: {
      type: String,
      enum: [
        "reusable_permission",
        "trust_profile",
        "context_scoped_permission",
        "organization_delegation"
      ],
      default: "reusable_permission",
      index: true
    },
    status: {
      type: String,
      enum: ["active", "postponed", "accepted", "dismissed", "superseded"],
      default: "active",
      index: true
    },
    action: { type: String, required: true, trim: true, maxlength: 80, index: true },
    resource: { type: String, trim: true, maxlength: 200, default: null },
    confidence: { type: Number, required: true, min: 0, max: 100, index: true },
    explanation: { type: String, required: true, maxlength: 1200 },
    factors: { type: [ConfidenceFactorSchema], default: [] },
    evidence: { type: RecommendationEvidenceSchema, required: true },
    proposedPermission: { type: ProposedPermissionSchema, default: null },
    proposedTrustProfile: { type: ProposedTrustProfileSchema, default: null },
    proposedOrgDelegation: { type: ProposedOrgDelegationSchema, default: null },
    affectedTools: [{ type: String, maxlength: 80 }],
    affectedResources: [{ type: String, maxlength: 200 }],
    estimatedApprovalReduction: { type: Number, required: true, min: 0 },
    securityImpact: { type: SecurityImpactSchema, required: true },
    rollbackInstructions: { type: String, required: true, maxlength: 800 },
    fingerprint: { type: String, required: true, maxlength: 64, index: true },
    dismissReason: {
      type: String,
      enum: ["keep_manual", "never_suggest"],
      default: null
    },
    remindAt: { type: Date, default: null },
    acceptedPermissionId: { type: String, default: null },
    acceptedProfileId: { type: String, default: null },
    acceptedAgentIds: [{ type: String, maxlength: 80 }],
    acceptedBy: { type: String, default: null },
    dismissedBy: { type: String, default: null },
    viewedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

AdaptiveDelegationRecommendationSchema.index({ accountId: 1, status: 1, confidence: -1 });
AdaptiveDelegationRecommendationSchema.index(
  { accountId: 1, fingerprint: 1 },
  { unique: true }
);

export type AdaptiveDelegationRecommendationDocument = InferSchemaType<
  typeof AdaptiveDelegationRecommendationSchema
> & {
  _id: mongoose.Types.ObjectId;
};

const AdaptiveDelegationRecommendation =
  (mongoose.models.AdaptiveDelegationRecommendation as
    | Model<AdaptiveDelegationRecommendationDocument>
    | undefined) ??
  mongoose.model<AdaptiveDelegationRecommendationDocument>(
    "AdaptiveDelegationRecommendation",
    AdaptiveDelegationRecommendationSchema
  );

export default AdaptiveDelegationRecommendation;
