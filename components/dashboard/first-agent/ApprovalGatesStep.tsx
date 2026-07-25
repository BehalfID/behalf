"use client";

import {
  APPROVAL_GATE_DESCRIPTIONS,
  APPROVAL_GATE_LABELS,
  APPROVAL_GATES,
  type ApprovalGate
} from "@/lib/firstAgentSetup";
import { SetupContinueRow, SetupGateChoice, SetupStepIntro } from "./setupPrimitives";

export function ApprovalGatesStep({
  selected,
  onToggle,
  onContinue,
  error
}: {
  selected: ApprovalGate[];
  onToggle: (gate: ApprovalGate, enabled: boolean) => void;
  onContinue: () => void;
  error?: string;
}) {
  return (
    <>
      <SetupStepIntro
        title="Select approval gates"
        helper="A selected gate pauses the matching production action until an authorized person approves it. These constraints are applied when the agent is created."
      >
        <div className="setup-choices">
          {APPROVAL_GATES.map((gate) => (
            <SetupGateChoice
              key={gate}
              checked={selected.includes(gate)}
              onChange={(enabled) => onToggle(gate, enabled)}
              title={APPROVAL_GATE_LABELS[gate]}
              body={APPROVAL_GATE_DESCRIPTIONS[gate]}
            />
          ))}
        </div>
      </SetupStepIntro>
      <SetupContinueRow onContinue={onContinue} disabled={selected.length === 0} error={error} />
    </>
  );
}
