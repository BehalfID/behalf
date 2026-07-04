"use client";

import { CodeBlock } from "@/components/ui";
import { buildIntegrationInstructions, type AgentSurface } from "@/lib/firstAgentSetup";
import { SetupContinueRow, SetupStepIntro } from "./setupPrimitives";

export function IntegrationInstructions({
  surface,
  apiKey,
  onContinue,
  error
}: {
  surface: AgentSurface;
  apiKey: string;
  onContinue: () => void;
  error?: string;
}) {
  const instructions = buildIntegrationInstructions({
    surface,
    apiKeyPlaceholder: apiKey ? `${apiKey.slice(0, 12)}…` : "bhf_sk_…"
  });

  return (
    <>
      <SetupStepIntro title={instructions.title} helper={instructions.body}>
        <div className="first-agent-integration">
          <p className="cx-label">Environment variable</p>
          <CodeBlock>{instructions.envBlock}</CodeBlock>
          <p className="cx-label">Verification example</p>
          <CodeBlock>{instructions.snippet}</CodeBlock>
        </div>
      </SetupStepIntro>
      <SetupContinueRow onContinue={onContinue} continueLabel="Run test decision" error={error} />
    </>
  );
}
