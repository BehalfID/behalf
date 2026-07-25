"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, ButtonLink, EmptyState } from "@/components/ui";
import { useDashboardApi, useDashboardPaths } from "@/components/workspace/WorkspaceProvider";
import {
  buildAgentActivityQuery,
  EMPTY_ACTIVITY_FILTERS,
  type AgentActivityFilters
} from "./activityFilters";
import { formatAgentDate } from "./format";
import type { ActivityLog, ActivityResponse } from "./types";

function activityDecision(log: ActivityLog) {
  if (log.decision) return log.decision;
  if (log.allowed) return "allowed" as const;
  if (log.approvalRequired || /requires approval|approval required/i.test(log.reason)) {
    return "approval_required" as const;
  }
  return "denied" as const;
}

function decisionLabel(log: ActivityLog) {
  const decision = activityDecision(log);
  if (decision === "approval_required") return "Approval required";
  return decision === "allowed" ? "Allowed" : "Denied";
}

function ReceiptDialog({ log, onClose }: { log: ActivityLog; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return (
    <dialog className="activity-receipt" onCancel={(event) => { event.preventDefault(); onClose(); }} ref={dialogRef}>
      <div className="permission-editor__header">
        <div>
          <p className="ui-kicker">Decision receipt</p>
          <h2>{decisionLabel(log)}</h2>
        </div>
        <Button onClick={onClose} type="button">Close</Button>
      </div>
      <dl className="permission-review-list">
        <div><dt>Action</dt><dd>{log.action}</dd></div>
        <div><dt>Resource</dt><dd>{log.vendor || "Not provided"}</dd></div>
        <div><dt>Reason</dt><dd>{log.reason}</dd></div>
        <div><dt>Risk</dt><dd>{log.risk}</dd></div>
        <div><dt>Permission</dt><dd>{log.permissionId || "No matching permission"}</dd></div>
        <div><dt>Request ID</dt><dd><code>{log.requestId}</code></dd></div>
        <div><dt>Timestamp</dt><dd>{formatAgentDate(log.createdAt)}</dd></div>
      </dl>
    </dialog>
  );
}

export function AgentActivity({ agentId }: { agentId: string }) {
  const { apiJson } = useDashboardApi();
  const { href } = useDashboardPaths();
  const [draftFilters, setDraftFilters] = useState<AgentActivityFilters>(EMPTY_ACTIVITY_FILTERS);
  const [filters, setFilters] = useState<AgentActivityFilters>(EMPTY_ACTIVITY_FILTERS);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [pagination, setPagination] = useState<ActivityResponse["pagination"]>({ limit: 20, page: 1, total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<ActivityLog | null>(null);

  const loadPage = useCallback(async (page: number, append = false) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiJson<ActivityResponse>(buildAgentActivityQuery(agentId, filters, page, 20));
      setLogs((current) => append ? [...current, ...result.logs] : result.logs);
      setPagination(result.pagination);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Activity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [agentId, apiJson, filters]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitialPage() {
      setError("");
      try {
        const result = await apiJson<ActivityResponse>(buildAgentActivityQuery(agentId, filters, 1, 20));
        if (!cancelled) {
          setLogs(result.logs);
          setPagination(result.pagination);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Activity could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInitialPage();
    return () => { cancelled = true; };
  }, [agentId, apiJson, filters]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setFilters({ ...draftFilters });
  };

  const resetFilters = () => {
    setLoading(true);
    setDraftFilters(EMPTY_ACTIVITY_FILTERS);
    setFilters(EMPTY_ACTIVITY_FILTERS);
  };

  return (
    <div className="agent-section-stack">
      <form className="dashboard-panel" onSubmit={applyFilters}>
        <div className="dashboard-section-header">
          <div>
            <h2>Agent activity</h2>
            <p>Decisions load 20 at a time and stay scoped to this agent.</p>
          </div>
        </div>
        <div className="agent-activity-filters">
          <label>
            <span>Decision</span>
            <select value={draftFilters.decision} onChange={(event) => setDraftFilters({ ...draftFilters, decision: event.target.value as AgentActivityFilters["decision"] })}>
              <option value="">Allowed and denied</option>
              <option value="allowed">Allowed</option>
              <option value="denied">Denied</option>
              <option value="approval_required">Approval required</option>
            </select>
          </label>
          <label>
            <span>Action</span>
            <input value={draftFilters.action} onChange={(event) => setDraftFilters({ ...draftFilters, action: event.target.value })} placeholder="execute_command" />
          </label>
          <label>
            <span>Vendor or resource</span>
            <input value={draftFilters.resource} onChange={(event) => setDraftFilters({ ...draftFilters, resource: event.target.value })} placeholder="shell" />
          </label>
          <label>
            <span>From</span>
            <input type="date" value={draftFilters.from} onChange={(event) => setDraftFilters({ ...draftFilters, from: event.target.value })} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={draftFilters.to} onChange={(event) => setDraftFilters({ ...draftFilters, to: event.target.value })} />
          </label>
        </div>
        <div className="form-actions">
          <Button type="submit" variant="primary">Apply filters</Button>
          <Button onClick={resetFilters} type="button">Reset</Button>
        </div>
      </form>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <section aria-labelledby="agent-activity-results-title">
        <div className="agent-section-heading">
          <div>
            <h2 id="agent-activity-results-title">Decision history</h2>
            <p>{pagination.total} matching record{pagination.total === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div className="agent-activity-list">
          {logs.map((log) => (
            <article className="agent-activity-row" key={log.requestId}>
              <header>
                <div>
                  <strong>{log.action}</strong>
                  <span>{log.vendor || "No resource provided"}</span>
                </div>
                <Badge>{decisionLabel(log)}</Badge>
              </header>
              <p>{log.reason}</p>
              <dl>
                <div><dt>Request ID</dt><dd><code>{log.requestId}</code></dd></div>
                <div><dt>Timestamp</dt><dd>{formatAgentDate(log.createdAt)}</dd></div>
                {log.permissionId ? <div><dt>Permission</dt><dd><code>{log.permissionId}</code></dd></div> : null}
              </dl>
              <footer className="form-actions">
                {!log.allowed ? <Button onClick={() => setReceipt(log)} type="button">View receipt</Button> : null}
                {activityDecision(log) === "approval_required" && log.approvalId ? (
                  <ButtonLink href={href(`/dashboard/approvals?requestId=${encodeURIComponent(log.requestId)}`)}>Open approval</ButtonLink>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
        {!loading && !logs.length ? (
          <EmptyState className="dashboard-empty">No agent activity matches these filters.</EmptyState>
        ) : null}
        {loading ? <p className="field-help" role="status">Loading activity…</p> : null}
        {pagination.hasMore ? (
          <Button disabled={loading} onClick={() => void loadPage(pagination.page + 1, true)} type="button">Load more</Button>
        ) : null}
      </section>
      {receipt ? <ReceiptDialog log={receipt} onClose={() => setReceipt(null)} /> : null}
    </div>
  );
}
