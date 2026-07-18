"use client";

import {
  AGENT_SURFACE_LABELS,
  AGENT_SURFACES,
  type AgentSurface
} from "@/lib/firstAgentSetup";
import { SetupChoiceButton, SetupChoiceGrid, SetupContinueRow, SetupStepIntro } from "./setupPrimitives";

export function AgentSurfaceStep({
  value,
  onChange,
  onContinue,
  error
}: {
  value: AgentSurface | "";
  onChange: (surface: AgentSurface) => void;
  onContinue: () => void;
  error?: string;
}) {
  return (
    <>
      <SetupStepIntro
        title="Choose the agent surface"
        helper="This identifies where the agent operates. BehalfID will create a separate governed identity for this surface; you can add others later." // pragma: allowlist secret
      >
        <SetupChoiceGrid columns={2}>
          {AGENT_SURFACES.map((surface) => (
            <SetupChoiceButton
              key={surface}
              active={value === surface}
              onClick={() => onChange(surface)}
              title={AGENT_SURFACE_LABELS[surface]}
              body={
                surface === "github_actions"
                  ? "CI workflows and deploy pipelines."
                  : surface === "internal"
                    ? "Internal runners, cron jobs, or service agents."
                    : surface === "other"
                      ? "Custom or multi-tool agent stack."
                      : "Local or IDE-integrated coding agent."
              }
            />
          ))}
        </SetupChoiceGrid>
      </SetupStepIntro>
      <SetupContinueRow onContinue={onContinue} disabled={!value} error={error} />
    </>
  );
}
