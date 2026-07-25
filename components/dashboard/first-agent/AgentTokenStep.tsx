"use client";

import { useState } from "react";
import { CodeBlock } from "@/components/ui";
import {
  AGENT_SURFACE_LABELS,
  APPROVAL_GATE_LABELS,
  CONTROL_PROFILE_LABELS,
  type AgentEnvironment,
  type AgentSurface,
  type ApprovalGate,
  type ControlProfile
} from "@/lib/firstAgentSetup";
import { SetupContinueRow, SetupStepIntro } from "./setupPrimitives";

export function AgentTokenStep({
  apiKey,
  agentName,
  surface,
  environment,
  controlProfile,
  approvalGates,
  creating,
  onCreate,
  emailVerified,
  error
}: {
  apiKey: string;
  agentName: string;
  surface: AgentSurface;
  environment: AgentEnvironment;
  controlProfile: ControlProfile;
  approvalGates: ApprovalGate[];
  creating: boolean;
  onCreate: () => void;
  emailVerified: boolean;
  error?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyKey = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (!apiKey) {
    return (
      <>
        <SetupStepIntro
          title="Review and create the agent"
          helper={
            emailVerified
              ? "BehalfID will create the agent, apply your profile and gates, and return a one-time API key." // pragma: allowlist secret
              : "Agent creation stays locked until your email is verified. Complete verification to issue a token." // pragma: allowlist secret
          }
        >
          <div className="setup-review">
            <dl className="setup-review__list">
              <div className="setup-review__row">
                <dt>Agent</dt>
                <dd>{agentName || "—"}</dd>
              </div>
              <div className="setup-review__row">
                <dt>Surface</dt>
                <dd>{AGENT_SURFACE_LABELS[surface]}</dd>
              </div>
              <div className="setup-review__row">
                <dt>Environment</dt>
                <dd>{environment.charAt(0).toUpperCase() + environment.slice(1)}</dd>
              </div>
              <div className="setup-review__row">
                <dt>Control profile</dt>
                <dd>{CONTROL_PROFILE_LABELS[controlProfile]}</dd>
              </div>
              <div className="setup-review__row">
                <dt>Approval gates</dt>
                <dd>{approvalGates.map((gate) => APPROVAL_GATE_LABELS[gate]).join(", ") || "—"}</dd>
              </div>
              <div className="setup-review__row">
                <dt>Token policy</dt>
                <dd>Shown once · store it before leaving this flow</dd>
              </div>
            </dl>
          </div>
        </SetupStepIntro>
        <SetupContinueRow
          onContinue={onCreate}
          continueLabel={creating ? "Creating…" : "Create agent + token"}
          disabled={!emailVerified || creating || !agentName.trim()}
          loading={creating}
          error={error}
        />
      </>
    );
  }

  return (
    <>
      <SetupStepIntro
        title="Copy your agent API key"
        helper="This key will not be shown again. Store it in your secret manager or environment now."
      >
        <div className="first-agent-token-panel">
          <CodeBlock>{apiKey}</CodeBlock>
          <div className="first-agent-token-panel__actions">
            <button type="button" className="ui-button ui-button--primary" onClick={() => void copyKey()}>
              {copied ? "Copied" : "Copy API key"}
            </button>
          </div>
          <p className="setup-flow__helper first-agent-token-panel__warning" role="status">
            Warning: BehalfID cannot retrieve this key later. If you lose it, rotate the agent key from the agents console. {/* pragma: allowlist secret */}
          </p>
        </div>
      </SetupStepIntro>
      <SetupContinueRow onContinue={onCreate} continueLabel="Continue to integration" error={error} />
    </>
  );
}
