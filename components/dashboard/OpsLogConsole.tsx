"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { useDashboardApi, useDashboardPaths } from "@/components/workspace/WorkspaceProvider";
import { DecisionIndicator, OpsDrawerLink, OpsLogEventCard } from "./OpsEventPrimitives";
import {
  formatOpsDate,
  formatOpsTime,
  logDecisionLabel,
  approvalRequiredMetricLabel,
  logDecisionTone,
  type OpsLog,
  type OpsLogSummary
} from "./opsLogTypes";

type LogsResponse = {
  logs: OpsLog[];
  summary: OpsLogSummary | null;
  pagination?: { limit: number; page: number; total: number; hasMore: boolean };
};

function LogDetailDrawer({ log, onClose }: { log: OpsLog; onClose: () => void }) {
  const { href } = useDashboardPaths();
  const [copied, setCopied] = useState<string | null>(null);
  const tone = logDecisionTone(log);

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("ops-drawer-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("ops-drawer-open");
    };
  }, [onClose]);

  const metadataJson = log.metadata ? JSON.stringify(log.metadata, null, 2) : null;

  return (
    <>
      <button type="button" className="ops-drawer__backdrop" aria-label="Close log detail" onClick={onClose} />
      <aside className="ops-drawer" role="dialog" aria-label="Log event detail">
        <header className="ops-drawer__header">
          <div className="ops-drawer__header-main">
            <p className="ops-drawer__kicker">Verification event</p>
            <h2 className="ops-drawer__title"><code>{log.action}</code></h2>
            <div className="ops-drawer__header-meta">
              <span className={`ops-status ops-status--${tone}`}>
                <span className="ops-status__dot" aria-hidden="true" />
                <span className="ops-status__label">{logDecisionLabel(log)}</span>
              </span>
              <time dateTime={log.createdAt}>{formatOpsDate(log.createdAt)}</time>
            </div>
          </div>
          <button type="button" className="ops-drawer__close" onClick={onClose} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <section className="ops-drawer__section">
          <h3 className="ops-drawer__section-title">Event</h3>
          <dl className="ops-drawer__kv">
            <div><dt>Agent</dt><dd>{log.agentName ?? log.agentId}</dd></div>
            <div><dt>Action</dt><dd><code>{log.action}</code></dd></div>
            <div><dt>Resource</dt><dd>{log.vendor ?? "—"}</dd></div>
            <div><dt>Environment</dt><dd>{log.environment ?? "—"}</dd></div>
            <div><dt>Event ID</dt><dd><code>{log.requestId}</code></dd></div>
          </dl>
        </section>

        <section className="ops-drawer__section">
          <h3 className="ops-drawer__section-title">Decision</h3>
          <p className="ops-drawer__reason">{log.reason}</p>
          <dl className="ops-drawer__kv ops-drawer__kv--compact">
            <div><dt>Risk</dt><dd>{log.risk}</dd></div>
            {typeof log.amount === "number" ? <div><dt>Amount</dt><dd>${log.amount}</dd></div> : null}
            {log.shadow ? <div><dt>Mode</dt><dd>Shadow evaluation</dd></div> : null}
          </dl>
        </section>

        {log.permissionId ? (
          <section className="ops-drawer__section">
            <h3 className="ops-drawer__section-title">Policy</h3>
            <p className="ops-drawer__mono"><code>{log.permissionId}</code></p>
          </section>
        ) : null}

        {log.approvalId ? (
          <section className="ops-drawer__section">
            <h3 className="ops-drawer__section-title">Approval request</h3>
            <OpsDrawerLink
              href={href(`/dashboard/approvals?highlight=${encodeURIComponent(log.approvalId)}`)}
            >
              Open approval queue
            </OpsDrawerLink>
            <p className="ops-drawer__hint"><code>{log.approvalId}</code></p>
          </section>
        ) : null}

        {metadataJson ? (
          <section className="ops-drawer__section">
            <h3 className="ops-drawer__section-title">Metadata</h3>
            <pre className="ops-drawer__code">{metadataJson}</pre>
          </section>
        ) : null}

        <footer className="ops-drawer__footer">
          <button type="button" className="ops-btn ops-btn--ghost" onClick={() => void copy("requestId", log.requestId)}>
            {copied === "requestId" ? "Copied" : "Copy event ID"}
          </button>
          <button type="button" className="ops-btn ops-btn--ghost" onClick={() => void copy("json", JSON.stringify(log, null, 2))}>
            {copied === "json" ? "Copied" : "Copy JSON"}
          </button>
        </footer>
      </aside>
    </>
  );
}

function MetricsStrip({ summary }: { summary: OpsLogSummary }) {
  return (
    <div className="ops-metrics" aria-label="Log summary">
      <span className="ops-metrics__item"><strong>{summary.total}</strong> events</span>
      <span className="ops-metrics__item ops-metrics__item--allowed"><strong>{summary.allowed}</strong> allowed</span>
      <span className="ops-metrics__item ops-metrics__item--denied"><strong>{summary.denied}</strong> denied</span>
      <span className="ops-metrics__item ops-metrics__item--approval"><strong>{summary.approvalRequired}</strong> {approvalRequiredMetricLabel(summary.approvalRequired)}</span>
    </div>
  );
}

export function OpsLogConsole({
  title = "Audit logs",
  description = "Operational verification events for this workspace.",
  compact = false,
  initialLimit = 100,
  initialSearch,
  initialAgentId
}: {
  title?: string;
  description?: string;
  compact?: boolean;
  initialLimit?: number;
  initialSearch?: string;
  initialAgentId?: string;
}) {
  const { apiJson, apiPath } = useDashboardApi();
  const [search, setSearch] = useState(initialSearch ?? "");
  const [decision, setDecision] = useState("");
  const [agentId, setAgentId] = useState(initialAgentId ?? "");
  const [action, setAction] = useState("");
  const [environment, setEnvironment] = useState("");
  const [risk, setRisk] = useState("");
  const [range, setRange] = useState("");
  const [selected, setSelected] = useState<OpsLog | null>(null);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(compact ? Math.min(initialLimit, 12) : initialLimit));
    if (search.trim()) params.set("search", search.trim());
    if (decision) params.set("decision", decision);
    if (agentId.trim()) params.set("agentId", agentId.trim());
    if (action.trim()) params.set("action", action.trim());
    if (environment.trim()) params.set("environment", environment.trim());
    if (risk) params.set("risk", risk);
    if (range === "24h") params.set("from", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (range === "7d") params.set("from", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    return `/api/dashboard/logs?${params.toString()}`;
  }, [action, agentId, compact, decision, environment, initialLimit, range, risk, search]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiJson<LogsResponse>(path));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [apiJson, path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const logs = data?.logs ?? [];

  useEffect(() => {
    if (!initialSearch || !logs.length) return;
    const match = logs.find((log) => log.requestId === initialSearch);
    if (match) setSelected(match);
  }, [initialSearch, logs]);

  const resolvedPath = apiPath(path);
  const exportHref = `${resolvedPath}${resolvedPath.includes("?") ? "&" : "?"}format=csv`;
  const hasFilters = Boolean(search || decision || agentId || action || environment || risk || range);

  return (
    <div className={`ops-console ops-log-console${compact ? " ops-log-console--compact" : ""}`}>
      {!compact ? (
        <PageHeader
          title={title}
          description={description}
          action={<ButtonLink href={exportHref} className="ops-btn ops-btn--ghost">Export CSV</ButtonLink>}
          className="dashboard-header ops-console__header"
        />
      ) : null}

      {!compact ? (
        <div className="ops-cmd" role="search">
          <div className="ops-cmd__search-wrap">
            <span className="ops-cmd__search-icon" aria-hidden="true">⌕</span>
            <input
              className="ops-cmd__search"
              aria-label="Search logs"
              placeholder="Search action, agent, resource, reason, event id…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="ops-cmd__filters">
            <select className="ops-cmd__filter" aria-label="Decision filter" value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="">Decision</option>
              <option value="allowed">Allowed</option>
              <option value="denied">Denied</option>
              <option value="approval_required">Needs approval</option>
            </select>
            <input className="ops-cmd__filter" aria-label="Agent filter" placeholder="Agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} />
            <input className="ops-cmd__filter" aria-label="Action filter" placeholder="Action" value={action} onChange={(e) => setAction(e.target.value)} />
            <input className="ops-cmd__filter" aria-label="Environment filter" placeholder="Env" value={environment} onChange={(e) => setEnvironment(e.target.value)} />
            <select className="ops-cmd__filter" aria-label="Risk filter" value={risk} onChange={(e) => setRisk(e.target.value)}>
              <option value="">Risk</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <select className="ops-cmd__filter" aria-label="Time range filter" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="">Range</option>
              <option value="24h">24h</option>
              <option value="7d">7d</option>
            </select>
            <button type="button" className="ops-btn ops-btn--ghost ops-cmd__refresh" onClick={() => void reload()}>
              Refresh
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!compact && data?.summary ? <MetricsStrip summary={data.summary} /> : null}

      <div className="ops-events">
        <div className="ops-events__table-wrap">
          <table className="ops-events__table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Status</th>
                <th scope="col">Agent</th>
                <th scope="col">Action</th>
                <th scope="col">Resource</th>
                <th scope="col">Env</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {loading && !logs.length ? (
                <tr><td colSpan={7} className="ops-events__empty">Loading events…</td></tr>
              ) : null}
              {!loading && !logs.length ? (
                <tr><td colSpan={7} className="ops-events__empty">{hasFilters ? "No events match these filters." : "No verification events yet."}</td></tr>
              ) : null}
              {logs.map((log) => (
                <tr
                  key={log.requestId}
                  className={`ops-events__row${selected?.requestId === log.requestId ? " ops-events__row--active" : ""}`}
                  tabIndex={0}
                  onClick={() => setSelected(log)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(log);
                    }
                  }}
                >
                  <td className="ops-events__time"><time dateTime={log.createdAt}>{formatOpsTime(log.createdAt)}</time></td>
                  <td><DecisionIndicator log={log} compact /></td>
                  <td className="ops-events__mono">{log.agentName ?? log.agentId}</td>
                  <td className="ops-events__mono"><code>{log.action}</code></td>
                  <td className="ops-events__mono">{log.vendor ?? "—"}</td>
                  <td className="ops-events__mono">{log.environment ?? "—"}</td>
                  <td className="ops-events__message">{log.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ops-events__list">
          {loading && !logs.length ? <p className="ops-events__empty">Loading events…</p> : null}
          {!loading && !logs.length ? <p className="ops-events__empty">{hasFilters ? "No events match these filters." : "No verification events yet."}</p> : null}
          {logs.map((log) => (
            <OpsLogEventCard
              key={log.requestId}
              log={log}
              active={selected?.requestId === log.requestId}
              onSelect={() => setSelected(log)}
            />
          ))}
        </div>
      </div>

      {!compact && data?.pagination?.hasMore ? (
        <p className="ops-console__footnote">
          Showing {logs.length} of {data.pagination.total} events.
        </p>
      ) : null}

      {!logs.length && !loading && !compact ? (
        <EmptyState className="dashboard-empty">
          No verification events yet. Decisions appear here when agents call <code>verify()</code>.
        </EmptyState>
      ) : null}

      {selected ? <LogDetailDrawer log={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
