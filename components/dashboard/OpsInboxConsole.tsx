"use client";

import Link from "next/link";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { DecisionIndicator, OpsApprovalCard, OpsApprovalQueueRow } from "./OpsEventPrimitives";
import {
  formatPauseApprovalDetails,
  formatPauseApprovalTitle,
  formatOpsTime,
  isManagedProfilePauseApproval,
  type OpsApprovalRequest,
  type OpsLog,
} from "./opsLogTypes";

export function OpsInboxConsole({
  inbox,
  working,
  resolveError,
  onResolve,
  dateFormatter
}: {
  inbox: { data: { pendingApprovals: OpsApprovalRequest[]; deniedHighRisk: OpsLog[] } | null; reload: () => Promise<void> };
  working: string | null;
  resolveError: string;
  onResolve: (approvalId: string, action: "approve" | "deny") => Promise<void>;
  dateFormatter: (value?: string | null) => string;
}) {
  const pending = (inbox.data?.pendingApprovals ?? []).filter((item) => item.status === "pending");
  const activeGrants = (inbox.data?.pendingApprovals ?? []).filter((item) => item.status === "approved");
  const denied = inbox.data?.deniedHighRisk ?? [];

  return (
    <div className="ops-console ops-triage">
      <PageHeader
        title="Needs attention"
        description="Triage pending approvals and recent high-risk denials."
        action={<Button onClick={() => void inbox.reload()} type="button" className="ops-btn ops-btn--ghost">Refresh</Button>}
        className="dashboard-header ops-console__header"
      />
      {resolveError ? <p className="form-error">{resolveError}</p> : null}

      <section className="ops-triage__section">
        <div className="ops-triage__head">
          <h2 className="ops-triage__title">Pending actions</h2>
          <div className="ops-triage__head-actions">
            {pending.length ? <span className="ops-triage__count">{pending.length} waiting</span> : null}
            <Link href="/dashboard/approvals" className="ops-triage__link">Open queue</Link>
          </div>
        </div>
        {!inbox.data ? (
          <p className="ops-console__empty">Loading queue…</p>
        ) : pending.length === 0 ? (
          <EmptyState className="dashboard-empty">
            All clear — no pending approvals.
          </EmptyState>
        ) : (
          <>
            <div className="ops-queue-list ops-queue-list--desktop">
              {pending.map((req) => (
                <OpsApprovalQueueRow
                  key={req.approvalId}
                  req={req}
                  working={working === req.approvalId}
                  onApprove={() => void onResolve(req.approvalId, "approve")}
                  onDeny={() => void onResolve(req.approvalId, "deny")}
                />
              ))}
            </div>
            <div className="ops-queue-list ops-queue-list--mobile">
              {pending.map((req) => (
                <OpsApprovalCard
                  key={req.approvalId}
                  req={req}
                  working={working === req.approvalId}
                  onApprove={() => void onResolve(req.approvalId, "approve")}
                  onDeny={() => void onResolve(req.approvalId, "deny")}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {activeGrants.length ? (
        <section className="ops-triage__section">
          <div className="ops-triage__head">
            <h2 className="ops-triage__title">Recently approved grants</h2>
          </div>
          <div className="ops-triage__grants">
            {activeGrants.map((req) => {
              const pauseApproval = isManagedProfilePauseApproval(req);
              return (
              <div className="ops-triage__grant" key={req.approvalId}>
                <span className="ops-status ops-status--allowed ops-status--compact">
                  <span className="ops-status__dot" aria-hidden="true" />
                  <span className="ops-status__label">Approved</span>
                </span>
                <div>
                  <p className="ops-triage__grant-title">
                    {pauseApproval
                      ? formatPauseApprovalTitle(req)
                      : `${req.agentName ?? req.agentId} · ${req.action}`}
                  </p>
                  <p className="ops-triage__grant-meta">
                    {pauseApproval ? formatPauseApprovalDetails(req) : null}
                    {pauseApproval && req.grantExpiresAt ? " · " : null}
                    {req.grantExpiresAt ? `Grant until ${dateFormatter(req.grantExpiresAt)}` : null}
                  </p>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="ops-triage__section">
        <div className="ops-triage__head">
          <h2 className="ops-triage__title">Recent high-risk denials</h2>
          <Link href="/dashboard/logs?decision=denied&risk=high" className="ops-triage__link">View in logs</Link>
        </div>
        {!inbox.data ? (
          <p className="ops-console__empty">Loading denials…</p>
        ) : denied.length === 0 ? (
          <EmptyState className="dashboard-empty">No high-risk denials in the last 48 hours.</EmptyState>
        ) : (
          <div className="ops-events__list ops-events__list--inbox">
            {denied.map((log) => (
              <article className="ops-event-card ops-event-card--static" key={log.requestId}>
                <div className="ops-event-card__head">
                  <DecisionIndicator log={log} compact />
                  <time className="ops-event-card__time" dateTime={log.createdAt}>{formatOpsTime(log.createdAt)}</time>
                </div>
                <p className="ops-event-card__primary">
                  <span className="ops-event-card__agent">{log.agentName ?? log.agentId}</span>
                  <span className="ops-event-card__sep" aria-hidden="true">·</span>
                  <code className="ops-event-card__action">{log.action}</code>
                </p>
                <p className="ops-event-card__reason">{log.reason}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
