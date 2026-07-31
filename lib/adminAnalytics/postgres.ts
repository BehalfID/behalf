/**
 * Postgres/Drizzle admin analytics aggregations.
 * Verification logs are partitioned — always filter by created_at windows.
 */

import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getPostgresDb } from "@/lib/db/postgres";
import {
  accounts,
  agents,
  approvalRequests,
  developerUsers,
  verificationLogs
} from "@/lib/db/postgres/schema";
import { ADMIN_ANALYTICS_DEFINITIONS } from "@/lib/adminAnalytics/definitions";
import { fillBuckets, resolveAnalyticsRange } from "@/lib/adminAnalytics/range";
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
import { LOGIN_METHODS } from "@/lib/authProviders/loginMethods";
import { EXTERNAL_IDENTITY_PROVIDERS } from "@/lib/db/postgres/enums";
import { logger } from "@/lib/logger";

export const TOP_N = 10;
const APPROVAL_REASON_PATTERN = "requires approval|approval required|approval before execution";
const AUTH_PROVIDERS = LOGIN_METHODS;

type OutcomeRow = {
  attempts: number;
  enforced: number;
  allowed: number;
  denied: number;
  approvalRequired: number;
  indeterminate: number;
  shadow: number;
  highRisk: number;
};

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
    attempts: Number(row?.attempts ?? 0),
    enforced: Number(row?.enforced ?? 0),
    allowed: Number(row?.allowed ?? 0),
    denied: Number(row?.denied ?? 0),
    approvalRequired: Number(row?.approvalRequired ?? 0),
    indeterminate: Number(row?.indeterminate ?? 0),
    shadow: Number(row?.shadow ?? 0),
    highRisk: Number(row?.highRisk ?? 0)
  };
}

function rate(numerator: number, denominator: number, denominatorField: string): AnalyticsRate {
  return {
    numerator,
    denominator,
    denominatorField,
    value: denominator > 0 ? Math.round((numerator / denominator) * 1e6) / 1e6 : null
  };
}

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

function bucketSql(granularity: BucketGranularity) {
  return granularity === "hour"
    ? sql<string>`to_char(${verificationLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24')`
    : sql<string>`to_char(${verificationLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
}

function outcomeSelect() {
  const enforced = sql`${verificationLogs.shadow} IS NOT TRUE`;
  const approvalGate = sql`(
    ${verificationLogs.approvalRequired} = true
    OR coalesce(${verificationLogs.reason}, '') ~* ${APPROVAL_REASON_PATTERN}
  )`;
  return {
    attempts: sql<number>`count(*)::int`,
    enforced: sql<number>`count(*) FILTER (WHERE ${enforced})::int`,
    allowed: sql<number>`count(*) FILTER (WHERE ${enforced} AND ${verificationLogs.allowed} = true)::int`,
    denied: sql<number>`count(*) FILTER (WHERE ${enforced} AND ${verificationLogs.allowed} = false AND NOT ${approvalGate})::int`,
    approvalRequired: sql<number>`count(*) FILTER (WHERE ${enforced} AND ${verificationLogs.allowed} = false AND ${approvalGate})::int`,
    indeterminate: sql<number>`0::int`,
    shadow: sql<number>`count(*) FILTER (WHERE ${verificationLogs.shadow} = true)::int`,
    highRisk: sql<number>`count(*) FILTER (WHERE ${enforced} AND ${verificationLogs.risk} = 'high')::int`
  };
}

function volumeSelect() {
  const enforced = sql`${verificationLogs.shadow} IS NOT TRUE`;
  const approvalGate = sql`(
    ${verificationLogs.approvalRequired} = true
    OR coalesce(${verificationLogs.reason}, '') ~* ${APPROVAL_REASON_PATTERN}
  )`;
  return {
    attempts: sql<number>`count(*)::int`,
    allowed: sql<number>`count(*) FILTER (WHERE ${enforced} AND ${verificationLogs.allowed} = true)::int`,
    denied: sql<number>`count(*) FILTER (WHERE ${enforced} AND ${verificationLogs.allowed} = false AND NOT ${approvalGate})::int`,
    approvalRequired: sql<number>`count(*) FILTER (WHERE ${enforced} AND ${verificationLogs.allowed} = false AND ${approvalGate})::int`
  };
}

function logWindow(accountId: string | null, start: Date, end: Date) {
  const parts = [gte(verificationLogs.createdAt, start), lt(verificationLogs.createdAt, end)];
  if (accountId) parts.push(eq(verificationLogs.accountId, accountId));
  return and(...parts);
}

export type AdminAnalyticsQuery = {
  interval?: string | null;
  from?: string | null;
  to?: string | null;
  accountId?: string | null;
  now?: Date;
};

export type AdminAnalyticsResult =
  | { ok: true; payload: AdminAnalyticsPayload }
  | { ok: false; code: string; message: string };

type VolumeGroupRow = {
  _id: string | null;
  attempts: number;
  allowed: number;
  denied: number;
  approvalRequired: number;
};

type SeriesGroupRow = Partial<OutcomeRow> & { _id: string };
type CountGroupRow = { _id: string; count: number };

export async function getAdminAnalytics(query: AdminAnalyticsQuery = {}): Promise<AdminAnalyticsResult> {
  const db = getPostgresDb();
  const accountId = query.accountId?.trim() || null;
  const degradations = new Degradations();

  let earliestEventAt: Date | null = null;
  if ((query.interval?.trim() || "7d") === "all") {
    earliestEventAt = await safely("earliest_event", degradations, null, async () => {
      const where = accountId ? eq(verificationLogs.accountId, accountId) : undefined;
      const [row] = await db
        .select({ createdAt: verificationLogs.createdAt })
        .from(verificationLogs)
        .where(where)
        .orderBy(verificationLogs.createdAt)
        .limit(1);
      return row?.createdAt ? new Date(row.createdAt) : null;
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
    aggregateVerificationFacet(accountId, start, end, degradations),
    aggregateVerificationSeries(accountId, seriesStart, end, range.granularity, degradations),
    aggregateActiveAgentSeries(accountId, seriesStart, end, range.granularity, degradations),
    aggregateCreationSeries("signups", "users", accountId, seriesStart, end, range.granularity, degradations),
    aggregateCreationSeries("workspaces_created", "accounts", accountId, seriesStart, end, range.granularity, degradations),
    aggregateCreationSeries("agents_created", "agents", accountId, seriesStart, end, range.granularity, degradations),
    aggregateScalarCounts(accountId, start, end, degradations),
    aggregateApprovals(accountId, start, end, degradations),
    aggregateProviderAdoption(accountId, degradations),
    aggregateWorkspaceSso(accountId, degradations),
    safely("freshness", degradations, null as Date | null, async () => {
      const where = accountId ? eq(verificationLogs.accountId, accountId) : undefined;
      const [row] = await db
        .select({ createdAt: verificationLogs.createdAt })
        .from(verificationLogs)
        .where(where)
        .orderBy(sql`${verificationLogs.createdAt} DESC`)
        .limit(1);
      return row?.createdAt ? new Date(row.createdAt) : null;
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
  if (range.seriesTruncated) partialReasons.push("series_truncated_to_bucket_cap");
  if (end.getTime() > asOf.getTime()) partialReasons.push("newest_bucket_incomplete");

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

async function aggregateVerificationFacet(
  accountId: string | null,
  start: Date,
  end: Date,
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
    const db = getPostgresDb();
    const where = logWindow(accountId, start, end);
    const [[outcomesRow], [uniqueAgents], [uniqueWorkspaces], topWorkspaces, topAgents] =
      await Promise.all([
        db.select(outcomeSelect()).from(verificationLogs).where(where),
        db
          .select({ value: sql<number>`count(distinct ${verificationLogs.agentId})::int` })
          .from(verificationLogs)
          .where(where),
        db
          .select({
            value: sql<number>`count(distinct ${verificationLogs.accountId}) FILTER (WHERE ${verificationLogs.accountId} IS NOT NULL AND ${verificationLogs.accountId} <> '')::int`
          })
          .from(verificationLogs)
          .where(where),
        db
          .select({ _id: verificationLogs.accountId, ...volumeSelect() })
          .from(verificationLogs)
          .where(where)
          .groupBy(verificationLogs.accountId)
          .orderBy(sql`count(*) DESC`, verificationLogs.accountId)
          .limit(TOP_N),
        db
          .select({ _id: verificationLogs.agentId, ...volumeSelect() })
          .from(verificationLogs)
          .where(where)
          .groupBy(verificationLogs.agentId)
          .orderBy(sql`count(*) DESC`, verificationLogs.agentId)
          .limit(TOP_N)
      ]);

    return {
      outcomes: normalizeOutcomes(outcomesRow),
      uniqueAgents: Number(uniqueAgents?.value ?? 0),
      uniqueWorkspaces: Number(uniqueWorkspaces?.value ?? 0),
      topWorkspaces: topWorkspaces.map((row) => ({
        _id: row._id,
        attempts: Number(row.attempts),
        allowed: Number(row.allowed),
        denied: Number(row.denied),
        approvalRequired: Number(row.approvalRequired)
      })),
      topAgents: topAgents.map((row) => ({
        _id: row._id,
        attempts: Number(row.attempts),
        allowed: Number(row.allowed),
        denied: Number(row.denied),
        approvalRequired: Number(row.approvalRequired)
      }))
    };
  });
}

async function aggregateVerificationSeries(
  accountId: string | null,
  start: Date,
  end: Date,
  granularity: BucketGranularity,
  degradations: Degradations
): Promise<SeriesGroupRow[]> {
  return safely("verification_series", degradations, [], async () => {
    const db = getPostgresDb();
    const bucket = bucketSql(granularity);
    const rows = await db
      .select({ _id: bucket, ...outcomeSelect() })
      .from(verificationLogs)
      .where(logWindow(accountId, start, end))
      .groupBy(bucket)
      .orderBy(bucket);
    return rows.map((row) => ({ ...normalizeOutcomes(row), _id: row._id }));
  });
}

async function aggregateActiveAgentSeries(
  accountId: string | null,
  start: Date,
  end: Date,
  granularity: BucketGranularity,
  degradations: Degradations
): Promise<CountGroupRow[]> {
  return safely("active_agent_series", degradations, [], async () => {
    const db = getPostgresDb();
    const bucket = bucketSql(granularity);
    const fmt = granularity === "hour" ? 'YYYY-MM-DD"T"HH24' : "YYYY-MM-DD";
    const accountClause = accountId ? sql`AND account_id = ${accountId}` : sql``;
    const rows = await db.execute(sql`
      SELECT bucket AS _id, count(*)::int AS count
      FROM (
        SELECT to_char(created_at AT TIME ZONE 'UTC', ${fmt}) AS bucket, agent_id
        FROM verification_logs
        WHERE created_at >= ${start} AND created_at < ${end} ${accountClause}
        GROUP BY 1, 2
      ) distinct_agents
      GROUP BY bucket
      ORDER BY bucket
    `);
    return (rows as unknown as CountGroupRow[]).map((row) => ({
      _id: String(row._id),
      count: Number(row.count)
    }));
  });
}

async function aggregateCreationSeries(
  source: string,
  kind: "users" | "accounts" | "agents",
  accountId: string | null,
  start: Date,
  end: Date,
  granularity: BucketGranularity,
  degradations: Degradations
): Promise<CountGroupRow[]> {
  return safely(source, degradations, [], async () => {
    const db = getPostgresDb();
    const fmt = granularity === "hour" ? 'YYYY-MM-DD"T"HH24' : "YYYY-MM-DD";
    const table =
      kind === "users" ? "developer_users" : kind === "accounts" ? "accounts" : "agents";
    const scope =
      kind === "users"
        ? accountId
          ? sql`AND primary_account_id = ${accountId}`
          : sql``
        : accountId
          ? sql`AND account_id = ${accountId}`
          : sql``;
    const rows = await db.execute(sql`
      SELECT to_char(created_at AT TIME ZONE 'UTC', ${fmt}) AS _id, count(*)::int AS count
      FROM ${sql.raw(table)}
      WHERE created_at >= ${start} AND created_at < ${end} ${scope}
      GROUP BY 1 ORDER BY 1
    `);
    return (rows as unknown as CountGroupRow[]).map((r) => ({
      _id: String(r._id),
      count: Number(r.count)
    }));
  });
}

async function aggregateScalarCounts(
  accountId: string | null,
  start: Date,
  end: Date,
  degradations: Degradations
) {
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
      const db = getPostgresDb();
      const userScope = accountId ? eq(developerUsers.primaryAccountId, accountId) : undefined;
      const accountScope = accountId ? eq(accounts.accountId, accountId) : undefined;
      const agentScope = accountId ? eq(agents.accountId, accountId) : undefined;

      const [
        [totalUsers],
        [newUsers],
        [totalWorkspaces],
        [newWorkspaces],
        [totalAgents],
        [newAgents],
        [activeConfiguredAgents]
      ] = await Promise.all([
        db.select({ value: count() }).from(developerUsers).where(userScope),
        db
          .select({ value: count() })
          .from(developerUsers)
          .where(and(userScope, gte(developerUsers.createdAt, start), lt(developerUsers.createdAt, end))),
        db.select({ value: count() }).from(accounts).where(accountScope),
        db
          .select({ value: count() })
          .from(accounts)
          .where(and(accountScope, gte(accounts.createdAt, start), lt(accounts.createdAt, end))),
        db.select({ value: count() }).from(agents).where(agentScope),
        db
          .select({ value: count() })
          .from(agents)
          .where(and(agentScope, gte(agents.createdAt, start), lt(agents.createdAt, end))),
        db.select({ value: count() }).from(agents).where(and(agentScope, eq(agents.status, "active")))
      ]);

      return {
        totalUsers: Number(totalUsers?.value ?? 0),
        newUsers: Number(newUsers?.value ?? 0),
        totalWorkspaces: Number(totalWorkspaces?.value ?? 0),
        newWorkspaces: Number(newWorkspaces?.value ?? 0),
        totalAgents: Number(totalAgents?.value ?? 0),
        newAgents: Number(newAgents?.value ?? 0),
        activeConfiguredAgents: Number(activeConfiguredAgents?.value ?? 0)
      };
    }
  );
}

async function aggregateApprovals(
  accountId: string | null,
  start: Date,
  end: Date,
  degradations: Degradations
) {
  return safely(
    "approvals",
    degradations,
    { createdInPeriod: 0, approvedInPeriod: 0, deniedInPeriod: 0, usedInPeriod: 0, pendingNow: 0 },
    async () => {
      const db = getPostgresDb();
      const scope = accountId ? eq(approvalRequests.accountId, accountId) : undefined;
      const [
        [createdInPeriod],
        [approvedInPeriod],
        [deniedInPeriod],
        [usedInPeriod],
        [pendingNow]
      ] = await Promise.all([
        db
          .select({ value: count() })
          .from(approvalRequests)
          .where(and(scope, gte(approvalRequests.createdAt, start), lt(approvalRequests.createdAt, end))),
        db
          .select({ value: count() })
          .from(approvalRequests)
          .where(
            and(
              scope,
              inArray(approvalRequests.status, ["approved", "used"]),
              gte(approvalRequests.resolvedAt, start),
              lt(approvalRequests.resolvedAt, end)
            )
          ),
        db
          .select({ value: count() })
          .from(approvalRequests)
          .where(
            and(
              scope,
              eq(approvalRequests.status, "denied"),
              gte(approvalRequests.resolvedAt, start),
              lt(approvalRequests.resolvedAt, end)
            )
          ),
        db
          .select({ value: count() })
          .from(approvalRequests)
          .where(and(scope, gte(approvalRequests.usedAt, start), lt(approvalRequests.usedAt, end))),
        db
          .select({ value: count() })
          .from(approvalRequests)
          .where(and(scope, eq(approvalRequests.status, "pending")))
      ]);

      return {
        createdInPeriod: Number(createdInPeriod?.value ?? 0),
        approvedInPeriod: Number(approvedInPeriod?.value ?? 0),
        deniedInPeriod: Number(deniedInPeriod?.value ?? 0),
        usedInPeriod: Number(usedInPeriod?.value ?? 0),
        pendingNow: Number(pendingNow?.value ?? 0)
      };
    }
  );
}

async function aggregateProviderAdoption(
  accountId: string | null,
  degradations: Degradations
): Promise<Omit<ProviderAdoption, "workspaceSso">> {
  const declaredProviders = new Set<string>([...AUTH_PROVIDERS, ...EXTERNAL_IDENTITY_PROVIDERS]);
  const sources = ["developerUser.authProviders", "external_identities.provider"];
  const fallback: Omit<ProviderAdoption, "workspaceSso"> = {
    sources,
    methods: [],
    declaredWithoutUsers: [...declaredProviders]
  };

  return safely("provider_adoption", degradations, fallback, async () => {
    const db = getPostgresDb();
    const scope = accountId ? sql`AND u.primary_account_id = ${accountId}` : sql``;
    const rows = await db.execute(sql`
      SELECT provider, count(DISTINCT user_id)::int AS users
      FROM (
        SELECT u.user_id, jsonb_array_elements_text(coalesce(u.auth_providers, '[]'::jsonb)) AS provider
        FROM developer_users u
        WHERE TRUE ${scope}
        UNION ALL
        SELECT u.user_id, 'password' FROM developer_users u WHERE u.password_hash IS NOT NULL ${scope}
        UNION ALL
        SELECT u.user_id, 'google' FROM developer_users u WHERE u.google_sub IS NOT NULL ${scope}
        UNION ALL
        SELECT ei.user_id, ei.provider
        FROM external_identities ei
        JOIN developer_users u ON u.user_id = ei.user_id
        WHERE TRUE ${scope}
      ) methods
      GROUP BY provider
      ORDER BY users DESC, provider ASC
    `);
    const methods = (rows as unknown as Array<{ provider: string; users: number }>).map((row) => ({
      provider: row.provider,
      users: Number(row.users)
    }));
    const seen = new Set(methods.map((m) => m.provider));
    return {
      sources,
      methods,
      declaredWithoutUsers: [...declaredProviders].filter((p) => !seen.has(p)).sort()
    };
  });
}

async function aggregateWorkspaceSso(accountId: string | null, degradations: Degradations) {
  return safely("workspace_sso", degradations, { googleEnabled: 0, googleEnforced: 0 }, async () => {
    const db = getPostgresDb();
    const scope = accountId ? sql`AND account_id = ${accountId}` : sql``;
    const enabled = await db.execute(sql`
      SELECT count(*)::int AS value FROM accounts
      WHERE coalesce((sso->>'enabled')::boolean, false) = true ${scope}
    `);
    const enforced = await db.execute(sql`
      SELECT count(*)::int AS value FROM accounts
      WHERE coalesce((sso->>'enforce')::boolean, false) = true ${scope}
    `);
    const enabledRows = enabled as unknown as Array<{ value: number }>;
    const enforcedRows = enforced as unknown as Array<{ value: number }>;
    return {
      googleEnabled: Number(enabledRows[0]?.value ?? 0),
      googleEnforced: Number(enforcedRows[0]?.value ?? 0)
    };
  });
}

async function hydrateWorkspaceRows(
  rows: VolumeGroupRow[],
  degradations: Degradations
): Promise<WorkspaceVolumeRow[]> {
  const ids = rows.map((row) => row._id).filter((id): id is string => Boolean(id));
  const byId = new Map<string, { name?: string; slug?: string | null; plan?: string }>();
  if (ids.length) {
    await safely("top_workspace_names", degradations, undefined, async () => {
      const db = getPostgresDb();
      const accountRows = await db
        .select({
          accountId: accounts.accountId,
          name: accounts.name,
          slug: accounts.slug,
          plan: accounts.plan
        })
        .from(accounts)
        .where(inArray(accounts.accountId, ids));
      for (const account of accountRows) byId.set(account.accountId, account);
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
      const db = getPostgresDb();
      const agentRows = await db
        .select({ agentId: agents.agentId, name: agents.name, accountId: agents.accountId })
        .from(agents)
        .where(inArray(agents.agentId, ids));
      for (const agent of agentRows) byId.set(agent.agentId, agent);
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
