"use client";

import { useCallback, useEffect, useState } from "react";
import { CodeBlock } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import {
  ENFORCEMENT_KIND_LABELS,
  SETUP_LOCATION_DESCRIPTIONS,
  SETUP_LOCATION_LABELS,
  TARGET_LOCATIONS,
  failBehaviourSummary,
  getSetupPath,
  locationPolicyNote,
  renderSetupSteps,
  type SetupLocation,
  type SetupTarget
} from "@/lib/integrationSetup";
import type { AgentSetupReadiness } from "@/lib/setupReadinessTypes";
import { SetupContinueRow, SetupStepIntro } from "./setupPrimitives";

/** How often we re-ask the server whether the credential has been used yet. */
const POLL_INTERVAL_MS = 4000;

function SignalRow({
  label,
  ok,
  detail,
  pending
}: {
  label: string;
  ok: boolean;
  detail?: string;
  pending?: boolean;
}) {
  return (
    <div className="connect-signal" data-ok={ok}>
      <span className="connect-signal__mark" aria-hidden="true">
        {ok ? "✓" : pending ? "…" : "○"}
      </span>
      <span className="connect-signal__body">
        <strong>{label}</strong>
        {detail ? <span>{detail}</span> : null}
      </span>
    </div>
  );
}

export function ConnectStep({
  target,
  location,
  onLocationChange,
  agentId,
  baseUrl,
  approvalCount,
  readiness,
  onReadinessChange,
  onContinue,
  error
}: {
  target: SetupTarget;
  location: SetupLocation;
  onLocationChange: (next: SetupLocation) => void;
  agentId: string | null;
  baseUrl: string | null;
  approvalCount: number;
  readiness: AgentSetupReadiness | null;
  onReadinessChange: (next: AgentSetupReadiness) => void;
  onContinue: () => void;
  error?: string;
}) {
  const { apiJson } = useDashboardApi();
  const path = getSetupPath(target);
  const steps = renderSetupSteps(path, { agentId, baseUrl });
  const locations = TARGET_LOCATIONS[target];
  const ciNote = locationPolicyNote(location, approvalCount);

  const [polling, setPolling] = useState(false);

  const connected = readiness?.credential.ok ?? false;

  const check = useCallback(async () => {
    if (!agentId) return;
    setPolling(true);
    try {
      const result = await apiJson<{ readiness: AgentSetupReadiness }>(
        `/api/dashboard/agents/${encodeURIComponent(agentId)}/setup-status`
      );
      onReadinessChange(result.readiness);
    } catch {
      // A failed poll is not a setup failure; the manual button stays available.
    } finally {
      setPolling(false);
    }
  }, [agentId, apiJson, onReadinessChange]);

  useEffect(() => {
    if (!agentId || connected) return;
    // Poll until something presents the credential, then stop. This is how the
    // step knows the customer really connected instead of asking them to claim
    // they did.
    const timer = setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [agentId, connected, check]);

  return (
    <>
      <SetupStepIntro
        title={`Connect ${path.label}`}
        helper={path.outcome}
      >
        {locations.length > 1 ? (
          <div className="setup-choices setup-choices--grid">
            {locations.map((option) => (
              <button
                aria-pressed={location === option}
                className={`setup-choice${location === option ? " setup-choice--active" : ""}`}
                key={option}
                onClick={() => onLocationChange(option)}
                type="button"
              >
                <span className="setup-choice__mark setup-choice__mark--radio" aria-hidden="true">
                  {location === option ? "✓" : ""}
                </span>
                <span className="setup-choice__body">
                  <strong>{SETUP_LOCATION_LABELS[option]}</strong>
                  <span>{SETUP_LOCATION_DESCRIPTIONS[option]}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="connect-facts">
          <div>
            <p className="cx-label">How it stops things</p>
            <p>{ENFORCEMENT_KIND_LABELS[path.enforcement]}</p>
            <p className="connect-facts__hint">{path.enforcementPoint}</p>
          </div>
          <div>
            <p className="cx-label">If BehalfID is unreachable</p>
            <p>{path.fail.failsOpen ? "The action goes ahead" : "Your code decides"}</p>
            <p className="connect-facts__hint">{failBehaviourSummary(path)}</p>
          </div>
        </div>

        {path.limits ? (
          <p className="connect-limits" role="note">
            <strong>Worth knowing.</strong> {path.limits}
          </p>
        ) : null}

        {ciNote ? (
          <p className="connect-limits connect-limits--warn" role="note">
            <strong>Approvals in CI.</strong> {ciNote}
          </p>
        ) : null}

        <ol className="connect-steps">
          {steps.map((step, index) => (
            <li className="connect-step" key={step.id}>
              <div className="connect-step__head">
                <span className="connect-step__num" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <p className="connect-step__title">{step.title}</p>
                  <p className="connect-step__body">{step.body}</p>
                </div>
              </div>
              {step.command ? (
                <CodeBlock label={step.language === "bash" ? "terminal" : step.language}>
                  {step.command}
                </CodeBlock>
              ) : null}
              {step.detail ? (
                <details className="protect-details">
                  <summary>What this changes</summary>
                  <p className="connect-step__detail">{step.detail}</p>
                </details>
              ) : null}
            </li>
          ))}
        </ol>

        <section className="connect-detect" aria-live="polite">
          <div className="connect-detect__head">
            <p className="cx-label">Connection</p>
            <button
              className="protect-customize"
              disabled={polling || !agentId}
              onClick={() => void check()}
              type="button"
            >
              {polling ? "Checking…" : "Check now"}
            </button>
          </div>
          <SignalRow
            detail={readiness?.credential.detail}
            label={connected ? "This agent has reached BehalfID" : "Waiting for the first request"}
            ok={connected}
            pending={!connected}
          />
          <SignalRow
            detail={readiness?.policy.detail}
            label="Policy in place"
            ok={readiness?.policy.ok ?? false}
          />
          <p className="connect-detect__hint">
            {connected
              ? "We saw this agent's credential, so the connection is real — not just configured."
              : "This updates on its own once your agent makes its first request. You can carry on and come back to it."}
          </p>
        </section>
      </SetupStepIntro>
      <SetupContinueRow
        continueLabel={connected ? "Continue" : "Continue anyway"}
        error={error}
        onContinue={onContinue}
      />
    </>
  );
}
