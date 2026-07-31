/**
 * Mongo-backed admin analytics aggregations.
 * Kept under lib/repositories/mongo so production app/lib callers never import models.
 */

import type { PipelineStage } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ADMIN_ANALYTICS_DEFINITIONS } from "@/lib/adminAnalytics/definitions";
import {
  bucketKeyFormat,
  enumerateBuckets,
  fillBuckets,
  resolveAnalyticsRange,
  truncateUtc
} from "@/lib/adminAnalytics/range";
import type {
  AdminAnalyticsPayload,
  AdminAnalyticsRange,
  AgentVolumeRow,
  AnalyticsRate,
  BucketGranularity,
  CountSeriesPoint,
  ProviderAdoption,
  VerificationOutcome,
  VerificationSeriesPoint,
  WorkspaceVolumeRow
} from "@/lib/adminAnalytics/types";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import ApprovalRequest from "@/models/ApprovalRequest";
import DeveloperUser, { AUTH_PROVIDERS } from "@/models/DeveloperUser";
import VerificationLog from "@/models/VerificationLog";


/** Rankings are capped so a wide range can never return an unbounded table. */
export const TOP_N = 10;

/**
 * Phrases that mark a denial as an approval pause. Mirrors the regex in
 * lib/verificationLogs.ts so the analytics taxonomy matches the log list.
 */
const APPROVAL_REASON_PATTERN = "requires approval|approval required|approval before execution";

const UNKNOWN_PROVIDER = "unknown_legacy";

/* ------------------------------------------------------------------ *
 * Aggregation expressions
 * ------------------------------------------------------------------ */

/** Not shadow mode: matches shadow:false, shadow:null and a missing field. */
const ENFORCED = { $ne: ["$shadow", true] };
const SHADOW = { $eq: ["$shadow", true] };
const APPROVAL_GATE = {
  $or: [
    { $eq: ["$approvalRequired", true] },
    {
      $regexMatch: {
        input: { $ifNull: ["$reason", ""] },
        regex: APPROVAL_REASON_PATTERN,
        options: "i"
      }
    }
  ]
};
const ALLOWED = { $and: [ENFORCED, { $eq: ["$allowed", true] }] };
const DENIED = { $and: [ENFORCED, { $eq: ["$allowed", false] }, { $not: [APPROVAL_GATE] }] };
const APPROVAL_REQUIRED = { $and: [ENFORCED, { $eq: ["$allowed", false] }, APPROVAL_GATE] };
/** allowed is absent or not a boolean, so no outcome can be derived. */
const INDETERMINATE = { $and: [ENFORCED, { $ne: [{ $type: "$allowed" }, "bool"] }] };
const HIGH_RISK = { $and: [ENFORCED, { $eq: ["$risk", "high"] }] };

function count(expression: unknown) {
  return { $sum: { $cond: [expression, 1, 0] } };
}

const OUTCOME_ACCUMULATORS = {
  attempts: { $sum: 1 },
  enforced: count(ENFORCED),
  allowed: count(ALLOWED),
  denied: count(DENIED),
  approvalRequired: count(APPROVAL_REQUIRED),
  indeterminate: count(INDETERMINATE),
  shadow: count(SHADOW),
  highRisk: count(HIGH_RISK)
} as const;

function bucketExpression(granularity: BucketGranularity) {
  return {
    $dateToString: {
      date: "$createdAt",
      format: bucketKeyFormat(granularity),
      timezone: "UTC"
    }
  };
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/**
 * Builds a rate that carries its own denominator. A zero denominator yields
 * `null` rather than `0`, because "no traffic" is not "a 0% allow rate".
 */
function rate(numerator: number, denominator: number, denominatorField: string): AnalyticsRate {
  return {
    numerator,
    denominator,
    denominatorField,
    value: denominator > 0 ? Math.round((numerator / denominator) * 1e6) / 1e6 : null
  };
}

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

type OutcomeRow = VerificationOutcomeTotals;

const EMPTY_OUTCOMES: OutcomeRow = {
  attempts: 0,
  enforced: 0,
  allowed: 0,
  denied: 0,
  approvalRequired: 0,
  indeterminate: 0,
  shadow: 0,
  highRisk: 0
};

function normalizeOutcomes(row: Partial<OutcomeRow> | undefined | null): OutcomeRow {
  return {
    attempts: row?.attempts ?? 0,
    enforced: row?.enforced ?? 0,
    allowed: row?.allowed ?? 0,
    denied: row?.denied ?? 0,
    approvalRequired: row?.approvalRequired ?? 0,
    indeterminate: row?.indeterminate ?? 0,
    shadow: row?.shadow ?? 0,
    highRisk: row?.highRisk ?? 0
  };
}

/* ------------------------------------------------------------------ *
 * Degradation tracking
 * ------------------------------------------------------------------ */

class Degradations {
  private readonly reasons = new Set<string>();

  record(source: string, error: unknown) {
    this.reasons.add(`degraded:${source}`);
    logger.error("admin_analytics_aggregation_failed", {
      source,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  list() {
    return Array.from(this.reasons);
  }
}

async function safely<T>(
  source: string,
  degradations: Degradations,
  fallback: T,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    degradations.record(source, error);
    return fallback;
  }
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export type AdminAnalyticsQuery = {
  interval?: string | null;
  from?: string | null;
  to?: string | null;
  /** Optional workspace drill-down. Omit for the platform-wide view. */
  accountId?: string | null;
  now?: Date;
};

export type AdminAnalyticsResult =
  | { ok: true; payload: AdminAnalyticsPayload }
  | { ok: false; code: string; message: string };

export async function getAdminAnalytics(query: AdminAnalyticsQuery = {}): Promise<AdminAnalyticsResult> {
  await connectToDatabase();

  const accountId = query.accountId?.trim() || null;
  const logScope: Record<string, unknown> = accountId ? { accountId } : {};
  const degradations = new Degradations();

  // "all" is anchored to the oldest persisted event so the window is derived
  // from data rather than from an arbitrary constant.
  let earliestEventAt: Date | null = null;
  if ((query.interval?.trim() || "7d") === "all") {
    earliestEventAt = await safely("earliest_event", degradations, null, async () => {
      const oldest = await VerificationLog.findOne(logScope)
        .sort({ createdAt: 1 })
        .select("-_id createdAt")
        .lean<{ createdAt?: Date } | null>();
      return oldest?.createdAt ? new Date(oldest.createdAt) : null;
    });
  }

  const resolved = resolveAnalyticsRange({
    interval: query.interval,
    from: query.from,
    to: query.to,
    now: query.now,
    earliestEventAt
  });
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }

  const range = resolved.range;
  const start = new Date(range.start);
  const end = new Date(range.end);
  const seriesStart = new Date(range.seriesStart);
  const asOf = query.now ?? new Date();

  const periodWindow = { $gte: start, $lt: end };
  const seriesWindow = { $gte: seriesStart, $lt: end };
  const logMatch = { ...logScope, createdAt: periodWindow };
  const logSeriesMatch = { ...logScope, createdAt: seriesWindow };

  const [
    verificationFacet,
    verificationSeriesRows,
    activeAgentRows,
    signupRows,
    workspaceRows,
    agentRows,
    scalarCounts,
    approvals,
    providerRows,
    workspaceSso,
    latestVerificationAt
  ] = await Promise.all([
    aggregateVerificationFacet(logMatch, degradations),
    aggregateVerificationSeries(logSeriesMatch, range.granularity, degradations),
    aggregateActiveAgentSeries(logSeriesMatch, range.granularity, degradations),
    aggregateCreationSeries("signups", DeveloperUser, userScope(accountId), seriesWindow, range.granularity, degradations),
    aggregateCreationSeries("workspaces_created", Account, accountScope(accountId), seriesWindow, range.granularity, degradations),
    aggregateCreationSeries("agents_created", Agent, workspaceScope(accountId), seriesWindow, range.granularity, degradations),
    aggregateScalarCounts(accountId, periodWindow, degradations),
    aggregateApprovals(accountId, periodWindow, degradations),
    aggregateProviderAdoption(accountId, degradations),
    aggregateWorkspaceSso(accountId, degradations),
    safely("freshness", degradations, null as Date | null, async () => {
      const newest = await VerificationLog.findOne(logScope)
        .sort({ createdAt: -1 })
        .select("-_id createdAt")
        .lean<{ createdAt?: Date } | null>();
      return newest?.createdAt ? new Date(newest.createdAt) : null;
    })
  ]);

  const outcomes = verificationFacet.outcomes;
  const [topWorkspaces, topAgents] = await Promise.all([
    hydrateWorkspaceRows(verificationFacet.topWorkspaces, degradations),
    hydrateAgentRows(verificationFacet.topAgents, degradations)
  ]);

  const enforcedDenominator = "summary.verifications.enforced";
  const rates = {
    allowed: rate(outcomes.allowed, outcomes.enforced, enforcedDenominator),
    denied: rate(outcomes.denied, outcomes.enforced, enforcedDenominator),
    approvalRequired: rate(outcomes.approvalRequired, outcomes.enforced, enforcedDenominator),
    indeterminate: rate(outcomes.indeterminate, outcomes.enforced, enforcedDenominator),
    highRisk: rate(outcomes.highRisk, outcomes.enforced, enforcedDenominator),
    shadowShare: rate(outcomes.shadow, outcomes.attempts, "summary.verifications.attempts")
  };

  const partialReasons = [...degradations.list()];
  if (range.seriesTruncated) {
    partialReasons.push("series_truncated_to_bucket_cap");
  }
  if (end.getTime() > asOf.getTime()) {
    partialReasons.push("newest_bucket_incomplete");
  }

  const outcomeBreakdown: Array<{ outcome: VerificationOutcome; count: number; rate: AnalyticsRate }> = [
    { outcome: "allowed", count: outcomes.allowed, rate: rates.allowed },
    { outcome: "denied", count: outcomes.denied, rate: rates.denied },
    { outcome: "approval_required", count: outcomes.approvalRequired, rate: rates.approvalRequired },
    { outcome: "indeterminate", count: outcomes.indeterminate, rate: rates.indeterminate }
  ];

  return {
    ok: true,
    payload: {
      asOf: asOf.toISOString(),
      freshness: {
        latestVerificationAt: latestVerificationAt ? latestVerificationAt.toISOString() : null,
        lagSeconds: latestVerificationAt
          ? Math.max(0, Math.round((asOf.getTime() - latestVerificationAt.getTime()) / 1000))
          : null
      },
      range,
      scope: { accountId },
      partial: partialReasons.length > 0,
      partialReasons,
      definitions: ADMIN_ANALYTICS_DEFINITIONS,
      summary: {
        users: { total: scalarCounts.totalUsers, new: scalarCounts.newUsers },
        workspaces: { total: scalarCounts.totalWorkspaces, new: scalarCounts.newWorkspaces },
        agents: {
          total: scalarCounts.totalAgents,
          new: scalarCounts.newAgents,
          activeConfigured: scalarCounts.activeConfiguredAgents,
          activeInPeriod: verificationFacet.uniqueAgents
        },
        verifications: {
          attempts: outcomes.attempts,
          enforced: outcomes.enforced,
          allowed: outcomes.allowed,
          denied: outcomes.denied,
          approvalRequired: outcomes.approvalRequired,
          indeterminate: outcomes.indeterminate,
          shadow: outcomes.shadow,
          highRisk: outcomes.highRisk,
          uniqueAgents: verificationFacet.uniqueAgents,
          uniqueWorkspaces: verificationFacet.uniqueWorkspaces,
          rates
        },
        approvals
      },
      timeseries: {
        verifications: buildVerificationSeries(verificationSeriesRows, range),
        activeAgents: buildCountSeries(activeAgentRows, range),
        signups: buildCountSeries(signupRows, range),
        workspacesCreated: buildCountSeries(workspaceRows, range),
        agentsCreated: buildCountSeries(agentRows, range)
      },
      breakdowns: {
        outcomes: outcomeBreakdown,
        topWorkspaces,
        topAgents,
        providerAdoption: { ...providerRows, workspaceSso }
      }
    }
  };
}

/* ------------------------------------------------------------------ *
 * Scope helpers
 * ------------------------------------------------------------------ */

function userScope(accountId: string | null): Record<string, unknown> {
  return accountId ? { primaryAccountId: accountId } : {};
}

function accountScope(accountId: string | null): Record<string, unknown> {
  return accountId ? { accountId } : {};
}

function workspaceScope(accountId: string | null): Record<string, unknown> {
  return accountId ? { accountId } : {};
}

/* ------------------------------------------------------------------ *
 * Aggregations
 * ------------------------------------------------------------------ */

type VolumeGroupRow = {
  _id: string | null;
  attempts: number;
  allowed: number;
  denied: number;
  approvalRequired: number;
};

async function aggregateVerificationFacet(
  match: Record<string, unknown>,
  degradations: Degradations
) {
  const fallback = {
    outcomes: EMPTY_OUTCOMES,
    uniqueAgents: 0,
    uniqueWorkspaces: 0,
    topWorkspaces: [] as VolumeGroupRow[],
    topAgents: [] as VolumeGroupRow[]
  };

  return safely("verification_facet", degradations, fallback, async () => {
    const volumeAccumulators = {
      attempts: { $sum: 1 },
      allowed: count(ALLOWED),
      denied: count(DENIED),
      approvalRequired: count(APPROVAL_REQUIRED)
    };

    const result = await VerificationLog.aggregate<{
      outcomes: Array<Partial<OutcomeRow>>;
      uniqueAgents: Array<{ value: number }>;
      uniqueWorkspaces: Array<{ value: number }>;
      topWorkspaces: VolumeGroupRow[];
      topAgents: VolumeGroupRow[];
    }>([
      { $match: match },
      {
        $facet: {
          outcomes: [{ $group: { _id: null, ...OUTCOME_ACCUMULATORS } }],
          uniqueAgents: [
            { $group: { _id: "$agentId" } },
            { $count: "value" }
          ],
          uniqueWorkspaces: [
            { $match: { accountId: { $nin: [null, ""] } } },
            { $group: { _id: "$accountId" } },
            { $count: "value" }
          ],
          topWorkspaces: [
            { $group: { _id: "$accountId", ...volumeAccumulators } },
            { $sort: { attempts: -1, _id: 1 } },
            { $limit: TOP_N }
          ],
          topAgents: [
            { $group: { _id: "$agentId", ...volumeAccumulators } },
            { $sort: { attempts: -1, _id: 1 } },
            { $limit: TOP_N }
          ]
        }
      }
    ]);

    const facet = result[0];
    if (!facet) return fallback;
    return {
      outcomes: normalizeOutcomes(facet.outcomes[0]),
      uniqueAgents: facet.uniqueAgents[0]?.value ?? 0,
      uniqueWorkspaces: facet.uniqueWorkspaces[0]?.value ?? 0,
      topWorkspaces: facet.topWorkspaces ?? [],
      topAgents: facet.topAgents ?? []
    };
  });
}

type SeriesGroupRow = Partial<OutcomeRow> & { _id: string };

async function aggregateVerificationSeries(
  match: Record<string, unknown>,
  granularity: BucketGranularity,
  degradations: Degradations
): Promise<SeriesGroupRow[]> {
  return safely("verification_series", degradations, [], async () =>
    VerificationLog.aggregate<SeriesGroupRow>([
      { $match: match },
      { $group: { _id: bucketExpression(granularity), ...OUTCOME_ACCUMULATORS } },
      { $sort: { _id: 1 } }
    ])
  );
}

type CountGroupRow = { _id: string; count: number };

async function aggregateActiveAgentSeries(
  match: Record<string, unknown>,
  granularity: BucketGranularity,
  degradations: Degradations
): Promise<CountGroupRow[]> {
  return safely("active_agent_series", degradations, [], async () =>
    VerificationLog.aggregate<CountGroupRow>([
      { $match: match },
      { $group: { _id: { bucket: bucketExpression(granularity), agentId: "$agentId" } } },
      { $group: { _id: "$_id.bucket", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  );
}

/** Minimal shape of any Mongoose model that records a `createdAt` timestamp. */
type CreationModel = {
  aggregate: <R>(pipeline: PipelineStage[]) => PromiseLike<R[]>;
};

async function aggregateCreationSeries(
  source: string,
  model: CreationModel,
  scope: Record<string, unknown>,
  window: { $gte: Date; $lt: Date },
  granularity: BucketGranularity,
  degradations: Degradations
): Promise<CountGroupRow[]> {
  return safely(source, degradations, [], async () =>
    model.aggregate<CountGroupRow>([
      { $match: { ...scope, createdAt: window } },
      { $group: { _id: bucketExpression(granularity), count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  );
}

async function aggregateScalarCounts(
  accountId: string | null,
  window: { $gte: Date; $lt: Date },
  degradations: Degradations
) {
  const users = userScope(accountId);
  const accounts = accountScope(accountId);
  const agents = workspaceScope(accountId);

  return safely(
    "scalar_counts",
    degradations,
    {
      totalUsers: 0,
      newUsers: 0,
      totalWorkspaces: 0,
      newWorkspaces: 0,
      totalAgents: 0,
      newAgents: 0,
      activeConfiguredAgents: 0
    },
    async () => {
      const [
        totalUsers,
        newUsers,
        totalWorkspaces,
        newWorkspaces,
        totalAgents,
        newAgents,
        activeConfiguredAgents
      ] = await Promise.all([
        DeveloperUser.countDocuments(users),
        DeveloperUser.countDocuments({ ...users, createdAt: window }),
        Account.countDocuments(accounts),
        Account.countDocuments({ ...accounts, createdAt: window }),
        Agent.countDocuments(agents),
        Agent.countDocuments({ ...agents, createdAt: window }),
        Agent.countDocuments({ ...agents, status: "active" })
      ]);
      return {
        totalUsers,
        newUsers,
        totalWorkspaces,
        newWorkspaces,
        totalAgents,
        newAgents,
        activeConfiguredAgents
      };
    }
  );
}

async function aggregateApprovals(
  accountId: string | null,
  window: { $gte: Date; $lt: Date },
  degradations: Degradations
) {
  const scope = accountScope(accountId);
  return safely(
    "approvals",
    degradations,
    { createdInPeriod: 0, approvedInPeriod: 0, deniedInPeriod: 0, usedInPeriod: 0, pendingNow: 0 },
    async () => {
      const [createdInPeriod, approvedInPeriod, deniedInPeriod, usedInPeriod, pendingNow] =
        await Promise.all([
          ApprovalRequest.countDocuments({ ...scope, createdAt: window }),
          ApprovalRequest.countDocuments({
            ...scope,
            status: { $in: ["approved", "used"] },
            resolvedAt: window
          }),
          ApprovalRequest.countDocuments({ ...scope, status: "denied", resolvedAt: window }),
          ApprovalRequest.countDocuments({ ...scope, usedAt: window }),
          ApprovalRequest.countDocuments({ ...scope, status: "pending" })
        ]);
      return { createdInPeriod, approvedInPeriod, deniedInPeriod, usedInPeriod, pendingNow };
    }
  );
}

/**
 * Resolves the linked-identity collection if the auth layer ships one.
 *
 * Extension point: when a provider is added to the external identity model,
 * adoption picks it up with no change here. If the model is absent (or its
 * collection has not been created yet) adoption degrades to the credential
 * fields on DeveloperUser rather than failing.
 */
async function resolveExternalIdentityCollection(): Promise<{
  collectionName: string;
  providers: string[];
} | null> {
  try {
    const module = await import("@/models/ExternalIdentity");
    const collectionName = module.default?.collection?.name;
    if (!collectionName) return null;
    return {
      collectionName,
      providers: [...(module.EXTERNAL_IDENTITY_PROVIDERS ?? [])]
    };
  } catch {
    return null;
  }
}

/**
 * Sign-in method adoption, counted as distinct users per method.
 *
 * One pipeline over DeveloperUser derives each user's method set from three
 * sources — declared `authProviders`, the credential fields legacy rows
 * actually have, and linked external identities — and unions them per user, so
 * a user who has both a password and a linked provider is counted once under
 * each method and never twice under one.
 */
async function aggregateProviderAdoption(
  accountId: string | null,
  degradations: Degradations
): Promise<Omit<ProviderAdoption, "workspaceSso">> {
  const declaredProviders = new Set<string>(AUTH_PROVIDERS);
  const external = await resolveExternalIdentityCollection();
  for (const provider of external?.providers ?? []) declaredProviders.add(provider);

  const sources = ["developerUser.authProviders"];
  if (external) sources.push(`${external.collectionName}.provider`);

  const fallback: Omit<ProviderAdoption, "workspaceSso"> = {
    sources,
    methods: [],
    declaredWithoutUsers: [...declaredProviders]
  };

  return safely("provider_adoption", degradations, fallback, async () => {
    const linkStages: PipelineStage[] = external
      ? [
          {
            $lookup: {
              from: external.collectionName,
              localField: "userId",
              foreignField: "userId",
              as: "linkedIdentities",
              pipeline: [{ $project: { _id: 0, provider: 1 } }]
            }
          }
        ]
      : [];

    const rows = await DeveloperUser.aggregate<{ _id: string; users: number }>([
      { $match: userScope(accountId) },
      ...linkStages,
      {
        $project: {
          providers: {
            $let: {
              vars: {
                methods: {
                  $setUnion: [
                    { $ifNull: ["$authProviders", []] },
                    // Rows created before `authProviders` existed are
                    // classified from the credentials they actually hold.
                    { $cond: [{ $ifNull: ["$passwordHash", false] }, ["password"], []] },
                    { $cond: [{ $ifNull: ["$googleSub", false] }, ["google"], []] },
                    {
                      $map: {
                        input: { $ifNull: ["$linkedIdentities", []] },
                        as: "identity",
                        in: "$$identity.provider"
                      }
                    }
                  ]
                }
              },
              in: {
                $cond: [{ $gt: [{ $size: "$$methods" }, 0] }, "$$methods", [UNKNOWN_PROVIDER]]
              }
            }
          }
        }
      },
      { $unwind: "$providers" },
      { $group: { _id: "$providers", users: { $sum: 1 } } },
      { $sort: { users: -1, _id: 1 } }
    ]);

    const methods = rows.map((row) => ({ provider: row._id, users: row.users }));
    const seen = new Set(methods.map((method) => method.provider));
    return {
      sources,
      methods,
      declaredWithoutUsers: [...declaredProviders].filter((provider) => !seen.has(provider)).sort()
    };
  });
}

async function aggregateWorkspaceSso(accountId: string | null, degradations: Degradations) {
  const scope = accountScope(accountId);
  return safely("workspace_sso", degradations, { googleEnabled: 0, googleEnforced: 0 }, async () => {
    const [googleEnabled, googleEnforced] = await Promise.all([
      Account.countDocuments({ ...scope, "sso.enabled": true }),
      Account.countDocuments({ ...scope, "sso.enforce": true })
    ]);
    return { googleEnabled, googleEnforced };
  });
}

/* ------------------------------------------------------------------ *
 * Ranking hydration
 * ------------------------------------------------------------------ */

async function hydrateWorkspaceRows(
  rows: VolumeGroupRow[],
  degradations: Degradations
): Promise<WorkspaceVolumeRow[]> {
  const ids = rows.map((row) => row._id).filter((id): id is string => Boolean(id));
  const byId = new Map<string, { name?: string; slug?: string | null; plan?: string }>();
  if (ids.length) {
    await safely("top_workspace_names", degradations, undefined, async () => {
      const accounts = await Account.find({ accountId: { $in: ids } })
        .select("-_id accountId name slug plan")
        .lean<Array<{ accountId: string; name?: string; slug?: string | null; plan?: string }>>();
      for (const account of accounts) byId.set(account.accountId, account);
    });
  }

  return rows.map((row) => {
    const account = row._id ? byId.get(row._id) : undefined;
    return {
      accountId: row._id ?? null,
      name: account?.name ?? null,
      slug: account?.slug ?? null,
      plan: account?.plan ?? null,
      attempts: row.attempts ?? 0,
      allowed: row.allowed ?? 0,
      denied: row.denied ?? 0,
      approvalRequired: row.approvalRequired ?? 0
    };
  });
}

async function hydrateAgentRows(
  rows: VolumeGroupRow[],
  degradations: Degradations
): Promise<AgentVolumeRow[]> {
  const ids = rows.map((row) => row._id).filter((id): id is string => Boolean(id));
  const byId = new Map<string, { name?: string; accountId?: string | null }>();
  if (ids.length) {
    await safely("top_agent_names", degradations, undefined, async () => {
      const agents = await Agent.find({ agentId: { $in: ids } })
        .select("-_id agentId name accountId")
        .lean<Array<{ agentId: string; name?: string; accountId?: string | null }>>();
      for (const agent of agents) byId.set(agent.agentId, agent);
    });
  }

  return rows
    .filter((row): row is VolumeGroupRow & { _id: string } => Boolean(row._id))
    .map((row) => {
      const agent = byId.get(row._id);
      return {
        agentId: row._id,
        name: agent?.name ?? null,
        accountId: agent?.accountId ?? null,
        attempts: row.attempts ?? 0,
        allowed: row.allowed ?? 0,
        denied: row.denied ?? 0,
        approvalRequired: row.approvalRequired ?? 0
      };
    });
}

/* ------------------------------------------------------------------ *
 * Series assembly
 * ------------------------------------------------------------------ */

function buildVerificationSeries(
  rows: SeriesGroupRow[],
  range: AdminAnalyticsRange
): VerificationSeriesPoint[] {
  return fillBuckets(rows, {
    seriesStart: new Date(range.seriesStart),
    seriesEnd: new Date(range.seriesEnd),
    granularity: range.granularity,
    keyOf: (row) => row._id,
    build: (bucketStart, row) => {
      const outcomes = normalizeOutcomes(row);
      return {
        bucketStart: bucketStart.toISOString(),
        attempts: outcomes.attempts,
        enforced: outcomes.enforced,
        allowed: outcomes.allowed,
        denied: outcomes.denied,
        approvalRequired: outcomes.approvalRequired,
        indeterminate: outcomes.indeterminate,
        shadow: outcomes.shadow
      };
    }
  });
}

function buildCountSeries(rows: CountGroupRow[], range: AdminAnalyticsRange): CountSeriesPoint[] {
  return fillBuckets(rows, {
    seriesStart: new Date(range.seriesStart),
    seriesEnd: new Date(range.seriesEnd),
    granularity: range.granularity,
    keyOf: (row) => row._id,
    build: (bucketStart, row) => ({
      bucketStart: bucketStart.toISOString(),
      count: row?.count ?? 0
    })
  });
}

/* ------------------------------------------------------------------ *
 * Shared rollups
 *
 * The console health summary needs the same taxonomy as the analytics
 * dashboard over a different window. It reuses these helpers rather than
 * re-deriving outcomes, so the two surfaces cannot disagree.
 * ------------------------------------------------------------------ */

/** The current UTC calendar day as a half-open window. */
export function utcDayWindow(now = new Date()): { start: Date; end: Date } {
  const start = truncateUtc(now, "day");
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Outcome totals for one window, computed entirely in the database.
 * Returns null when the aggregation is unavailable so callers can decide
 * whether to degrade or fail.
 */
export async function getVerificationOutcomeTotals(options: {
  start: Date;
  end: Date;
  accountId?: string | null;
}): Promise<VerificationOutcomeTotals | null> {
  const match: Record<string, unknown> = {
    createdAt: { $gte: options.start, $lt: options.end }
  };
  if (options.accountId) match.accountId = options.accountId;

  try {
    const rows = await VerificationLog.aggregate<Partial<OutcomeRow>>([
      { $match: match },
      { $group: { _id: null, ...OUTCOME_ACCUMULATORS } }
    ]);
    return normalizeOutcomes(rows[0]);
  } catch (error) {
    logger.error("admin_analytics_aggregation_failed", {
      source: "outcome_totals",
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Dense, UTC-aligned verification series for an arbitrary window.
 * Missing buckets are returned as zeros.
 */
export async function getVerificationSeries(options: {
  start: Date;
  end: Date;
  granularity: BucketGranularity;
  accountId?: string | null;
}): Promise<VerificationSeriesPoint[]> {
  const match: Record<string, unknown> = {
    createdAt: { $gte: options.start, $lt: options.end }
  };
  if (options.accountId) match.accountId = options.accountId;

  let rows: SeriesGroupRow[] = [];
  try {
    rows = await VerificationLog.aggregate<SeriesGroupRow>([
      { $match: match },
      { $group: { _id: bucketExpression(options.granularity), ...OUTCOME_ACCUMULATORS } },
      { $sort: { _id: 1 } }
    ]);
  } catch (error) {
    logger.error("admin_analytics_aggregation_failed", {
      source: "outcome_series",
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return fillBuckets(rows, {
    seriesStart: options.start,
    seriesEnd: options.end,
    granularity: options.granularity,
    keyOf: (row) => row._id,
    build: (bucketStart, row) => {
      const outcomes = normalizeOutcomes(row);
      return {
        bucketStart: bucketStart.toISOString(),
        attempts: outcomes.attempts,
        enforced: outcomes.enforced,
        allowed: outcomes.allowed,
        denied: outcomes.denied,
        approvalRequired: outcomes.approvalRequired,
        indeterminate: outcomes.indeterminate,
        shadow: outcomes.shadow
      };
    }
  });
}

/** Exported for tests that assert bucket alignment without hitting a database. */
export { enumerateBuckets };
