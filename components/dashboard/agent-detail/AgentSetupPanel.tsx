"use client";

import { useCallback, useEffect, useState } from "react";
import { CodeBlock } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import {
  ENFORCEMENT_KIND_LABELS,
  SETUP_TARGETS,
  SETUP_TARGET_DESCRIPTIONS,
  SETUP_TARGET_LABELS,
  failBehaviourSummary,
  getSetupPath,
  renderSetupSteps,
  setupTargetForSurface,
  type SetupTarget
} from "@/lib/integrationSetup";
import {
  READINESS_STATE_LABELS,
  type AgentSetupReadiness
} from "@/lib/setupReadinessTypes";
import type { AgentDetail } from "./types";

/** Best guess at the setup path from the provider recorded on the agent. */
function targetForAgent(agent: AgentDetail): SetupTarget {
  switch (agent.provider) {
    case "claude":
      return "claude_code";
    case "openai":
      return "codex";
    default:
      return setupTargetForSurface("other");
  }
}

/**
 * Connect instructions and live readiness for an existing agent.
 *
 * This is the same content the first-run flow shows, reachable from the agent
 * forever after — so re-installing the CLI, moving to a new laptop, or coming
 * back days later does not mean starting a wizard again. Readiness is re-read
 * from the server on every open rather than restored from a saved step number.
 */
export function AgentSetupPanel({ agent }: { agent: AgentDetail }) {
  const { apiJson } = useDashboardApi();
  const [target, setTarget] = useState<SetupTarget>(() => targetForAgent(agent));
  const [readiness, setReadiness] = useState<AgentSetupReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiJson<{ readiness: AgentSetupReadiness }>(
        `/api/dashboard/agents/${encodeURIComponent(agent.agentId)}/setup-status`
      );
      setReadiness(result.readiness);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read setup status.");
    } finally {
      setLoading(false);
    }
  }, [agent.agentId, apiJson]);

  useEffect(() => {
    // Readiness is fetched, never restored from local state — a returning user
    // must see what the server currently knows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const path = getSetupPath(target);
  const steps = renderSetupSteps(path, {
    agentId: agent.agentId,
    baseUrl: typeof window === "undefined" ? null : window.location.origin
  });

  const rows: Array<{ label: string; ok: boolean; detail?: string }> = readiness
    ? [
        { label: "Agent enabled", ok: readiness.agentReady.ok, detail: readiness.agentReady.detail },
        { label: "Credential in use", ok: readiness.credential.ok, detail: readiness.credential.detail },
        { label: "Policy", ok: readiness.policy.ok, detail: readiness.policy.detail },
        { label: "Decisions seen", ok: readiness.enforcement.ok, detail: readiness.enforcement.detail },
        { label: "Approval flow", ok: readiness.approvalFlow.ok, detail: readiness.approvalFlow.detail }
      ]
    : [];

  return (
    <section className="dashboard-panel" id="setup-status" aria-labelledby="setup-status-title">
      <div className="dashboard-section-header">
        <div>
          <h2 id="setup-status-title">Connection</h2>
          <p className="field-help">
            Whether BehalfID is actually receiving decisions for this agent, and how to connect it
            on another machine.
          </p>
        </div>
        <button className="protect-customize" disabled={loading} onClick={() => void load()} type="button">
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {readiness ? (
        <>
          <div className="connect-summary__state" data-state={readiness.state}>
            {READINESS_STATE_LABELS[readiness.state]}
          </div>
          <div className="connect-detect">
            {rows.map((row) => (
              <div className="connect-signal" data-ok={row.ok} key={row.label}>
                <span className="connect-signal__mark" aria-hidden="true">
                  {row.ok ? "✓" : "○"}
                </span>
                <span className="connect-signal__body">
                  <strong>{row.label}</strong>
                  {row.detail ? <span>{row.detail}</span> : null}
                </span>
              </div>
            ))}
            {readiness.observedActions.length ? (
              <p className="connect-detect__hint">
                Actions seen: {readiness.observedActions.slice(0, 6).join(", ")}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="dashboard-section-header">
        <div>
          <h3>Connect this agent somewhere else</h3>
          <p className="field-help">Pick what you are connecting; the commands below are for this agent.</p>
        </div>
      </div>

      <label className="connect-target">
        <span>What are you connecting?</span>
        <select onChange={(event) => setTarget(event.target.value as SetupTarget)} value={target}>
          {SETUP_TARGETS.map((option) => (
            <option key={option} value={option}>
              {SETUP_TARGET_LABELS[option]}
            </option>
          ))}
        </select>
        <small className="field-help">{SETUP_TARGET_DESCRIPTIONS[target]}</small>
      </label>

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

      <p className="connect-summary__foot">
        The agent key is shown once, when the agent is created. To connect a new machine without it,
        rotate the key below — the old one stops working immediately.
      </p>
    </section>
  );
}
