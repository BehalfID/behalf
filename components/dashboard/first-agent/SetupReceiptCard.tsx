"use client";

import Link from "next/link";
import { DecisionIndicator } from "@/components/dashboard/OpsEventPrimitives";
import { useDashboardPaths } from "@/components/workspace/WorkspaceProvider";
import type { TestDecisionResult } from "./TestDecisionStep";

export function SetupReceiptCard({ result }: { result: TestDecisionResult }) {
  const { href } = useDashboardPaths();
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
              <Link href={href(`/dashboard/approvals?highlight=${encodeURIComponent(result.approvalId)}`)}>
                Open pending approval
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
