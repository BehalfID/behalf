"use client";

import {
  CONTROL_PROFILE_DESCRIPTIONS,
  CONTROL_PROFILE_LABELS,
  CONTROL_PROFILES,
  recommendControlProfile,
  type AgentSurface,
  type ControlProfile
} from "@/lib/firstAgentSetup";
import { SetupChoiceButton, SetupChoiceGrid, SetupContinueRow, SetupStepIntro } from "./setupPrimitives";

export function ControlProfileStep({
  surface,
  value,
  onChange,
  onContinue,
  error
}: {
  surface: AgentSurface;
  value: ControlProfile;
  onChange: (profile: ControlProfile) => void;
  onContinue: () => void;
  error?: string;
}) {
  const recommended = recommendControlProfile(surface);

  return (
    <>
      <SetupStepIntro
        title="Choose a control profile"
        helper={`Recommended for ${surface.replace(/_/g, " ")}: ${CONTROL_PROFILE_LABELS[recommended]}. Profiles shape baseline permissions and how strictly gates require approval.`}
      >
        <SetupChoiceGrid columns={2}>
          {CONTROL_PROFILES.map((profile) => (
            <SetupChoiceButton
              key={profile}
              active={value === profile}
              onClick={() => onChange(profile)}
              title={CONTROL_PROFILE_LABELS[profile]}
              body={CONTROL_PROFILE_DESCRIPTIONS[profile]}
              hint={profile === recommended ? "Recommended" : undefined}
            />
          ))}
        </SetupChoiceGrid>
      </SetupStepIntro>
      <SetupContinueRow onContinue={onContinue} error={error} />
    </>
  );
}
