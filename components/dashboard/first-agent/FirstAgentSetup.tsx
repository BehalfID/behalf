"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  recommendPolicyForSurface,
  sanitizeVerifyMetadata,
  type AgentEnvironment,
  type AgentSurface
} from "@/lib/firstAgentSetup";
import type { AgentTool } from "@/lib/onboarding";
import {
  presetPolicy,
  validateProtectionPolicy,
  type ProtectionPolicy
} from "@/lib/protectionPolicy";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import {
  TARGET_LOCATIONS,
  setupTargetForSurface,
  type SetupLocation
} from "@/lib/integrationSetup";
import { protectionPolicyCounts } from "@/lib/protectionPolicyPermissions";
import type { AgentSetupReadiness } from "@/lib/setupReadinessTypes";
import { AgentIdentityStep } from "./AgentIdentityStep";
import { AgentSurfaceStep } from "./AgentSurfaceStep";
import { AgentTokenStep } from "./AgentTokenStep";
import { ConnectStep } from "./ConnectStep";
import { ProtectionStep } from "./ProtectionStep";
import { SetupSummaryStep } from "./SetupSummaryStep";
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
    controlId: string;
    controlLabel: string;
    action: string;
    resource: string;
    vendor: string;
    amount?: number;
    environment: string;
    metadata: Record<string, unknown>;
    expectsApproval: boolean;
    expectsDenied: boolean;
    expectsAllowed: boolean;
  };
};

function expectedOutcome(testConfig: SetupApiResponse["testDecision"] | null) {
  if (!testConfig) return undefined;
  if (testConfig.expectsApproval) return "approve" as const;
  if (testConfig.expectsDenied) return "block" as const;
  return "allow" as const;
}

export function FirstAgentSetup({
  emailVerified,
  suggestedSurfaces = [],
  workspacePolicy = null,
  focus = null
}: {
  emailVerified: boolean;
  suggestedSurfaces?: AgentTool[];
  /** The policy chosen during account setup, when the workspace has one. */
  workspacePolicy?: ProtectionPolicy | null;
  focus?: string | null;
}) {
  const { apiJson } = useDashboardApi();
  const initialSurface = useMemo(() => {
    const first = suggestedSurfaces.find((tool) => tool !== "other");
    return (first ?? "") as AgentSurface | "";
  }, [suggestedSurfaces]);

  const inheritedPolicy = useMemo(() => {
    if (!workspacePolicy) return null;
    const parsed = validateProtectionPolicy(workspacePolicy);
    return parsed.policy ?? null;
  }, [workspacePolicy]);

  const [step, setStep] = useState(1);
  const [surface, setSurface] = useState<AgentSurface | "">(initialSurface);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState<AgentEnvironment>("production");
  const [policy, setPolicy] = useState<ProtectionPolicy>(
    () => inheritedPolicy ?? presetPolicy("recommended")
  );
  const [policyTouched, setPolicyTouched] = useState(false);
  const [agent, setAgent] = useState<CreatedAgent | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [testConfig, setTestConfig] = useState<SetupApiResponse["testDecision"] | null>(null);
  const [testResult, setTestResult] = useState<TestDecisionResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [runningTest, setRunningTest] = useState(false);
  const [error, setError] = useState("");
  const [readiness, setReadiness] = useState<AgentSetupReadiness | null>(null);
  const [location, setLocation] = useState<SetupLocation>("workstation");

  const target = setupTargetForSurface(surface || "other");

  /* These effects hydrate recommendations from route/account context without
     changing the creation payload or server-side validation. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // A workspace policy always wins over the per-surface suggestion, and an
    // edit the customer has already made always wins over both.
    if (!surface || policyTouched || inheritedPolicy) return;
    setPolicy(recommendPolicyForSurface(surface));
  }, [surface, policyTouched, inheritedPolicy]);

  useEffect(() => {
    if (focus === "production_deploys" && !policyTouched) {
      setPolicy((current) => ({
        ...current,
        preset: "custom",
        controls: { ...current.controls, deploy_production: "approve" }
      }));
    }
  }, [focus, policyTouched]);

  useEffect(() => {
    if (initialSurface && !surface) setSurface(initialSurface);
  }, [initialSurface, surface]);

  useEffect(() => {
    const allowed = TARGET_LOCATIONS[target];
    if (!allowed.includes(location)) setLocation(allowed[0]);
  }, [target, location]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const updatePolicy = useCallback((next: ProtectionPolicy) => {
    setPolicyTouched(true);
    setPolicy(next);
  }, []);

  const createAgent = async () => {
    if (apiKey) {
      setStep(5);
      return;
    }
    if (!surface) {
      setError("Select an agent surface.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const result = await apiJson<SetupApiResponse>("/api/dashboard/agents/first-setup", {
        method: "POST",
        body: JSON.stringify({
          surface,
          name: name.trim(),
          description: description.trim() || undefined,
          environment,
          protectionPolicy: policy
        })
      });
      setAgent(result.agent);
      setApiKey(result.apiKey);
      setTestConfig(result.testDecision);
      setReadiness(null);
      setStep(5);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent creation failed.");
    } finally {
      setCreating(false);
    }
  };

  const runTestDecision = async () => {
    if (step === 7) return;
    if (testResult) {
      setStep(7);
      return;
    }
    if (!agent || !apiKey || !testConfig) {
      setError("Create the agent before running a test decision.");
      return;
    }
    setRunningTest(true);
    setError("");
    try {
      const result = await apiJson<TestDecisionResult & { approvalId?: string | null }>("/api/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          agentId: agent.agentId,
          action: testConfig.action,
          ...(testConfig.vendor ? { vendor: testConfig.vendor } : {}),
          ...(typeof testConfig.amount === "number" ? { amount: testConfig.amount } : {}),
          metadata: sanitizeVerifyMetadata(testConfig.metadata)
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
      // The test wrote a real decision, so re-read readiness rather than
      // assuming what it now says.
      if (agent) {
        try {
          const status = await apiJson<{ readiness: AgentSetupReadiness }>(
            `/api/dashboard/agents/${encodeURIComponent(agent.agentId)}/setup-status`
          );
          setReadiness(status.readiness);
        } catch {
          // The summary falls back to what it already knows.
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Test decision failed.");
    } finally {
      setRunningTest(false);
    }
  };

  const goBack = () => {
    setError("");
    setStep((current) => Math.max(1, current - 1));
  };

  return (
    <FirstAgentSetupShell step={step} onBack={step > 1 && step < 7 ? goBack : undefined} backDisabled={creating || runningTest}>
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
        <ProtectionStep
          error={error}
          inheritedFromWorkspace={Boolean(inheritedPolicy) && !policyTouched}
          onChange={updatePolicy}
          onContinue={() => {
            setError("");
            setStep(4);
          }}
          policy={policy}
          surface={surface as AgentSurface}
        />
      ) : null}

      {step === 4 ? (
        <AgentTokenStep
          apiKey={apiKey}
          agentName={name}
          creating={creating}
          environment={environment}
          onCreate={() => void createAgent()}
          emailVerified={emailVerified}
          error={error}
          protectionPolicy={policy}
          surface={surface as AgentSurface}
        />
      ) : null}

      {step === 5 && surface ? (
        <ConnectStep
          agentId={agent?.agentId ?? null}
          approvalCount={protectionPolicyCounts(policy).approve}
          baseUrl={typeof window === "undefined" ? null : window.location.origin}
          error={error}
          location={location}
          onContinue={() => {
            setError("");
            setStep(6);
          }}
          onLocationChange={setLocation}
          onReadinessChange={setReadiness}
          readiness={readiness}
          target={target}
        />
      ) : null}

      {step === 6 && testConfig ? (
        <TestDecisionStep
          action={testConfig.action}
          controlLabel={testConfig.controlLabel}
          environment={testConfig.environment}
          expected={expectedOutcome(testConfig)}
          resource={testConfig.resource || "—"}
          running={runningTest}
          result={testResult}
          onRun={() => void runTestDecision()}
          error={error}
        />
      ) : null}

      {step === 7 ? (
        <SetupSummaryStep
          agentId={agent?.agentId}
          location={location}
          policy={policy}
          readiness={readiness}
          target={target}
        />
      ) : null}
    </FirstAgentSetupShell>
  );
}
