"use client";

import { useState } from "react";
import { CodeBlock } from "@/components/ui";
import { SetupContinueRow, SetupStepIntro } from "./setupPrimitives";

export function AgentTokenStep({
  apiKey,
  agentName,
  creating,
  onCreate,
  emailVerified,
  error
}: {
  apiKey: string;
  agentName: string;
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
          title="Create agent and issue token"
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
                <dt>Token policy</dt>
                <dd>Shown once · never stored in browser state after you leave this flow</dd>
              </div>
            </dl>
          </div>
        </SetupStepIntro>
        <SetupContinueRow
          onContinue={onCreate}
          continueLabel={creating ? "Creating…" : "Create agent + token"}
          disabled={!emailVerified || creating || !agentName.trim()}
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
