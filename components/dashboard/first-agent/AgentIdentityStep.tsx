"use client";

import {
  AGENT_ENVIRONMENTS,
  type AgentEnvironment
} from "@/lib/firstAgentSetup";
import { SetupContinueRow, SetupStepIntro } from "./setupPrimitives";

export function AgentIdentityStep({
  name,
  description,
  environment,
  onNameChange,
  onDescriptionChange,
  onEnvironmentChange,
  onContinue,
  error
}: {
  name: string;
  description: string;
  environment: AgentEnvironment;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onEnvironmentChange: (value: AgentEnvironment) => void;
  onContinue: () => void;
  error?: string;
}) {
  return (
    <>
      <SetupStepIntro
        title="Name this agent"
        helper="Use a name your team will recognize in logs, approvals, and audit exports."
      >
        <form
          className="setup-form setup-form--follow"
          onSubmit={(event) => {
            event.preventDefault();
            onContinue();
          }}
        >
          <label>
            <span>
              Agent name <small>Required</small>
            </span>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Production deploy agent"
              autoComplete="off"
              maxLength={120}
            />
          </label>
          <label>
            <span>
              Description <small>Optional</small>
            </span>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="Controls production deploys from Cursor and GitHub Actions."
              rows={3}
              maxLength={800}
            />
          </label>
          <label>
            <span>
              Default environment <small>Used for test decisions and log context</small>
            </span>
            <select value={environment} onChange={(event) => onEnvironmentChange(event.target.value as AgentEnvironment)}>
              {AGENT_ENVIRONMENTS.map((env) => (
                <option key={env} value={env}>
                  {env.charAt(0).toUpperCase() + env.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </form>
      </SetupStepIntro>
      <SetupContinueRow onContinue={onContinue} disabled={!name.trim()} error={error} />
    </>
  );
}
