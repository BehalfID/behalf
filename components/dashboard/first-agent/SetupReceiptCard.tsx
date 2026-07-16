"use client";

import Link from "next/link";
import { FormAlert } from "@/components/auth/AuthShell";
import { OnboardingIntro } from "@/components/onboarding/OnboardingShell";
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

export function LogsHandoffStep({
  requestId,
  agentId,
  onCopy
}: {
  requestId?: string;
  agentId?: string;
  onCopy: (value: string, label: string) => void;
}) {
  const { href } = useDashboardPaths();
  const logsHref = requestId
    ? href(`/dashboard/logs?search=${encodeURIComponent(requestId)}`)
    : agentId
      ? href(`/dashboard/logs?agentId=${encodeURIComponent(agentId)}`)
      : href("/dashboard/logs");

  return (
    <>
      <OnboardingIntro
        eyebrow="Agent setup · Complete"
        title="Your first agent is ready"
        description="The test decision is recorded in audit logs. Open the event to inspect its receipt, metadata, and linked approval when one was created."
      />
      <FormAlert tone="success">Agent identity, credential, control profile, and approval gates are active.</FormAlert>
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
          <Link className="ui-button ui-button--ghost" href={href("/dashboard")}>
            Return to control plane
          </Link>
        </div>
      </section>
    </>
  );
}
