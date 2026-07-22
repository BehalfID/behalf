/**
 * Adaptive Delegation types.
 *
 * Recommendations are advisory only. They never authorize actions, modify
 * permissions, or bypass verifyAction(). Acceptance always requires an
 * explicit human decision that goes through existing permission mutation paths.
 */

export type AdaptiveDelegationRecommendationKind =
  | "reusable_permission"
  | "trust_profile"
  | "context_scoped_permission"
  | "organization_delegation";

export type AdaptiveDelegationRecommendationStatus =
  | "active"
  | "postponed"
  | "accepted"
  | "dismissed"
  | "superseded";

export type AdaptiveDelegationDismissReason = "keep_manual" | "never_suggest";

export type AdaptiveDelegationEventType =
  | "recommendation_generated"
  | "recommendation_viewed"
  | "recommendation_accepted"
  | "recommendation_dismissed"
  | "recommendation_postponed";

export type ConfidenceFactor = {
  code: string;
  label: string;
  delta: number;
  polarity: "positive" | "negative";
};

export type RecommendationEvidence = {
  approvedCount: number;
  deniedCount: number;
  usedCount: number;
  pendingCount: number;
  approvalRequiredLogCount: number;
  distinctAgents: number;
  distinctResources: number;
  sameAgent: boolean;
  sameResource: boolean;
  historyDays: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sampleApprovalIds: string[];
  /** Stage 5 context breakdown. */
  context?: {
    dimension: "branch" | "environment" | "repository";
    safeValues: string[];
    protectedValues: string[];
    safeApprovedCount: number;
    protectedApprovedCount: number;
    protectedDeniedCount: number;
  };
};

export type ProposedPermissionConstraints = {
  allowedBranches?: string[];
  deniedBranches?: string[];
  allowedEnvironments?: string[];
  deniedEnvironments?: string[];
  allowedRepositories?: string[];
  deniedRepositories?: string[];
};

export type ProposedPermission = {
  action: string;
  resource?: string;
  scope?: string;
  requiresApproval: boolean;
  notes: string;
  description: string;
  constraints?: ProposedPermissionConstraints;
};

export type ProposedTrustProfilePermission = {
  action: string;
  resource?: string;
  requiresApproval: boolean;
  blockedActions?: string[];
  notes?: string;
};

export type ProposedTrustProfile = {
  templateId: string;
  name: string;
  description: string;
  resourceScope: string;
  matchedActions: string[];
  unmatchedActions: string[];
  coveragePercent: number;
  permissions: ProposedTrustProfilePermission[];
};

export type ProposedOrgDelegation = {
  templateId: string;
  name: string;
  description: string;
  department: string;
  minAcceptAuthorityLevel: number;
  agentIds: string[];
  agentLabels: string[];
  matchedActions: string[];
  unmatchedActions: string[];
  coveragePercent: number;
  permissions: ProposedTrustProfilePermission[];
};

export type SecurityImpact = {
  summary: string;
  authorityLevel: number;
  removesApprovalGate: boolean;
  riskNotes: string[];
};

export type AdaptiveDelegationRecommendationView = {
  recommendationId: string;
  accountId: string;
  agentId: string;
  agentName?: string | null;
  kind: AdaptiveDelegationRecommendationKind;
  status: AdaptiveDelegationRecommendationStatus;
  action: string;
  resource: string | null;
  confidence: number;
  explanation: string;
  factors: ConfidenceFactor[];
  evidence: RecommendationEvidence;
  proposedPermission?: ProposedPermission | null;
  proposedTrustProfile?: ProposedTrustProfile | null;
  proposedOrgDelegation?: ProposedOrgDelegation | null;
  affectedTools: string[];
  affectedResources: string[];
  estimatedApprovalReduction: number;
  securityImpact: SecurityImpact;
  rollbackInstructions: string;
  fingerprint: string;
  dismissReason?: AdaptiveDelegationDismissReason | null;
  remindAt?: string | null;
  acceptedPermissionId?: string | null;
  acceptedProfileId?: string | null;
  acceptedAgentIds?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AdaptiveDelegationStats = {
  activeRecommendations: number;
  acceptedRecommendations: number;
  dismissedRecommendations: number;
  postponedRecommendations: number;
  estimatedApprovalReduction: number;
  activePermissionRecommendations: number;
  activeTrustProfileRecommendations: number;
  activeContextRecommendations: number;
  activeOrgRecommendations: number;
  frequentlyApproved: Array<{ action: string; resource: string | null; count: number }>;
  frequentlyDenied: Array<{ action: string; resource: string | null; count: number }>;
};

export type AdaptiveDelegationThresholds = {
  /** Minimum approvals before a pattern is eligible. */
  minApprovals: number;
  /** Minimum confidence (0–100) to surface a recommendation. */
  minConfidence: number;
  /** Lookback window in days for approval / verification history. */
  lookbackDays: number;
  /** Default postpone duration in days. */
  postponeDays: number;
  /** Minimum fraction of trust-profile actions that must match (0–1). */
  minProfileCoverage: number;
  /** Minimum number of distinct matched profile actions. */
  minProfileMatchedActions: number;
  /** Minimum approvals in a safe context slice for Stage 5. */
  minContextApprovals: number;
  /** Minimum distinct agents for Stage 6 org recommendations. */
  minOrgAgents: number;
};

export const DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS: AdaptiveDelegationThresholds = {
  minApprovals: 5,
  minConfidence: 70,
  lookbackDays: 90,
  postponeDays: 7,
  minProfileCoverage: 0.6,
  minProfileMatchedActions: 2,
  minContextApprovals: 5,
  minOrgAgents: 2
};

export type ApprovalPatternKey = {
  accountId: string;
  agentId: string;
  action: string;
  resource: string | null;
};

export type ApprovalPatternAggregate = ApprovalPatternKey & {
  approvedCount: number;
  deniedCount: number;
  usedCount: number;
  pendingCount: number;
  approvalRequiredLogCount: number;
  resources: string[];
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  sampleApprovalIds: string[];
  permissionId: string | null;
};

/** Stage 5 — per-action context slice of approval outcomes. */
export type ContextPatternAggregate = {
  accountId: string;
  agentId: string;
  action: string;
  dimension: "branch" | "environment" | "repository";
  value: string;
  protected: boolean;
  approvedCount: number;
  deniedCount: number;
  usedCount: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  sampleApprovalIds: string[];
};
