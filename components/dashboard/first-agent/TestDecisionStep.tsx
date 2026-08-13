"use client";

import { SetupReceiptCard } from "./SetupReceiptCard";
import { SetupContinueRow, SetupStepIntro } from "./setupPrimitives";

export type TestDecisionResult = {
  allowed: boolean;
  approvalRequired?: boolean;
  reason?: string;
  requestId?: string;
  approvalId?: string | null;
  action?: string;
  vendor?: string | null;
  environment?: string | null;
};

export function TestDecisionStep({
  action,
  resource,
  environment,
  controlLabel,
  expected,
  running,
  result,
  onRun,
  error
}: {
  action: string;
  resource: string;
  environment: string;
  controlLabel?: string;
  expected?: "allow" | "approve" | "block";
  running: boolean;
  result: TestDecisionResult | null;
  onRun: () => void;
  error?: string;
}) {
  const expectedCopy =
    expected === "approve"
      ? "BehalfID should hold this and ask you to approve it."
      : expected === "block"
        ? "BehalfID should refuse this outright."
        : "BehalfID should let this through and record it.";

  return (
    <>
      <SetupStepIntro
        title="See it work"
        helper={`We will send a real request through your new agent${controlLabel ? ` for "${controlLabel}"` : ""}. ${expectedCopy}`}
      >
        <div className="setup-review">
          <dl className="setup-review__list">
            <div className="setup-review__row">
              <dt>Action</dt>
              <dd><code>{action}</code></dd>
            </div>
            <div className="setup-review__row">
              <dt>Resource</dt>
              <dd><code>{resource}</code></dd>
            </div>
            <div className="setup-review__row">
              <dt>Environment</dt>
              <dd><code>{environment}</code></dd>
            </div>
            <div className="setup-review__row">
              <dt>Expected answer</dt>
              <dd>{expected === "approve" ? "Waits for you" : expected === "block" ? "Refused" : "Runs on its own"}</dd>
            </div>
          </dl>
        </div>
        {result ? <SetupReceiptCard result={result} /> : null}
      </SetupStepIntro>
      <SetupContinueRow
        onContinue={onRun}
        continueLabel={running ? "Running…" : result ? "Continue to logs" : "Send the request"}
        disabled={running}
        loading={running}
        error={error}
      />
    </>
  );
}
