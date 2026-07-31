"use client";

/**
 * Console analytics dashboard.
 *
 * One consolidated fetch backs every card, graph and table on this page, so
 * they always describe the same window and the same database read. The range
 * selector is shared; changing it refetches once.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChartCard,
  ChartSkeleton,
  OutcomeBars,
  RankingTable,
  SeriesToggle,
  TimeSeriesChart,
  formatCount,
  formatRate,
  formatTimestamp,
  useSeriesSelection,
  type ChartPoint,
  type ChartSeries
} from "@/components/console/AnalyticsCharts";
import { Alert, Button, DashboardState, PageHeader, RefreshingIndicator, StatCard } from "@/components/ui";
import { ACTIVE_AGENT_DEFINITION } from "@/lib/adminAnalytics/definitions";
import {
  ADMIN_ANALYTICS_INTERVALS,
  type AdminAnalyticsInterval,
  type AdminAnalyticsPayload,
  type CountSeriesPoint,
  type VerificationSeriesPoint
} from "@/lib/adminAnalytics/types";

type ApiError = Error & { status?: number };

const INTERVAL_LABELS: Record<AdminAnalyticsInterval, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
  custom: "Custom"
};

const SELECTABLE_INTERVALS = ADMIN_ANALYTICS_INTERVALS.filter(
  (interval): interval is Exclude<AdminAnalyticsInterval, "custom"> => interval !== "custom"
);

const VERIFICATION_SERIES: ChartSeries[] = [
  { key: "allowed", label: "Allowed", tone: "allow" },
  { key: "denied", label: "Denied", tone: "deny" },
  { key: "approvalRequired", label: "Approval required", tone: "approval" },
  { key: "indeterminate", label: "Indeterminate", tone: "neutral" },
  { key: "shadow", label: "Shadow mode", tone: "shadow" }
];

const OUTCOME_TONES = {
  allowed: "allow",
  denied: "deny",
  approval_required: "approval",
  indeterminate: "neutral"
} as const;

const OUTCOME_LABELS = {
  allowed: "Allowed",
  denied: "Denied",
  approval_required: "Approval required",
  indeterminate: "Indeterminate"
} as const;

function toChartPoints(points: VerificationSeriesPoint[]): ChartPoint[] {
  return points.map((point) => ({
    bucketStart: point.bucketStart,
    values: {
      allowed: point.allowed,
      denied: point.denied,
      approvalRequired: point.approvalRequired,
      indeterminate: point.indeterminate,
      shadow: point.shadow,
      attempts: point.attempts,
      enforced: point.enforced
    }
  }));
}

function toCountPoints(points: CountSeriesPoint[], key: string): ChartPoint[] {
  return points.map((point) => ({
    bucketStart: point.bucketStart,
    values: { [key]: point.count }
  }));
}

type LoadOptions = {
  interval: AdminAnalyticsInterval;
  from?: string;
  to?: string;
};

function buildAnalyticsUrl({ interval, from, to }: LoadOptions) {
  const params = new URLSearchParams({ interval });
  if (interval === "custom") {
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  return `/api/console/analytics?${params.toString()}`;
}

export function ConsoleAnalyticsPage() {
  const [interval, setIntervalValue] = useState<AdminAnalyticsInterval>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedCustom, setAppliedCustom] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<AdminAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (options: LoadOptions) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildAnalyticsUrl(options), {
        credentials: "include",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        const failure = new Error(body?.error ?? `Request failed with ${response.status}`) as ApiError;
        failure.status = response.status;
        throw failure;
      }
      const payload = (await response.json()) as AdminAnalyticsPayload;
      if (requestId.current === id) {
        setData(payload);
        setLoading(false);
      }
    } catch (requestError) {
      if (requestId.current !== id) return;
      setError(requestError as ApiError);
      setLoading(false);
    }
  }, []);

  const activeRequest = useMemo<LoadOptions>(() => {
    if (interval === "custom" && appliedCustom) {
      return { interval, from: appliedCustom.from, to: appliedCustom.to };
    }
    return { interval };
  }, [interval, appliedCustom]);

  useEffect(() => {
    if (interval === "custom" && !appliedCustom) return;
    void load(activeRequest);
  }, [activeRequest, interval, appliedCustom, load]);

  const selectInterval = (next: AdminAnalyticsInterval) => {
    setIntervalValue(next);
    if (next !== "custom") {
      setAppliedCustom(null);
    }
  };

  const applyCustomRange = () => {
    if (!customFrom.trim() || !customTo.trim()) return;
    setAppliedCustom({ from: customFrom.trim(), to: customTo.trim() });
  };

  const rangeSelector = (
    <div className="analytics-range-controls">
      <fieldset className="analytics-range" aria-label="Reporting window">
        <legend className="sr-only">Reporting window</legend>
        {SELECTABLE_INTERVALS.map((option) => (
          <label key={option} className={interval === option ? "is-active" : undefined}>
            <input
              type="radio"
              name="analytics-interval"
              value={option}
              checked={interval === option}
              onChange={() => selectInterval(option)}
            />
            <span>{INTERVAL_LABELS[option]}</span>
          </label>
        ))}
        <label className={interval === "custom" ? "is-active" : undefined}>
          <input
            type="radio"
            name="analytics-interval"
            value="custom"
            checked={interval === "custom"}
            onChange={() => selectInterval("custom")}
          />
          <span>{INTERVAL_LABELS.custom}</span>
        </label>
      </fieldset>
      {interval === "custom" ? (
        <form
          className="analytics-custom-range"
          onSubmit={(event) => {
            event.preventDefault();
            applyCustomRange();
          }}
        >
          <label>
            <span className="sr-only">From date (UTC)</span>
            <input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              aria-label="From date (UTC)"
              required
            />
          </label>
          <span aria-hidden="true">to</span>
          <label>
            <span className="sr-only">To date (UTC)</span>
            <input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              aria-label="To date (UTC)"
              required
            />
          </label>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      ) : null}
    </div>
  );

  if (loading && !data) {
    return (
      <>
        <PageHeader title="Analytics" description="Platform-wide verification and growth metrics." />
        {rangeSelector}
        <div className="analytics-grid">
          {["Verification activity", "Signups", "Workspaces", "Agents"].map((label) => (
            <ChartCard key={label} title={label}>
              <ChartSkeleton label={`Loading ${label.toLowerCase()}`} />
            </ChartCard>
          ))}
        </div>
      </>
    );
  }

  if (interval === "custom" && !appliedCustom && !data) {
    return (
      <>
        <PageHeader title="Analytics" description="Platform-wide verification and growth metrics." />
        {rangeSelector}
        <DashboardState
          kind="no-data"
          title="Choose a custom range"
          description="Select UTC start and end dates, then apply the range."
        />
      </>
    );
  }

  if (error?.status === 401) {
    return (
      <DashboardState
        kind="access-denied"
        title="Console session expired"
        description="Sign in again to view analytics."
      />
    );
  }

  if (error && !data) {
    return (
      <>
        <PageHeader title="Analytics" description="Platform-wide verification and growth metrics." />
        {rangeSelector}
        <DashboardState
          kind="error"
          title="Analytics could not be loaded"
          description={error.message}
          action={
            <Button onClick={() => void load(activeRequest)} type="button" variant="outline">
              Try again
            </Button>
          }
        />
      </>
    );
  }

  if (!data) {
    return <DashboardState kind="no-data" />;
  }

  return (
    <AnalyticsDashboard
      data={data}
      interval={interval}
      loading={loading}
      error={error}
      rangeSelector={rangeSelector}
      onRetry={() => void load(activeRequest)}
    />
  );
}

function AnalyticsDashboard({
  data,
  interval,
  loading,
  error,
  rangeSelector,
  onRetry
}: {
  data: AdminAnalyticsPayload;
  interval: AdminAnalyticsInterval;
  loading: boolean;
  error: ApiError | null;
  rangeSelector: React.ReactNode;
  onRetry: () => void;
}) {
  const { summary, timeseries, breakdowns, range } = data;
  const verifications = summary.verifications;
  const verificationPoints = useMemo(() => toChartPoints(timeseries.verifications), [timeseries.verifications]);
  const verificationSelection = useSeriesSelection(VERIFICATION_SERIES, [
    "allowed",
    "denied",
    "approvalRequired"
  ]);

  const periodLabel = INTERVAL_LABELS[interval];
  const windowNote = `${new Date(range.start).toISOString()} to ${new Date(range.end).toISOString()} (UTC, end exclusive)`;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Platform-wide verification and growth metrics. All windows and buckets are UTC."
      />

      <div className="analytics-toolbar">
        {rangeSelector}
        <div className="analytics-toolbar__meta">
          <span>
            Data as of <strong>{formatTimestamp(data.asOf)}</strong>
          </span>
          <span>
            Newest verification <strong>{formatTimestamp(data.freshness.latestVerificationAt)}</strong>
          </span>
          <Button onClick={onRetry} type="button" variant="outline">
            Refresh
          </Button>
        </div>
      </div>

      {loading ? <RefreshingIndicator label="Refreshing analytics" /> : null}
      {error ? <Alert tone="destructive">{error.message}</Alert> : null}
      {data.partial ? (
        <Alert tone="warning">
          Some figures are incomplete: {describePartialReasons(data.partialReasons)}
        </Alert>
      ) : null}

      <p className="analytics-window">Window: {windowNote}. Buckets: {range.granularity}.</p>

      <section aria-label="Overview">
        <h2 className="analytics-section-title">Overview</h2>
        <div className="console-metrics dashboard-metrics">
          <StatCard label="Total users" value={summary.users.total} />
          <StatCard label={`New users (${periodLabel})`} value={summary.users.new} />
          <StatCard label="Total workspaces" value={summary.workspaces.total} />
          <StatCard label={`New workspaces (${periodLabel})`} value={summary.workspaces.new} />
          <StatCard label="Total agents" value={summary.agents.total} />
          <StatCard label={`New agents (${periodLabel})`} value={summary.agents.new} />
          <StatCard label={`Active agents (${periodLabel})`} value={summary.agents.activeInPeriod} />
          <StatCard label="Agents enabled" value={summary.agents.activeConfigured} />
          <StatCard label={`Verification attempts (${periodLabel})`} value={verifications.attempts} />
          <StatCard label="Enforced attempts" value={verifications.enforced} />
          <StatCard label="Shadow-mode attempts" value={verifications.shadow} />
          <StatCard label="Unique workspaces active" value={verifications.uniqueWorkspaces} />
          <StatCard label="Allow rate" value={formatRate(verifications.rates.allowed.value)} />
          <StatCard label="Deny rate" value={formatRate(verifications.rates.denied.value)} />
          <StatCard
            label="Approval-required rate"
            value={formatRate(verifications.rates.approvalRequired.value)}
          />
          <StatCard
            label="Indeterminate rate"
            value={formatRate(verifications.rates.indeterminate.value)}
          />
        </div>
        <p className="analytics-note">
          Rates are a share of <strong>{formatCount(verifications.enforced)}</strong> enforced attempts
          (shadow mode excluded). A dash means the rate is undefined because there were no enforced
          attempts. {ACTIVE_AGENT_DEFINITION}
        </p>
      </section>

      <section aria-label="Graphs">
        <h2 className="analytics-section-title">Trends</h2>
        <div className="analytics-grid">
          <ChartCard
            title="Verification activity over time"
            description="Outcomes per bucket. Approval pauses are counted separately from denials."
            action={
              <SeriesToggle
                legend="Series"
                options={VERIFICATION_SERIES}
                selected={verificationSelection.selected}
                onChange={verificationSelection.setSelected}
              />
            }
            footnote={`Stacked ${range.granularity} buckets, zero-filled. Times are UTC.`}
          >
            <TimeSeriesChart
              points={verificationPoints}
              series={verificationSelection.visible}
              granularity={range.granularity}
              valueLabel="attempts"
            />
          </ChartCard>

          <ChartCard
            title="Verification outcomes"
            description="Share of enforced attempts in the selected window."
            footnote="Each row states its exact count and share; colour is never the only cue."
          >
            <OutcomeBars
              denominatorLabel="enforced attempts"
              rows={breakdowns.outcomes.map((row) => ({
                label: OUTCOME_LABELS[row.outcome],
                tone: OUTCOME_TONES[row.outcome],
                count: row.count,
                rate: row.rate.value
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Active agents over time"
            description="Distinct agents with at least one attempt in each bucket."
            footnote="Buckets do not sum to the period total: an agent active on several days counts once per day."
          >
            <TimeSeriesChart
              points={toCountPoints(timeseries.activeAgents, "agents")}
              series={[{ key: "agents", label: "Active agents", tone: "brand" }]}
              granularity={range.granularity}
              variant="line"
              valueLabel="active agents"
            />
          </ChartCard>

          <ChartCard
            title="User signups over time"
            description="DeveloperUser records created per bucket."
          >
            <TimeSeriesChart
              points={toCountPoints(timeseries.signups, "users")}
              series={[{ key: "users", label: "Signups", tone: "info" }]}
              granularity={range.granularity}
              valueLabel="signups"
            />
          </ChartCard>

          <ChartCard
            title="Workspace creation over time"
            description="Account records created per bucket."
          >
            <TimeSeriesChart
              points={toCountPoints(timeseries.workspacesCreated, "workspaces")}
              series={[{ key: "workspaces", label: "Workspaces", tone: "brand" }]}
              granularity={range.granularity}
              valueLabel="workspaces"
            />
          </ChartCard>

          <ChartCard
            title="Agent creation over time"
            description="Agent records created per bucket."
          >
            <TimeSeriesChart
              points={toCountPoints(timeseries.agentsCreated, "agents")}
              series={[{ key: "agents", label: "Agents", tone: "info" }]}
              granularity={range.granularity}
              valueLabel="agents"
            />
          </ChartCard>
        </div>
      </section>

      <section aria-label="Breakdowns">
        <h2 className="analytics-section-title">Breakdowns</h2>
        <div className="analytics-grid">
          <ChartCard
            title="Top workspaces by volume"
            description={`Highest verification volume in the selected window (top ${breakdowns.topWorkspaces.length || 0}).`}
          >
            <RankingTable
              caption="Workspaces ranked by verification attempts"
              emptyMessage="No verification attempts in this range."
              rows={breakdowns.topWorkspaces}
              columns={[
                {
                  header: "Workspace",
                  render: (row) =>
                    row.accountId ? (
                      <Link href={`/console/logs?accountId=${encodeURIComponent(row.accountId)}`}>
                        {row.name ?? row.accountId}
                      </Link>
                    ) : (
                      <span className="analytics-muted">Unassigned</span>
                    )
                },
                { header: "Plan", render: (row) => row.plan ?? "—" },
                { header: "Attempts", numeric: true, render: (row) => formatCount(row.attempts) },
                { header: "Allowed", numeric: true, render: (row) => formatCount(row.allowed) },
                { header: "Denied", numeric: true, render: (row) => formatCount(row.denied) },
                {
                  header: "Approval",
                  numeric: true,
                  render: (row) => formatCount(row.approvalRequired)
                }
              ]}
            />
          </ChartCard>

          <ChartCard
            title="Top agents by volume"
            description="Highest verification volume in the selected window."
          >
            <RankingTable
              caption="Agents ranked by verification attempts"
              emptyMessage="No verification attempts in this range."
              rows={breakdowns.topAgents}
              columns={[
                {
                  header: "Agent",
                  render: (row) => (
                    <Link href={`/console/agents/${encodeURIComponent(row.agentId)}`}>
                      {row.name ?? row.agentId}
                    </Link>
                  )
                },
                { header: "Attempts", numeric: true, render: (row) => formatCount(row.attempts) },
                { header: "Allowed", numeric: true, render: (row) => formatCount(row.allowed) },
                { header: "Denied", numeric: true, render: (row) => formatCount(row.denied) },
                {
                  header: "Approval",
                  numeric: true,
                  render: (row) => formatCount(row.approvalRequired)
                }
              ]}
            />
          </ChartCard>

          <ChartCard
            title="Sign-in method adoption"
            description="Distinct users per method, counted from persisted identity records rather than sign-in events."
            footnote={`Users with more than one method are counted under each, so rows can exceed the user total. Methods with no linked users yet are shown as zero. Sources: ${data.breakdowns.providerAdoption.sources.join(", ")}.`}
          >
            <OutcomeBars
              denominatorLabel="users"
              rows={[
                ...breakdowns.providerAdoption.methods.map((method) => ({
                  label: describeProvider(method.provider),
                  tone: "brand" as const,
                  count: method.users,
                  rate: summary.users.total > 0 ? method.users / summary.users.total : null
                })),
                ...breakdowns.providerAdoption.declaredWithoutUsers.map((provider) => ({
                  label: describeProvider(provider),
                  tone: "neutral" as const,
                  count: 0,
                  rate: summary.users.total > 0 ? 0 : null
                }))
              ]}
            />
            <p className="analytics-note">
              Workspace Google SSO: {formatCount(breakdowns.providerAdoption.workspaceSso.googleEnabled)}{" "}
              enabled, {formatCount(breakdowns.providerAdoption.workspaceSso.googleEnforced)} enforced.
            </p>
          </ChartCard>

          <ChartCard
            title="Approval pipeline"
            description="Sourced from approval records, so agent retries never inflate these counts."
          >
            <div className="console-metrics dashboard-metrics">
              <StatCard label="Requests created" value={summary.approvals.createdInPeriod} />
              <StatCard label="Approved" value={summary.approvals.approvedInPeriod} />
              <StatCard label="Denied" value={summary.approvals.deniedInPeriod} />
              <StatCard label="Grants used" value={summary.approvals.usedInPeriod} />
              <StatCard label="Pending now" value={summary.approvals.pendingNow} />
            </div>
            <p className="analytics-note">
              {formatCount(verifications.approvalRequired)} verification attempts were paused for
              approval, against {formatCount(summary.approvals.createdInPeriod)} distinct approval
              requests — an agent that polls while pending logs several attempts for one request.
            </p>
          </ChartCard>
        </div>
      </section>
    </>
  );
}

function describeProvider(provider: string) {
  if (provider === "unknown_legacy") return "Unknown (legacy record)";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function describePartialReasons(reasons: string[]) {
  const messages = reasons.map((reason) => {
    if (reason === "newest_bucket_incomplete") return "the newest bucket is still filling";
    if (reason === "series_truncated_to_bucket_cap") return "the graph window was clamped to the bucket cap";
    if (reason.startsWith("degraded:")) return `${reason.slice("degraded:".length)} could not be computed`;
    return reason;
  });
  return messages.join("; ");
}
