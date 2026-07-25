"use client";

import Link from "next/link";
import { Badge, Button, DecisionBadge, type BadgeVariant } from "@/components/ui";
import {
  approvalStatusLabel,
  formatActionLabel,
  formatApprovalTargetLabel,
  formatOpsTime,
  getApprovalDisplayStatus,
  isLegacyUnboundApproval,
  isManagedProfilePauseApproval,
  logDecisionShortLabel,
  logDecisionTone,
  type ApprovalDisplayStatus,
  type OpsApprovalRequest,
  type OpsLog
} from "./opsLogTypes";

function approvalStatusVariant(status: ApprovalDisplayStatus): BadgeVariant {
  if (status === "approved") return "success";
  if (status === "pending") return "warning";
  if (status === "denied") return "destructive";
  return "outline";
}

export function ApprovalStatusBadge({
  req,
  compact = false
}: {
  req: Pick<OpsApprovalRequest, "status" | "grantExpiresAt">;
  compact?: boolean;
}) {
  const status = getApprovalDisplayStatus(req);
  return (
    <Badge
      className={`approval-status-badge approval-status-badge--${status}${compact ? " approval-status-badge--compact" : ""}`}
      variant={approvalStatusVariant(status)}
    >
      <span className="ui-status-dot" aria-hidden="true" />
      {approvalStatusLabel(status)}
    </Badge>
  );
}

export function DecisionIndicator({
  log,
  compact = false
}: {
  log: Pick<OpsLog, "allowed" | "approvalRequired" | "reason" | "decision">;
  compact?: boolean;
}) {
  const decision = logDecisionTone(log);
  return (
    <DecisionBadge
      className={compact ? "decision-badge--compact" : undefined}
      decision={decision}
    >
      {logDecisionShortLabel(log)}
    </DecisionBadge>
  );
}

export function OpsLogEventCard({
  log,
  active,
  onSelect
}: {
  log: OpsLog;
  active?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`ops-event-card${active ? " ops-event-card--active" : ""}`}
      onClick={onSelect}
      aria-label={`Inspect ${log.action} decision for ${log.agentName ?? log.agentId}`}
    >
      <div className="ops-event-card__head">
        <DecisionIndicator log={log} compact />
        <time className="ops-event-card__time" dateTime={log.createdAt}>{formatOpsTime(log.createdAt)}</time>
      </div>
      <p className="ops-event-card__primary">
        <span className="ops-event-card__agent">{log.agentName ?? log.agentId}</span>
        <span className="ops-event-card__sep" aria-hidden="true">·</span>
        <code className="ops-event-card__action">{log.action}</code>
      </p>
      <p className="ops-event-card__meta">
        {log.vendor ? <span>{log.vendor}</span> : null}
        {log.environment ? (
          <>
            {log.vendor ? <span className="ops-event-card__sep" aria-hidden="true">·</span> : null}
            <span>{log.environment}</span>
          </>
        ) : null}
        {(log.vendor || log.environment) ? <span className="ops-event-card__sep" aria-hidden="true">·</span> : null}
        <span>{log.risk} risk</span>
      </p>
      <p className="ops-event-card__reason">{log.reason}</p>
      {log.permissionId || log.approvalId ? (
        <p className="ops-event-card__references">
          {log.permissionId ? <span>Policy <code>{log.permissionId}</code></span> : null}
          {log.permissionId && log.approvalId ? <span aria-hidden="true">·</span> : null}
          {log.approvalId ? <span>Approval <code>{log.approvalId}</code></span> : null}
        </p>
      ) : null}
      <span className="ops-event-card__inspect">Inspect record <span aria-hidden="true">→</span></span>
    </button>
  );
}

function ApprovalTargetPreview({ req }: { req: OpsApprovalRequest }) {
  const label = formatApprovalTargetLabel(req.argumentKind);
  if (!label || !req.argumentPreview) return null;
  return (
    <div className="ops-approval-card__target">
      <p className="ops-approval-card__target-label">{label}</p>
      <pre className="ops-approval-card__target-preview">{req.argumentPreview}</pre>
      {req.argumentPreviewTruncated ? (
        <p className="ops-approval-card__target-note">
          Preview truncated. Approval remains bound to the complete original value.
        </p>
      ) : null}
    </div>
  );
}

function LegacyUnboundWarning({ req }: { req: OpsApprovalRequest }) {
  if (!isLegacyUnboundApproval(req)) return null;
  return (
    <p className="ops-approval-card__warning" role="status">
      Legacy unbound request — approval disabled. Retry the agent action to create a bound request.
    </p>
  );
}

function ApprovalDetailItem({
  label,
  value,
  machine = false
}: {
  label: string;
  value: React.ReactNode;
  machine?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={machine ? "ops-approval-detail__machine" : undefined}>{value}</dd>
    </div>
  );
}

export function ApprovalRequestDetail({ req }: { req: OpsApprovalRequest }) {
  const pauseApproval = isManagedProfilePauseApproval(req);
  return (
    <details className="ops-approval-detail">
      <summary>Review request details</summary>
      <div className="ops-approval-detail__body">
        <section>
          <h4>{pauseApproval ? "Pause request" : "Request"}</h4>
          <dl>
            {pauseApproval ? (
              <>
                <ApprovalDetailItem label="Requester" value={req.requesterName ?? "Unavailable"} />
                {req.pauseTool ? <ApprovalDetailItem label="Tool" value={req.pauseTool} machine /> : null}
                <ApprovalDetailItem
                  label="Repository"
                  value={req.pauseRepo ?? (req.pauseScope === "all" ? "All repositories" : "Unavailable")}
                  machine={Boolean(req.pauseRepo)}
                />
                {req.pauseBranch ? <ApprovalDetailItem label="Branch" value={req.pauseBranch} machine /> : null}
                {req.pauseDeviceId ? <ApprovalDetailItem label="Device" value={req.pauseDeviceId} machine /> : null}
                {typeof req.requestedDurationMinutes === "number" ? (
                  <ApprovalDetailItem label="Duration" value={`${req.requestedDurationMinutes} minutes`} />
                ) : null}
              </>
            ) : (
              <>
                <ApprovalDetailItem label="Agent" value={req.agentName ?? req.agentId} />
                <ApprovalDetailItem label="Action" value={<code>{req.action}</code>} machine />
                {req.vendor ? <ApprovalDetailItem label="Target" value={req.vendor} /> : null}
                {typeof req.amount === "number" ? <ApprovalDetailItem label="Amount" value={`$${req.amount}`} /> : null}
              </>
            )}
          </dl>
          {!pauseApproval ? <ApprovalTargetPreview req={req} /> : null}
          {pauseApproval && req.pauseReason ? <p className="ops-approval-detail__reason"><strong>Requester reason</strong>{req.pauseReason}</p> : null}
        </section>

        <section>
          <h4>Policy evaluation</h4>
          <dl>
            {!pauseApproval ? <ApprovalDetailItem label="Permission" value={<code>{req.permissionId}</code>} machine /> : null}
            <ApprovalDetailItem label="Decision" value="Approval required" />
            <ApprovalDetailItem label="Authority" value={req.requiredRoleLabel ?? "Authorized workspace reviewer"} />
          </dl>
          {req.contextReason ? <p className="ops-approval-detail__reason"><strong>Policy context</strong>{req.contextReason}</p> : null}
        </section>

        <section>
          <h4>Record</h4>
          <dl>
            <ApprovalDetailItem label="Approval ID" value={<code>{req.approvalId}</code>} machine />
            <ApprovalDetailItem label="Request ID" value={<code>{req.requestId}</code>} machine />
            <ApprovalDetailItem label="Requested" value={formatOpsTime(req.createdAt)} />
            {req.resolvedAt ? <ApprovalDetailItem label="Resolved" value={formatOpsTime(req.resolvedAt)} /> : null}
            {req.resolvedBy ? <ApprovalDetailItem label="Resolved by" value={<code>{req.resolvedBy}</code>} machine /> : null}
            {req.grantExpiresAt ? <ApprovalDetailItem label="Grant expires" value={formatOpsTime(req.grantExpiresAt)} /> : null}
            {req.usedAt ? <ApprovalDetailItem label="Consumed" value={formatOpsTime(req.usedAt)} /> : null}
          </dl>
        </section>
      </div>
      <p className="ops-approval-detail__boundary">
        This decision is bound to this request. Approval does not create reusable permission and a matching retry consumes the grant.
      </p>
    </details>
  );
}

function ApprovalDecisionPanel({
  req,
  workingAction,
  onApprove,
  onDeny
}: {
  req: OpsApprovalRequest;
  workingAction: "approve" | "deny" | null;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const legacyUnbound = isLegacyUnboundApproval(req);
  const subject = isManagedProfilePauseApproval(req)
    ? "managed profile pause request"
    : `${req.action} request for ${req.agentName ?? req.agentId}`;
  return (
    <aside className="ops-approval-decision" aria-label="Approval decision" aria-busy={Boolean(workingAction)}>
      <p className="ops-approval-decision__label">Human decision</p>
      <div className="ops-approval-decision__actions">
        <Button
          type="button"
          variant="primary"
          size="small"
          loading={workingAction === "approve"}
          disabled={Boolean(workingAction) || req.canApprove === false || legacyUnbound}
          onClick={onApprove}
          aria-label={`Approve ${subject}`}
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          size="small"
          loading={workingAction === "deny"}
          disabled={Boolean(workingAction) || req.canDeny === false}
          onClick={onDeny}
          aria-label={`Deny ${subject}`}
        >
          Deny
        </Button>
      </div>
      {req.canApprove === false && req.approveBlockReason ? (
        <p className="ops-approval-card__error">Approve unavailable: {req.approveBlockReason}</p>
      ) : null}
      {req.canDeny === false && req.denyBlockReason ? (
        <p className="ops-approval-card__error">Deny unavailable: {req.denyBlockReason}</p>
      ) : null}
    </aside>
  );
}

function ApprovalSummary({ req, mobile = false }: { req: OpsApprovalRequest; mobile?: boolean }) {
  const pauseApproval = isManagedProfilePauseApproval(req);
  const prefix = mobile ? "ops-approval-card" : "ops-queue-row";
  return (
    <div className={`${prefix}__main`}>
      <div className={`${prefix}__head`}>
        <ApprovalStatusBadge req={req} compact />
        <time className={`${prefix}__time`} dateTime={req.createdAt}>{formatOpsTime(req.createdAt)}</time>
      </div>
      <p className={`${prefix}__eyebrow`}>
        {pauseApproval ? "Managed profile" : `Agent · ${req.agentName ?? req.agentId}`}
      </p>
      <h3 className={`${prefix}__title`}>
        {pauseApproval ? "Managed profile pause" : <code>{formatActionLabel(req.action)}</code>}
      </h3>
      <p className={`${prefix}__summary`}>
        {pauseApproval ? (
          <>
            Requested by {req.requesterName ?? "workspace member"}
            {req.pauseTool ? <> for <code>{req.pauseTool}</code></> : null}
          </>
        ) : (
          <>
            {req.vendor ? <span>Target <strong>{req.vendor}</strong></span> : <span>No target recorded</span>}
            {typeof req.amount === "number" ? <span>Amount <strong>${req.amount}</strong></span> : null}
          </>
        )}
      </p>
      {!pauseApproval ? <ApprovalTargetPreview req={req} /> : null}
      <LegacyUnboundWarning req={req} />
      <p className={`${prefix}__meta`}>
        <span>{req.requiredRoleLabel ? `Requires ${req.requiredRoleLabel}` : "Awaiting an authorized reviewer"}</span>
        {!pauseApproval ? <span>Policy <code>{req.permissionId}</code></span> : null}
      </p>
      <ApprovalRequestDetail req={req} />
    </div>
  );
}

export function OpsApprovalCard({
  req,
  workingAction,
  highlight,
  onApprove,
  onDeny
}: {
  req: OpsApprovalRequest;
  workingAction: "approve" | "deny" | null;
  highlight?: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <article
      className={`ops-approval-card${highlight ? " ops-approval-card--highlight" : ""}`}
      role="listitem"
    >
      <ApprovalSummary req={req} mobile />
      <ApprovalDecisionPanel
        req={req}
        workingAction={workingAction}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    </article>
  );
}

export function OpsApprovalQueueRow({
  req,
  workingAction,
  highlight,
  onApprove,
  onDeny
}: {
  req: OpsApprovalRequest;
  workingAction: "approve" | "deny" | null;
  highlight?: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <article
      className={`ops-queue-row${highlight ? " ops-queue-row--highlight" : ""}`}
      role="listitem"
    >
      <ApprovalSummary req={req} />
      <ApprovalDecisionPanel
        req={req}
        workingAction={workingAction}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    </article>
  );
}

export function OpsDrawerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className="ops-drawer-link" href={href}>
      <span className="ops-drawer-link__label">{children}</span>
      <span className="ops-drawer-link__arrow" aria-hidden="true">→</span>
    </Link>
  );
}
