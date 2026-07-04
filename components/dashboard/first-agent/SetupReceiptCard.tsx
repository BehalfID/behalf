"use client";

import Link from "next/link";
import { DecisionIndicator } from "@/components/dashboard/OpsEventPrimitives";
import type { TestDecisionResult } from "./TestDecisionStep";

export function SetupReceiptCard({ result }: { result: TestDecisionResult }) {
  const logLike = {
    allowed: result.allowed,
    approvalRequired: Boolean(result.approvalRequired),
    reason: result.reason ?? "",
    decision: result.allowed ? "allowed" : result.approvalRequired ? "approval_required" : "denied"
  } as const;

  return (
    <section className="first-agent-receipt ops-panel" aria-label="Test decision receipt">
      <div className="ops-panel__head">
        <p className="cx-label">Decision receipt</p>
        <DecisionIndicator log={logLike} />
      </div>
      <dl className="setup-review__list">
        <div className="setup-review__row">
          <dt>Outcome</dt>
          <dd>{result.reason ?? logLike.decision.replace(/_/g, " ")}</dd>
        </div>
        {result.requestId ? (
          <div className="setup-review__row">
            <dt>Event ID</dt>
            <dd><code>{result.requestId}</code></dd>
          </div>
        ) : null}
        {result.approvalId ? (
          <div className="setup-review__row">
            <dt>Approval</dt>
            <dd>
              <Link href={`/dashboard/approvals?highlight=${encodeURIComponent(result.approvalId)}`}>
                Open pending approval
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

export function LogsHandoffStep({
  requestId,
  agentId,
  onCopy
}: {
  requestId?: string;
  agentId?: string;
  onCopy: (value: string, label: string) => void;
}) {
  const logsHref = requestId
    ? `/dashboard/logs?search=${encodeURIComponent(requestId)}`
    : agentId
      ? `/dashboard/logs?agentId=${encodeURIComponent(agentId)}`
      : "/dashboard/logs";

  return (
    <>
      <h1 className="setup-heading setup-flow__question">Review the event in audit logs</h1>
      <p className="setup-flow__helper">
        Your test decision is recorded in the operational logs console. Open it to inspect the full receipt, metadata, and linked approval if one was created.
      </p>
      <section className="first-agent-receipt ops-panel">
        {requestId ? (
          <dl className="setup-review__list">
            <div className="setup-review__row">
              <dt>Event ID</dt>
              <dd><code>{requestId}</code></dd>
            </div>
          </dl>
        ) : null}
        <div className="first-agent-token-panel__actions">
          {requestId ? (
            <button type="button" className="ui-button ui-button--ghost" onClick={() => onCopy(requestId, "event")}>
              Copy event ID
            </button>
          ) : null}
          <Link className="ui-button ui-button--primary" href={logsHref}>
            Open audit logs
          </Link>
          <Link className="ui-button ui-button--ghost" href="/dashboard">
            Return to control plane
          </Link>
        </div>
      </section>
    </>
  );
}
