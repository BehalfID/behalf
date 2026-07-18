"use client";

import Link from "next/link";
import { Alert, Badge, Button, DashboardState, PageHeader } from "@/components/ui";
import { useDashboardPaths } from "@/components/workspace/WorkspaceProvider";
import {
  ApprovalRequestDetail,
  ApprovalStatusBadge,
  DecisionIndicator,
  OpsApprovalCard,
  OpsApprovalQueueRow
} from "./OpsEventPrimitives";
import {
  formatPauseApprovalDetails,
  formatPauseApprovalTitle,
  formatOpsTime,
  getApprovalDisplayStatus,
  isManagedProfilePauseApproval,
  type OpsApprovalRequest,
  type OpsLog,
} from "./opsLogTypes";

export function OpsInboxConsole({
  inbox,
  working,
  resolveError,
  statusMessage,
  onResolve,
  dateFormatter
}: {
  inbox: { data: { pendingApprovals: OpsApprovalRequest[]; deniedHighRisk: OpsLog[] } | null; error?: string; reload: () => Promise<void> };
  working: { approvalId: string; action: "approve" | "deny" } | null;
  resolveError: string;
  statusMessage: string;
  onResolve: (approvalId: string, action: "approve" | "deny") => Promise<void>;
  dateFormatter: (value?: string | null) => string;
}) {
  const { href } = useDashboardPaths();
  const pending = (inbox.data?.pendingApprovals ?? []).filter((item) => item.status === "pending");
  const recentApprovals = (inbox.data?.pendingApprovals ?? []).filter((item) => item.status === "approved");
  const denied = inbox.data?.deniedHighRisk ?? [];

  return (
    <div className="ops-console ops-triage">
      <PageHeader
        title="Needs attention"
        eyebrow="Action inbox"
        description="Review bound approval requests first, then investigate recent high-risk denials."
        status={inbox.data ? <Badge variant={pending.length ? "warning" : "outline"}>{pending.length ? `${pending.length} awaiting decision` : "Queue clear"}</Badge> : null}
        action={<Button onClick={() => void inbox.reload()} type="button" variant="outline" size="small">Refresh</Button>}
        className="dashboard-header ops-console__header"
      />
      {statusMessage ? <Alert tone="success" className="ops-feedback">{statusMessage}</Alert> : null}
      {resolveError ? <Alert tone="destructive" className="ops-feedback">{resolveError}</Alert> : null}
      {inbox.error && !inbox.data ? <Alert tone="destructive" className="ops-feedback">{inbox.error}</Alert> : null}

      <section className="ops-triage__section">
        <div className="ops-triage__head">
          <div>
            <p className="ops-triage__kicker">Priority queue</p>
            <h2 className="ops-triage__title">Pending approval</h2>
          </div>
          <div className="ops-triage__head-actions">
            {pending.length ? <span className="ops-triage__count">{pending.length} {pending.length === 1 ? "request" : "requests"}</span> : null}
            <Link href={href("/dashboard/approvals")} className="ops-triage__link">Open queue</Link>
          </div>
        </div>
        {!inbox.data ? (
          <DashboardState kind="loading" title="Loading action inbox" description="Retrieving approval and denial records." />
        ) : pending.length === 0 ? (
          <DashboardState kind="empty" title="No pending approvals" description="All approval-required agent actions have been resolved." />
        ) : (
          <>
            <div className="ops-queue-list ops-queue-list--desktop">
              {pending.map((req) => (
                <OpsApprovalQueueRow
                  key={req.approvalId}
                  req={req}
                  workingAction={working?.approvalId === req.approvalId ? working.action : null}
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
                  workingAction={working?.approvalId === req.approvalId ? working.action : null}
                  onApprove={() => void onResolve(req.approvalId, "approve")}
                  onDeny={() => void onResolve(req.approvalId, "deny")}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {recentApprovals.length ? (
        <section className="ops-triage__section">
          <div className="ops-triage__head">
            <div>
              <p className="ops-triage__kicker">Approval lifecycle</p>
              <h2 className="ops-triage__title">Recent approval decisions</h2>
            </div>
          </div>
          <div className="ops-triage__grants">
            {recentApprovals.map((req) => {
              const pauseApproval = isManagedProfilePauseApproval(req);
              const displayStatus = getApprovalDisplayStatus(req);
              return (
              <div className="ops-triage__grant" key={req.approvalId}>
                <ApprovalStatusBadge req={req} compact />
                <div className="ops-triage__grant-body">
                  <p className="ops-triage__grant-title">
                    {pauseApproval
                      ? formatPauseApprovalTitle(req)
                      : <><strong>{req.agentName ?? req.agentId}</strong> · <code>{req.action}</code></>}
                  </p>
                  <p className="ops-triage__grant-meta">
                    {pauseApproval ? formatPauseApprovalDetails(req) : null}
                    {pauseApproval && req.grantExpiresAt ? " · " : null}
                    {req.grantExpiresAt
                      ? `${displayStatus === "expired" ? "Expired" : "Grant expires"} ${dateFormatter(req.grantExpiresAt)}`
                      : null}
                  </p>
                  <ApprovalRequestDetail req={req} />
                </div>
              </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="ops-triage__section">
        <div className="ops-triage__head">
          <div>
            <p className="ops-triage__kicker">Investigation queue</p>
            <h2 className="ops-triage__title">Recent high-risk denials</h2>
          </div>
          <Link href={href("/dashboard/logs?decision=denied&risk=high")} className="ops-triage__link">View in logs</Link>
        </div>
        {!inbox.data ? (
          <p className="ops-console__empty" role="status">Loading denials…</p>
        ) : denied.length === 0 ? (
          <DashboardState kind="empty" title="No recent high-risk denials" description="No high-risk agent actions were denied in the last 48 hours." />
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
