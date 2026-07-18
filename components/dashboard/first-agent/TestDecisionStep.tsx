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
  running,
  result,
  onRun,
  error
}: {
  action: string;
  resource: string;
  environment: string;
  running: boolean;
  result: TestDecisionResult | null;
  onRun: () => void;
  error?: string;
}) {
  return (
    <>
      <SetupStepIntro
        title="Run a test decision"
        helper="This sends a real verification request with the new agent credential. The result should reflect the control profile and approval gates you just applied."
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
          </dl>
        </div>
        {result ? <SetupReceiptCard result={result} /> : null}
      </SetupStepIntro>
      <SetupContinueRow
        onContinue={onRun}
        continueLabel={running ? "Running…" : result ? "Continue to logs" : "Run test decision"}
        disabled={running}
        loading={running}
        error={error}
      />
    </>
  );
}
