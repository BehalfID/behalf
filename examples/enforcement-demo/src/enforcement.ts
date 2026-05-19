import type { VerifyInput, VerifyResult } from "@behalfid/sdk";

export type ActionInput = Omit<VerifyInput, "agentId">;

export type BehalfVerifier = {
  verify(input: VerifyInput): Promise<VerifyResult>;
};

export class ActionBlockedError extends Error {
  readonly decision: VerifyResult;

  constructor(decision: VerifyResult) {
    super(`Action blocked by BehalfID: ${decision.reason}`);
    this.name = "ActionBlockedError";
    this.decision = decision;
  }
}

export async function enforceAction<T>(
  behalf: BehalfVerifier,
  agentId: string,
  input: ActionInput,
  executeAction: (decision: VerifyResult) => Promise<T>
) {
  const decision = await behalf.verify({ agentId, ...input });

  if (!decision.allowed) {
    throw new ActionBlockedError(decision);
  }

  return executeAction(decision);
}

export function formatDecision(decision: VerifyResult) {
  return `${decision.allowed ? "allowed" : "denied"} (${decision.risk}) - ${decision.reason}`;
}
