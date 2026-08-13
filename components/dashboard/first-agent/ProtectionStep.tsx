"use client";

import {
  ProtectionPolicyEditor
} from "@/components/protection/ProtectionPolicyEditor";
import { ProtectionSummary } from "@/components/protection/ProtectionSummary";
import { AGENT_SURFACE_LABELS, type AgentSurface } from "@/lib/firstAgentSetup";
import {
  priorityCategoriesForSurfaces,
  type ProtectionPolicy
} from "@/lib/protectionPolicy";
import { protectionPolicyCounts } from "@/lib/protectionPolicyPermissions";
import { SetupContinueRow, SetupStepIntro } from "./setupPrimitives";

export function ProtectionStep({
  surface,
  policy,
  onChange,
  onContinue,
  inheritedFromWorkspace,
  error
}: {
  surface: AgentSurface;
  policy: ProtectionPolicy;
  onChange: (next: ProtectionPolicy) => void;
  onContinue: () => void;
  inheritedFromWorkspace: boolean;
  error?: string;
}) {
  const counts = protectionPolicyCounts(policy);
  const spendingInvalid = policy.spending.enabled && policy.spending.blockOver < policy.spending.approveOver;

  return (
    <>
      <SetupStepIntro
        title="Decide what this agent can do"
        helper={
          inheritedFromWorkspace
            ? `Starting from the policy you chose during setup. Adjust anything that should be different for ${AGENT_SURFACE_LABELS[surface]}.`
            : "Three answers for every action: it happens on its own, it waits for you, or it is refused."
        }
      >
        <ProtectionPolicyEditor
          onChange={onChange}
          policy={policy}
          priorityCategories={priorityCategoriesForSurfaces([surface])}
        />
        <ProtectionSummary
          footnote="These become permissions on the agent the moment you create it. You can edit or revoke each one from the agent's page."
          policy={policy}
          title="What this agent will be allowed to do"
        />
        <p className="protect-note">
          {counts.allow} run on their own · {counts.approve} wait for you · {counts.block} refused.
        </p>
      </SetupStepIntro>
      <SetupContinueRow disabled={spendingInvalid} error={error} onContinue={onContinue} />
    </>
  );
}
