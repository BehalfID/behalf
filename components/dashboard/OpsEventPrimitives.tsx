"use client";

import Link from "next/link";
import {
  formatActionLabel,
  formatApprovalTargetLabel,
  formatOpsTime,
  formatPauseApprovalDetails,
  formatPauseApprovalTitle,
  isLegacyUnboundApproval,
  isManagedProfilePauseApproval,
  logDecisionShortLabel,
  logDecisionTone,
  type OpsApprovalRequest,
  type OpsLog
} from "./opsLogTypes";

export function DecisionIndicator({
  log,
  compact = false
}: {
  log: Pick<OpsLog, "allowed" | "approvalRequired" | "reason" | "decision">;
  compact?: boolean;
}) {
  const tone = logDecisionTone(log);
  return (
    <span className={`ops-status ops-status--${tone}${compact ? " ops-status--compact" : ""}`}>
      <span className="ops-status__dot" aria-hidden="true" />
      <span className="ops-status__label">{logDecisionShortLabel(log)}</span>
    </span>
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
      </p>
      <p className="ops-event-card__reason">{log.reason}</p>
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

export function OpsApprovalCard({
  req,
  working,
  highlight,
  onApprove,
  onDeny
}: {
  req: OpsApprovalRequest;
  working: boolean;
  highlight?: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const pauseApproval = isManagedProfilePauseApproval(req);
  const legacyUnbound = isLegacyUnboundApproval(req);
  return (
    <article className={`ops-approval-card${highlight ? " ops-approval-card--highlight" : ""}`}>
      <div className="ops-approval-card__head">
        <span className="ops-status ops-status--approval ops-status--compact">
          <span className="ops-status__dot" aria-hidden="true" />
          <span className="ops-status__label">Pending</span>
        </span>
        <time className="ops-approval-card__time" dateTime={req.createdAt}>{formatOpsTime(req.createdAt)}</time>
      </div>
      <p className="ops-approval-card__title">
        {pauseApproval ? formatPauseApprovalTitle(req) : (req.agentName ?? req.agentId)}
      </p>
      <p className="ops-approval-card__action">
        {pauseApproval ? (
          <span>{formatPauseApprovalDetails(req)}</span>
        ) : (
          <>
            <code>{formatActionLabel(req.action, req.vendor)}</code>
            {typeof req.amount === "number" ? <span className="ops-approval-card__amount">${req.amount}</span> : null}
          </>
        )}
      </p>
      {!pauseApproval ? <ApprovalTargetPreview req={req} /> : null}
      <LegacyUnboundWarning req={req} />
      <p className="ops-approval-card__meta">
        {req.requiredRoleLabel ? `Requires ${req.requiredRoleLabel}` : "Awaiting human decision"}
        {" · "}
        {pauseApproval
          ? "Pause in required context requires approval."
          : "Permission requires approval before execution."}
      </p>
      <div className="ops-approval-card__actions">
        <button
          type="button"
          className="ops-btn ops-btn--approve"
          disabled={working || req.canApprove === false || legacyUnbound}
          onClick={onApprove}
        >
          Approve
        </button>
        <button
          type="button"
          className="ops-btn ops-btn--deny"
          disabled={working || req.canDeny === false}
          onClick={onDeny}
        >
          Deny
        </button>
      </div>
      {req.canApprove === false && req.approveBlockReason ? (
        <p className="ops-approval-card__error">{req.approveBlockReason}</p>
      ) : null}
      {req.canDeny === false && req.denyBlockReason ? (
        <p className="ops-approval-card__error">{req.denyBlockReason}</p>
      ) : null}
    </article>
  );
}

export function OpsApprovalQueueRow({
  req,
  working,
  highlight,
  onApprove,
  onDeny
}: {
  req: OpsApprovalRequest;
  working: boolean;
  highlight?: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const pauseApproval = isManagedProfilePauseApproval(req);
  const legacyUnbound = isLegacyUnboundApproval(req);
  return (
    <div className={`ops-queue-row${highlight ? " ops-queue-row--highlight" : ""}`}>
      <div className="ops-queue-row__main">
        <div className="ops-queue-row__head">
          <span className="ops-status ops-status--approval ops-status--compact">
            <span className="ops-status__dot" aria-hidden="true" />
            <span className="ops-status__label">Pending</span>
          </span>
          <time className="ops-queue-row__time" dateTime={req.createdAt}>{formatOpsTime(req.createdAt)}</time>
        </div>
        <p className="ops-queue-row__title">
          <span>{pauseApproval ? formatPauseApprovalTitle(req) : (req.agentName ?? req.agentId)}</span>
          {!pauseApproval ? <code>{formatActionLabel(req.action, req.vendor)}</code> : null}
        </p>
        {!pauseApproval ? <ApprovalTargetPreview req={req} /> : null}
        <LegacyUnboundWarning req={req} />
        <p className="ops-queue-row__meta">
          {pauseApproval ? (
            formatPauseApprovalDetails(req)
          ) : (
            <>
              {req.requiredRoleLabel ? `${req.requiredRoleLabel} approval · ` : ""}
              {typeof req.amount === "number" ? `$${req.amount} · ` : ""}
              Gated action waiting for review
            </>
          )}
        </p>
      </div>
      <div className="ops-queue-row__aside">
        <div className="ops-queue-row__actions">
          <button
            type="button"
            className="ops-btn ops-btn--approve"
            disabled={working || req.canApprove === false || legacyUnbound}
            onClick={onApprove}
          >
            Approve
          </button>
          <button
            type="button"
            className="ops-btn ops-btn--deny"
            disabled={working || req.canDeny === false}
            onClick={onDeny}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
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
