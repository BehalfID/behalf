/**
 * Shared admin analytics types.
 *
 * Kept free of server-only imports so client components can import them
 * without pulling Mongoose into the browser bundle.
 */

export const ADMIN_ANALYTICS_INTERVALS = ["24h", "7d", "30d", "90d", "all", "custom"] as const;
export type AdminAnalyticsInterval = (typeof ADMIN_ANALYTICS_INTERVALS)[number];

export type BucketGranularity = "hour" | "day";

/**
 * A rate always ships its own numerator and denominator so the UI never has to
 * guess which population it was computed against. `value` is a fraction in
 * `[0, 1]`, or `null` when the denominator is zero (an undefined rate is never
 * reported as `0`).
 */
export type AnalyticsRate = {
  numerator: number;
  denominator: number;
  denominatorField: string;
  value: number | null;
};

export type VerificationOutcome = "allowed" | "denied" | "approval_required" | "indeterminate";

/** Outcome rollup used by the console health summary and analytics cards. */
export type VerificationOutcomeTotals = {
  attempts: number;
  enforced: number;
  allowed: number;
  denied: number;
  approvalRequired: number;
  indeterminate: number;
  shadow: number;
  highRisk: number;
};

export type AdminAnalyticsRange = {
  interval: AdminAnalyticsInterval;
  /** Inclusive lower bound, UTC. */
  start: string;
  /** Exclusive upper bound, UTC. */
  end: string;
  granularity: BucketGranularity;
  timezone: "UTC";
  /** Series window; equals `start` unless the series had to be clamped. */
  seriesStart: string;
  seriesEnd: string;
  seriesTruncated: boolean;
  bucketCount: number;
};

export type VerificationSeriesPoint = {
  bucketStart: string;
  attempts: number;
  enforced: number;
  allowed: number;
  denied: number;
  approvalRequired: number;
  indeterminate: number;
  shadow: number;
};

export type CountSeriesPoint = {
  bucketStart: string;
  count: number;
};

export type WorkspaceVolumeRow = {
  accountId: string | null;
  name: string | null;
  slug: string | null;
  plan: string | null;
  attempts: number;
  allowed: number;
  denied: number;
  approvalRequired: number;
};

export type AgentVolumeRow = {
  agentId: string;
  name: string | null;
  accountId: string | null;
  attempts: number;
  allowed: number;
  denied: number;
  approvalRequired: number;
};

export type ProviderAdoption = {
  /**
   * Which persisted collections contributed, so the UI can label the graph
   * honestly instead of implying it counts sign-in events.
   */
  sources: string[];
  /** Distinct users per sign-in method. A user with several methods appears in each. */
  methods: Array<{ provider: string; users: number }>;
  workspaceSso: { googleEnabled: number; googleEnforced: number };
  /**
   * Providers declared by the auth layer that have no linked users yet.
   * Rendered as explicit zero rows rather than hidden, so a newly shipped
   * provider is visible the moment it is declared.
   */
  declaredWithoutUsers: string[];
};

export type AdminAnalyticsSummary = {
  users: { total: number; new: number };
  workspaces: { total: number; new: number };
  agents: {
    total: number;
    new: number;
    activeConfigured: number;
    activeInPeriod: number;
  };
  verifications: {
    attempts: number;
    enforced: number;
    allowed: number;
    denied: number;
    approvalRequired: number;
    indeterminate: number;
    shadow: number;
    highRisk: number;
    uniqueAgents: number;
    uniqueWorkspaces: number;
    rates: {
      allowed: AnalyticsRate;
      denied: AnalyticsRate;
      approvalRequired: AnalyticsRate;
      indeterminate: AnalyticsRate;
      shadowShare: AnalyticsRate;
      highRisk: AnalyticsRate;
    };
  };
  approvals: {
    createdInPeriod: number;
    approvedInPeriod: number;
    deniedInPeriod: number;
    usedInPeriod: number;
    pendingNow: number;
  };
};

export type AdminAnalyticsPayload = {
  /** When this payload was computed (server clock, UTC). */
  asOf: string;
  freshness: {
    latestVerificationAt: string | null;
    /** Seconds between `latestVerificationAt` and `asOf`; null when no data. */
    lagSeconds: number | null;
  };
  range: AdminAnalyticsRange;
  scope: { accountId: string | null };
  /**
   * True when any part of the payload is knowingly incomplete. Reasons are
   * enumerated so the UI can explain itself instead of showing a bare warning.
   */
  partial: boolean;
  partialReasons: string[];
  definitions: Record<string, string>;
  summary: AdminAnalyticsSummary;
  timeseries: {
    verifications: VerificationSeriesPoint[];
    activeAgents: CountSeriesPoint[];
    signups: CountSeriesPoint[];
    workspacesCreated: CountSeriesPoint[];
    agentsCreated: CountSeriesPoint[];
  };
  breakdowns: {
    outcomes: Array<{ outcome: VerificationOutcome; count: number; rate: AnalyticsRate }>;
    topWorkspaces: WorkspaceVolumeRow[];
    topAgents: AgentVolumeRow[];
    providerAdoption: ProviderAdoption;
  };
};
