"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import {
  formatOpsDate,
  formatOpsTime,
  logDecisionClass,
  logDecisionLabel,
  type OpsLog,
  type OpsLogSummary
} from "./opsLogTypes";

type LogsResponse = {
  logs: OpsLog[];
  summary: OpsLogSummary | null;
  pagination?: { limit: number; page: number; total: number; hasMore: boolean };
};

async function fetchLogs(path: string): Promise<LogsResponse> {
  const response = await fetch(path, { credentials: "include", headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }
  return response.json() as Promise<LogsResponse>;
}

function LogDetailPanel({ log, onClose }: { log: OpsLog; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

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
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const metadataEntries = log.metadata ? Object.entries(log.metadata).slice(0, 24) : [];

  return (
    <>
      <button type="button" className="ops-log-detail__backdrop" aria-label="Close log detail" onClick={onClose} />
      <aside className="ops-log-detail" role="dialog" aria-label="Log event detail">
        <div className="ops-log-detail__head">
          <div>
            <p className="ops-log-detail__eyebrow">Event detail</p>
            <h2 className="ops-log-detail__title">{log.action}</h2>
          </div>
          <button type="button" className="ops-log-detail__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <dl className="ops-log-detail__grid">
          <div><dt>Decision</dt><dd><span className={logDecisionClass(log)}>{logDecisionLabel(log)}</span></dd></div>
          <div><dt>Time</dt><dd><time dateTime={log.createdAt}>{formatOpsDate(log.createdAt)}</time></dd></div>
          <div><dt>Agent</dt><dd>{log.agentName ?? log.agentId}</dd></div>
          <div><dt>Action</dt><dd><code>{log.action}</code></dd></div>
          <div><dt>Resource</dt><dd>{log.vendor ?? "—"}</dd></div>
          <div><dt>Environment</dt><dd>{log.environment ?? "—"}</dd></div>
          <div><dt>Risk</dt><dd><span className={`ops-log-chip ops-log-chip--risk-${log.risk}`}>{log.risk}</span></dd></div>
          {typeof log.amount === "number" ? <div><dt>Amount</dt><dd>${log.amount}</dd></div> : null}
          {log.permissionId ? <div><dt>Policy</dt><dd><code>{log.permissionId}</code></dd></div> : null}
          {log.shadow ? <div><dt>Shadow</dt><dd>Shadow evaluation</dd></div> : null}
        </dl>

        <section className="ops-log-detail__section">
          <p className="ops-log-detail__section-label">Reason</p>
          <p className="ops-log-detail__reason">{log.reason}</p>
        </section>

        {log.approvalId ? (
          <section className="ops-log-detail__section">
            <p className="ops-log-detail__section-label">Approval request</p>
            <Link className="ops-log-detail__link" href={`/dashboard/approvals?highlight=${encodeURIComponent(log.approvalId)}`}>
              Open {log.approvalId}
            </Link>
          </section>
        ) : null}

        {metadataEntries.length ? (
          <section className="ops-log-detail__section">
            <p className="ops-log-detail__section-label">Request metadata</p>
            <pre className="ops-log-detail__meta">{JSON.stringify(Object.fromEntries(metadataEntries), null, 2)}</pre>
          </section>
        ) : null}

        <div className="ops-log-detail__actions">
          <Button type="button" onClick={() => void copy("requestId", log.requestId)}>
            {copied === "requestId" ? "Copied" : "Copy event ID"}
          </Button>
          <Button type="button" onClick={() => void copy("json", JSON.stringify(log, null, 2))}>
            {copied === "json" ? "Copied" : "Copy JSON"}
          </Button>
        </div>
      </aside>
    </>
  );
}

function SummaryStrip({ summary }: { summary: OpsLogSummary }) {
  return (
    <div className="ops-log-summary" aria-label="Log summary">
      <span><strong>{summary.total}</strong> events</span>
      <span className="ops-log-summary__sep" aria-hidden="true">·</span>
      <span><strong>{summary.allowed}</strong> allowed</span>
      <span className="ops-log-summary__sep" aria-hidden="true">·</span>
      <span><strong>{summary.denied}</strong> denied</span>
      <span className="ops-log-summary__sep" aria-hidden="true">·</span>
      <span><strong>{summary.approvalRequired}</strong> require approval</span>
      {summary.topDeniedAction ? (
        <>
          <span className="ops-log-summary__sep" aria-hidden="true">·</span>
          <span>Top denied: <code>{summary.topDeniedAction}</code></span>
        </>
      ) : null}
    </div>
  );
}

export function OpsLogConsole({
  title = "Audit logs",
  description = "Operational verification events for this workspace.",
  compact = false,
  initialLimit = 100
}: {
  title?: string;
  description?: string;
  compact?: boolean;
  initialLimit?: number;
}) {
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState("");
  const [agentId, setAgentId] = useState("");
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
    if (range === "24h") {
      params.set("from", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    } else if (range === "7d") {
      params.set("from", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    }
    return `/api/dashboard/logs?${params.toString()}`;
  }, [action, agentId, compact, decision, environment, initialLimit, range, risk, search]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchLogs(path));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const logs = data?.logs ?? [];
  const exportHref = `${path}${path.includes("?") ? "&" : "?"}format=csv`;

  return (
    <div className={`ops-log-console${compact ? " ops-log-console--compact" : ""}`}>
      {!compact ? (
        <PageHeader
          title={title}
          description={description}
          action={<ButtonLink href={exportHref}>Export CSV</ButtonLink>}
          className="dashboard-header"
        />
      ) : null}

      {!compact ? (
        <div className="ops-log-toolbar" role="search">
          <label className="ops-log-toolbar__field ops-log-toolbar__field--search">
            <span>Search</span>
            <input
              aria-label="Search logs"
              placeholder="action, agent, resource, reason, event id…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="ops-log-toolbar__field">
            <span>Decision</span>
            <select aria-label="Decision filter" value={decision} onChange={(event) => setDecision(event.target.value)}>
              <option value="">All</option>
              <option value="allowed">Allowed</option>
              <option value="denied">Denied</option>
              <option value="approval_required">Requires approval</option>
            </select>
          </label>
          <label className="ops-log-toolbar__field">
            <span>Agent</span>
            <input aria-label="Agent filter" placeholder="agent_xxx" value={agentId} onChange={(event) => setAgentId(event.target.value)} />
          </label>
          <label className="ops-log-toolbar__field">
            <span>Action</span>
            <input aria-label="Action filter" placeholder="deploy_prod" value={action} onChange={(event) => setAction(event.target.value)} />
          </label>
          <label className="ops-log-toolbar__field">
            <span>Environment</span>
            <input aria-label="Environment filter" placeholder="production" value={environment} onChange={(event) => setEnvironment(event.target.value)} />
          </label>
          <label className="ops-log-toolbar__field">
            <span>Risk</span>
            <select aria-label="Risk filter" value={risk} onChange={(event) => setRisk(event.target.value)}>
              <option value="">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="ops-log-toolbar__field">
            <span>Range</span>
            <select aria-label="Time range filter" value={range} onChange={(event) => setRange(event.target.value)}>
              <option value="">All time</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
            </select>
          </label>
          <div className="ops-log-toolbar__actions">
            <Button type="button" onClick={() => void reload()}>Refresh</Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!compact && data?.summary ? <SummaryStrip summary={data.summary} /> : null}

      <div className="ops-log-table-wrap">
        <table className="ops-log-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Decision</th>
              <th scope="col">Agent</th>
              <th scope="col">Action</th>
              <th scope="col">Resource</th>
              <th scope="col">Env</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {loading && !logs.length ? (
              <tr><td colSpan={7} className="ops-log-table__empty">Loading events…</td></tr>
            ) : null}
            {!loading && !logs.length ? (
              <tr><td colSpan={7} className="ops-log-table__empty">No verification events match these filters.</td></tr>
            ) : null}
            {logs.map((log) => (
              <tr
                key={log.requestId}
                className={`ops-log-table__row${selected?.requestId === log.requestId ? " ops-log-table__row--active" : ""}`}
                tabIndex={0}
                onClick={() => setSelected(log)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(log);
                  }
                }}
              >
                <td className="ops-log-table__time"><time dateTime={log.createdAt}>{formatOpsTime(log.createdAt)}</time></td>
                <td><span className={logDecisionClass(log)}>{logDecisionLabel(log)}</span></td>
                <td className="ops-log-table__mono">{log.agentName ?? log.agentId}</td>
                <td className="ops-log-table__mono"><code>{log.action}</code></td>
                <td className="ops-log-table__mono">{log.vendor ?? "—"}</td>
                <td className="ops-log-table__mono">{log.environment ?? "—"}</td>
                <td className="ops-log-table__reason">{log.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!compact && data?.pagination?.hasMore ? (
        <p className="ops-log-footnote">
          Showing {logs.length} of {data.pagination.total} events. Refine filters or export CSV for the full page.
        </p>
      ) : null}

      {!logs.length && !loading && !compact ? (
        <EmptyState className="dashboard-empty">
          No verification events yet. Decisions appear here when agents call <code>verify()</code>.
        </EmptyState>
      ) : null}

      {selected ? <LogDetailPanel log={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
