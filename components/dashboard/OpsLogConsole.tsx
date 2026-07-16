"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  ButtonLink,
  DashboardState,
  PageHeader,
  RiskIndicator,
  Skeleton
} from "@/components/ui";
import { useDashboardApi, useDashboardPaths } from "@/components/workspace/WorkspaceProvider";
import { DecisionIndicator, OpsDrawerLink, OpsLogEventCard } from "./OpsEventPrimitives";
import {
  approvalRequiredMetricLabel,
  formatOpsDate,
  formatOpsTime,
  logDecisionLabel,
  type OpsLog,
  type OpsLogSummary
} from "./opsLogTypes";

type LogsResponse = {
  logs: OpsLog[];
  summary: OpsLogSummary | null;
  pagination?: { limit: number; page: number; total: number; hasMore: boolean };
};

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

function LogDetailDrawer({ log, onClose }: { log: OpsLog; onClose: () => void }) {
  const { href } = useDashboardPaths();
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");

  const copy = async (label: string, value: string) => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopyError("Copy failed. Select the value manually and try again.");
    }
  };

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("ops-drawer-open");
    closeRef.current?.focus();
    return () => {
      document.body.classList.remove("ops-drawer-open");
      previousFocusRef.current?.focus();
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !drawerRef.current) return;
    const focusable = focusableElements(drawerRef.current);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const metadataJson = log.metadata ? JSON.stringify(log.metadata, null, 2) : null;
  const hasNamedAgent = Boolean(log.agentName && log.agentName !== log.agentId);

  return (
    <>
      <button type="button" className="ops-drawer__backdrop" aria-label="Close log detail" onClick={onClose} />
      <aside
        aria-labelledby="ops-log-detail-title"
        aria-modal="true"
        className="ops-drawer"
        onKeyDown={handleKeyDown}
        ref={drawerRef}
        role="dialog"
      >
        <header className="ops-drawer__header">
          <div className="ops-drawer__header-main">
            <p className="ops-drawer__kicker">Verification record</p>
            <h2 className="ops-drawer__title" id="ops-log-detail-title"><code>{log.action}</code></h2>
            <div className="ops-drawer__header-meta">
              <DecisionIndicator log={log} />
              <time dateTime={log.createdAt}>{formatOpsDate(log.createdAt)}</time>
            </div>
          </div>
          <button ref={closeRef} type="button" className="ops-drawer__close" onClick={onClose} aria-label="Close decision detail">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <section className="ops-drawer__section">
          <h3 className="ops-drawer__section-title">Identity and action</h3>
          <dl className="ops-drawer__kv">
            <div><dt>Agent</dt><dd>{log.agentName ?? log.agentId}</dd></div>
            {hasNamedAgent ? <div><dt>Agent ID</dt><dd><code>{log.agentId}</code></dd></div> : null}
            <div><dt>Action</dt><dd><code>{log.action}</code></dd></div>
            <div><dt>Target</dt><dd>{log.vendor ?? "Not recorded"}</dd></div>
            {typeof log.amount === "number" ? <div><dt>Amount</dt><dd>${log.amount}</dd></div> : null}
            <div><dt>Environment</dt><dd>{log.environment ?? "Not recorded"}</dd></div>
            <div><dt>Attempted</dt><dd>{formatOpsTime(log.createdAt)}</dd></div>
          </dl>
        </section>

        <section className="ops-drawer__section ops-drawer__section--decision">
          <div className="ops-drawer__section-heading">
            <h3 className="ops-drawer__section-title">Policy decision</h3>
            <RiskIndicator risk={log.risk} />
          </div>
          <p className="ops-drawer__reason">{log.reason}</p>
          <dl className="ops-drawer__kv ops-drawer__kv--compact">
            <div><dt>Result</dt><dd>{logDecisionLabel(log)}</dd></div>
            {log.permissionId ? <div><dt>Policy</dt><dd><code>{log.permissionId}</code></dd></div> : null}
            {log.shadow ? <div><dt>Mode</dt><dd>Shadow evaluation</dd></div> : null}
          </dl>
        </section>

        {log.approvalId ? (
          <section className="ops-drawer__section">
            <h3 className="ops-drawer__section-title">Approval lifecycle</h3>
            <p className="ops-drawer__section-copy">This verification created or matched an approval-bound request.</p>
            <OpsDrawerLink href={href(`/dashboard/approvals?highlight=${encodeURIComponent(log.approvalId)}`)}>
              Review approval request
            </OpsDrawerLink>
            <p className="ops-drawer__hint"><code>{log.approvalId}</code></p>
          </section>
        ) : null}

        {metadataJson ? (
          <section className="ops-drawer__section">
            <h3 className="ops-drawer__section-title">Request context</h3>
            <p className="ops-drawer__section-copy">Sanitized metadata stored with this verification event.</p>
            <pre className="ops-drawer__code">{metadataJson}</pre>
          </section>
        ) : null}

        <section className="ops-drawer__section">
          <h3 className="ops-drawer__section-title">Technical identifiers</h3>
          <dl className="ops-drawer__kv">
            <div><dt>Event ID</dt><dd><code>{log.requestId}</code></dd></div>
          </dl>
        </section>

        <footer className="ops-drawer__footer">
          {copyError ? <Alert tone="destructive" className="ops-drawer__copy-error">{copyError}</Alert> : null}
          <div className="ops-drawer__footer-actions">
            <Button type="button" variant="outline" size="small" onClick={() => void copy("requestId", log.requestId)}>
              {copied === "requestId" ? "Event ID copied" : "Copy event ID"}
            </Button>
            <Button type="button" variant="outline" size="small" onClick={() => void copy("json", JSON.stringify(log, null, 2))}>
              {copied === "json" ? "JSON copied" : "Copy JSON"}
            </Button>
          </div>
        </footer>
      </aside>
    </>
  );
}

function MetricsStrip({ summary }: { summary: OpsLogSummary }) {
  return (
    <dl className="ops-metrics" aria-label="Decision history summary">
      <div><dt>Events</dt><dd>{summary.total}</dd></div>
      <div className="ops-metrics__item--allowed"><dt>Allowed</dt><dd>{summary.allowed}</dd></div>
      <div className="ops-metrics__item--denied"><dt>Denied</dt><dd>{summary.denied}</dd></div>
      <div className="ops-metrics__item--approval"><dt>{approvalRequiredMetricLabel(summary.approvalRequired)}</dt><dd>{summary.approvalRequired}</dd></div>
    </dl>
  );
}

function LogTableSkeleton() {
  return (
    <div className="ops-log-skeleton" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <div key={row}>
          <Skeleton /><Skeleton /><Skeleton /><Skeleton />
        </div>
      ))}
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
    // Preserve the existing rolling-window query semantics when filter inputs change.
    // eslint-disable-next-line react-hooks/purity
    if (range === "24h") params.set("from", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    // eslint-disable-next-line react-hooks/purity
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
    // Keep the established automatic fetch on every query-path change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const logs = data?.logs ?? [];

  useEffect(() => {
    const availableLogs = data?.logs ?? [];
    if (!initialSearch || !availableLogs.length) return;
    const match = availableLogs.find((log) => log.requestId === initialSearch);
    // Preserve the established deep-link selection after the current page loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) setSelected(match);
  }, [data?.logs, initialSearch]);

  const resolvedPath = apiPath(path);
  const exportHref = `${resolvedPath}${resolvedPath.includes("?") ? "&" : "?"}format=csv`;
  const activeFilters = [
    search.trim() ? `Search: ${search.trim()}` : null,
    decision ? `Decision: ${decision === "approval_required" ? "Approval required" : decision}` : null,
    agentId.trim() ? `Agent: ${agentId.trim()}` : null,
    action.trim() ? `Action: ${action.trim()}` : null,
    environment.trim() ? `Environment: ${environment.trim()}` : null,
    risk ? `Risk: ${risk}` : null,
    range ? `Range: ${range}` : null
  ].filter((item): item is string => Boolean(item));
  const hasFilters = activeFilters.length > 0;

  const resetFilters = () => {
    setSearch("");
    setDecision("");
    setAgentId("");
    setAction("");
    setEnvironment("");
    setRisk("");
    setRange("");
  };

  return (
    <div className={`ops-console ops-log-console${compact ? " ops-log-console--compact" : ""}`}>
      {!compact ? (
        <PageHeader
          eyebrow="Decision history"
          title={title}
          description={description}
          action={<ButtonLink href={exportHref} variant="outline" size="small">Export CSV</ButtonLink>}
          className="dashboard-header ops-console__header"
        />
      ) : null}

      {!compact ? (
        <form
          className="ops-cmd"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            void reload();
          }}
        >
          <label className="ops-cmd__search-field">
            <span>Search decision history</span>
            <span className="ops-cmd__search-wrap">
              <span className="ops-cmd__search-icon" aria-hidden="true">⌕</span>
              <input
                className="ops-cmd__search"
                placeholder="Action, agent, target, reason, or event ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>
          <div className="ops-cmd__filters">
            <label><span>Decision</span><select className="ops-cmd__filter" value={decision} onChange={(event) => setDecision(event.target.value)}>
              <option value="">All decisions</option>
              <option value="allowed">Allowed</option>
              <option value="denied">Denied</option>
              <option value="approval_required">Approval required</option>
            </select></label>
            <label><span>Agent</span><input className="ops-cmd__filter" placeholder="Agent ID" value={agentId} onChange={(event) => setAgentId(event.target.value)} /></label>
            <label><span>Action</span><input className="ops-cmd__filter" placeholder="Action" value={action} onChange={(event) => setAction(event.target.value)} /></label>
            <label><span>Environment</span><input className="ops-cmd__filter" placeholder="Environment" value={environment} onChange={(event) => setEnvironment(event.target.value)} /></label>
            <label><span>Risk</span><select className="ops-cmd__filter" value={risk} onChange={(event) => setRisk(event.target.value)}>
              <option value="">All risk</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select></label>
            <label><span>Date range</span><select className="ops-cmd__filter" value={range} onChange={(event) => setRange(event.target.value)}>
              <option value="">All retained</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select></label>
          </div>
          <div className="ops-cmd__actions">
            <span className="ops-cmd__filter-count" aria-live="polite">
              {hasFilters ? `${activeFilters.length} active ${activeFilters.length === 1 ? "filter" : "filters"}` : "No active filters"}
            </span>
            <Button type="button" variant="ghost" size="small" disabled={!hasFilters} onClick={resetFilters}>Reset</Button>
            <Button type="submit" variant="secondary" size="small" loading={loading && Boolean(data)}>Apply filters</Button>
          </div>
          {hasFilters ? (
            <ul className="ops-active-filters" aria-label="Active filters">
              {activeFilters.map((filter) => <li key={filter}>{filter}</li>)}
            </ul>
          ) : null}
        </form>
      ) : null}

      {error ? <Alert tone="destructive" className="ops-feedback">{error}</Alert> : null}
      {!compact && data?.summary ? <MetricsStrip summary={data.summary} /> : null}
      {loading && logs.length ? <p className="ops-results-updating" role="status">Updating decision history…</p> : null}

      {loading && !logs.length ? (
        <div role="status" aria-label="Loading decision history"><LogTableSkeleton /></div>
      ) : !loading && !logs.length ? (
        <DashboardState
          kind="empty"
          title={hasFilters ? "No decisions match these filters" : "No verification activity yet"}
          description={hasFilters
            ? "Reset or adjust the active filters to broaden the result set."
            : "Allowed, denied, and approval-required decisions appear here when agents call verify()."}
        />
      ) : (
        <div className="ops-events" aria-busy={loading || undefined}>
          <div className="ops-events__table-wrap">
            <table className="ops-events__table">
              <caption className="sr-only">Workspace verification decision history</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Agent and action</th>
                  <th scope="col">Target</th>
                  <th scope="col">Policy</th>
                  <th scope="col">Reason</th>
                  <th scope="col"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.requestId} className={selected?.requestId === log.requestId ? "ops-events__row--active" : undefined}>
                    <td className="ops-events__time"><time dateTime={log.createdAt}>{formatOpsTime(log.createdAt)}</time></td>
                    <td className="ops-events__decision"><DecisionIndicator log={log} compact /><span>{log.risk} risk</span></td>
                    <td className="ops-events__identity">
                      <strong>{log.agentName ?? log.agentId}</strong>
                      <code>{log.action}</code>
                    </td>
                    <td className="ops-events__target">
                      <span>{log.vendor ?? "—"}</span>
                      {log.environment ? <small>{log.environment}</small> : null}
                    </td>
                    <td className="ops-events__policy">
                      {log.permissionId ? <code title={log.permissionId}>{log.permissionId}</code> : <span>—</span>}
                      {log.approvalId ? <small>Approval linked</small> : null}
                    </td>
                    <td className="ops-events__message">{log.reason}</td>
                    <td className="ops-events__inspect-cell">
                      <button type="button" className="ops-events__inspect" onClick={() => setSelected(log)} aria-label={`Inspect ${log.action} decision`}>
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ops-events__list">
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
      )}

      {!compact && data?.pagination ? (
        <div className={`ops-results-boundary${data.pagination.hasMore ? " ops-results-boundary--truncated" : ""}`} role="status">
          <span>Showing {logs.length} of {data.pagination.total} matching events.</span>
          {data.pagination.hasMore ? <span>More records exist beyond this result page; narrow the filters to inspect them here.</span> : null}
        </div>
      ) : null}

      {selected ? <LogDetailDrawer log={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
