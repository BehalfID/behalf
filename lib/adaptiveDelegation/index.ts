export type {
  AdaptiveDelegationDismissReason,
  AdaptiveDelegationEventType,
  AdaptiveDelegationRecommendationKind,
  AdaptiveDelegationRecommendationStatus,
  AdaptiveDelegationRecommendationView,
  AdaptiveDelegationStats,
  AdaptiveDelegationThresholds,
  ApprovalPatternAggregate,
  ConfidenceFactor,
  ProposedTrustProfile,
  RecommendationEvidence,
  SecurityImpact
} from "@/lib/adaptiveDelegation/types";
export { DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS } from "@/lib/adaptiveDelegation/types";
export {
  AdaptiveDelegationEngine,
  autoAllowKey,
  buildRecommendationFingerprint,
  trustProfileKey
} from "@/lib/adaptiveDelegation/engine";
export {
  buildEvidence,
  buildExplanation,
  calculateConfidence
} from "@/lib/adaptiveDelegation/confidence";
export {
  matchTrustProfiles,
  buildTrustProfileExplanation
} from "@/lib/adaptiveDelegation/profileMatching";
export {
  matchContextScopedPermissions,
  buildContextScopedExplanation
} from "@/lib/adaptiveDelegation/contextMatching";
export {
  extractAuthorizationContext,
  branchBucket,
  environmentBucket,
  listContextMatches
} from "@/lib/adaptiveDelegation/context";
export {
  matchOrgDelegationTemplates,
  buildOrgDelegationExplanation
} from "@/lib/adaptiveDelegation/orgMatching";
export {
  ORG_DELEGATION_TEMPLATES,
  ORG_RECOMMENDATION_AGENT_ID,
  getOrgDelegationTemplate,
  toOrgProfilePermissionInputs
} from "@/lib/adaptiveDelegation/orgTemplates";
export {
  TRUST_PROFILE_TEMPLATES,
  getTrustProfileTemplate,
  toProfilePermissionInputs
} from "@/lib/adaptiveDelegation/trustProfiles";
export { loadApprovalPatterns, loadContextPatterns } from "@/lib/adaptiveDelegation/history";
export type { ProposedOrgDelegation } from "@/lib/adaptiveDelegation/types";
export {
  acceptRecommendation,
  dismissRecommendation,
  listAdaptiveDelegationDashboard,
  markRecommendationViewed,
  postponeRecommendation,
  refreshAdaptiveDelegationRecommendations
} from "@/lib/adaptiveDelegation/service";
