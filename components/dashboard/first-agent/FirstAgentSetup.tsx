"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultApprovalGatesForSurface,
  mergeSuggestedGates,
  recommendControlProfile,
  type AgentEnvironment,
  type AgentSurface,
  type ApprovalGate,
  type ControlProfile
} from "@/lib/firstAgentSetup";
import type { AgentTool } from "@/lib/onboarding";
import { AgentIdentityStep } from "./AgentIdentityStep";
import { AgentSurfaceStep } from "./AgentSurfaceStep";
import { AgentTokenStep } from "./AgentTokenStep";
import { ApprovalGatesStep } from "./ApprovalGatesStep";
import { ControlProfileStep } from "./ControlProfileStep";
import { IntegrationInstructions } from "./IntegrationInstructions";
import { LogsHandoffStep } from "./SetupReceiptCard";
import { FirstAgentSetupShell, VerificationLockBanner } from "./setupPrimitives";
import { TestDecisionStep, type TestDecisionResult } from "./TestDecisionStep";

type CreatedAgent = {
  agentId: string;
  name: string;
};

type SetupApiResponse = {
  agent: CreatedAgent;
  apiKey: string;
  testDecision: {
    action: string;
    resource: string;
    vendor: string;
    environment: string;
    metadata: Record<string, unknown>;
    expectsApproval: boolean;
    expectsDenied: boolean;
  };
};

async function setupApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function FirstAgentSetup({
  emailVerified,
  suggestedSurfaces = [],
  focus = null
}: {
  emailVerified: boolean;
  suggestedSurfaces?: AgentTool[];
  focus?: string | null;
}) {
  const initialSurface = useMemo(() => {
    const first = suggestedSurfaces.find((tool) => tool !== "other");
    return (first ?? "") as AgentSurface | "";
  }, [suggestedSurfaces]);

  const [step, setStep] = useState(1);
  const [surface, setSurface] = useState<AgentSurface | "">(initialSurface);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState<AgentEnvironment>("production");
  const [controlProfile, setControlProfile] = useState<ControlProfile>("balanced");
  const [approvalGates, setApprovalGates] = useState<ApprovalGate[]>([]);
  const [agent, setAgent] = useState<CreatedAgent | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [testConfig, setTestConfig] = useState<SetupApiResponse["testDecision"] | null>(null);
  const [testResult, setTestResult] = useState<TestDecisionResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [runningTest, setRunningTest] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!surface) return;
    setControlProfile(recommendControlProfile(surface));
    setApprovalGates(defaultApprovalGatesForSurface(surface));
  }, [surface]);

  useEffect(() => {
    if (focus === "production_deploys") {
      setControlProfile("production_strict");
      setApprovalGates((current) => mergeSuggestedGates(current, ["production_deploys"]));
    }
    if (focus === "profiles") {
      setControlProfile("balanced");
    }
  }, [focus]);

  useEffect(() => {
    if (initialSurface && !surface) setSurface(initialSurface);
  }, [initialSurface, surface]);

  const toggleGate = useCallback((gate: ApprovalGate, enabled: boolean) => {
    setApprovalGates((current) => {
      if (enabled) return mergeSuggestedGates(current, [gate]);
      return current.filter((item) => item !== gate);
    });
  }, []);

  const createAgent = async () => {
    if (apiKey) {
      setStep(6);
      return;
    }
    if (!surface) {
      setError("Select an agent surface.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const result = await setupApi<SetupApiResponse>("/api/dashboard/agents/first-setup", {
        method: "POST",
        body: JSON.stringify({
          surface,
          name: name.trim(),
          description: description.trim() || undefined,
          environment,
          controlProfile,
          approvalGates
        })
      });
      setAgent(result.agent);
      setApiKey(result.apiKey);
      setTestConfig(result.testDecision);
      setStep(6);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent creation failed.");
    } finally {
      setCreating(false);
    }
  };

  const runTestDecision = async () => {
    if (step === 8) return;
    if (testResult) {
      setStep(8);
      return;
    }
    if (!agent || !apiKey || !testConfig) {
      setError("Create the agent before running a test decision.");
      return;
    }
    setRunningTest(true);
    setError("");
    try {
      const result = await setupApi<TestDecisionResult & { approvalId?: string | null }>("/api/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          agentId: agent.agentId,
          action: testConfig.action,
          resource: testConfig.resource,
          vendor: testConfig.vendor,
          metadata: testConfig.metadata
        })
      });
      setTestResult({
        allowed: result.allowed,
        approvalRequired: result.approvalRequired,
        reason: result.reason,
        requestId: result.requestId,
        approvalId: result.approvalId ?? null,
        action: testConfig.action,
        vendor: testConfig.vendor,
        environment: testConfig.environment
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Test decision failed.");
    } finally {
      setRunningTest(false);
    }
  };

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  const goBack = () => {
    setError("");
    setStep((current) => Math.max(1, current - 1));
  };

  return (
    <FirstAgentSetupShell step={step} onBack={step > 1 && step < 8 ? goBack : undefined} backDisabled={creating || runningTest}>
      <VerificationLockBanner emailVerified={emailVerified} />

      {step === 1 ? (
        <AgentSurfaceStep
          value={surface}
          onChange={(next) => {
            setSurface(next);
            setError("");
          }}
          onContinue={() => {
            if (!surface) {
              setError("Select an agent surface.");
              return;
            }
            setError("");
            setStep(2);
          }}
          error={error}
        />
      ) : null}

      {step === 2 ? (
        <AgentIdentityStep
          name={name}
          description={description}
          environment={environment}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onEnvironmentChange={setEnvironment}
          onContinue={() => {
            if (!name.trim()) {
              setError("Agent name is required.");
              return;
            }
            setError("");
            setStep(3);
          }}
          error={error}
        />
      ) : null}

      {step === 3 ? (
        <ControlProfileStep
          surface={surface as AgentSurface}
          value={controlProfile}
          onChange={setControlProfile}
          onContinue={() => {
            setError("");
            setStep(4);
          }}
          error={error}
        />
      ) : null}

      {step === 4 ? (
        <ApprovalGatesStep
          selected={approvalGates}
          onToggle={toggleGate}
          onContinue={() => {
            if (!approvalGates.length) {
              setError("Select at least one approval gate.");
              return;
            }
            setError("");
            setStep(5);
          }}
          error={error}
        />
      ) : null}

      {step === 5 ? (
        <AgentTokenStep
          apiKey={apiKey}
          agentName={name}
          creating={creating}
          onCreate={() => void createAgent()}
          emailVerified={emailVerified}
          error={error}
        />
      ) : null}

      {step === 6 && surface ? (
        <IntegrationInstructions
          surface={surface}
          apiKey={apiKey}
          onContinue={() => {
            setError("");
            setStep(7);
          }}
          error={error}
        />
      ) : null}

      {step === 7 && testConfig ? (
        <TestDecisionStep
          action={testConfig.action}
          resource={testConfig.resource}
          running={runningTest}
          result={testResult}
          onRun={() => void runTestDecision()}
          error={error}
        />
      ) : null}

      {step === 8 ? (
        <LogsHandoffStep requestId={testResult?.requestId} agentId={agent?.agentId} onCopy={(value) => void copyValue(value)} />
      ) : null}
    </FirstAgentSetupShell>
  );
}
