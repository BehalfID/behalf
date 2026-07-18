"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormAlert } from "@/components/auth/AuthShell";
import { OnboardingIntro, OnboardingShell, StepActions } from "@/components/onboarding/OnboardingShell";
import { Input, PageLoadingState, Select } from "@/components/ui";
import {
  AGENT_TOOL_LABELS,
  AGENT_TOOLS,
  CONTROL_AREA_LABELS,
  CONTROL_AREAS,
  CONTROL_POLICY_HINTS,
  TEAM_SIZE_LABELS,
  TEAM_SIZES,
  defaultWorkspaceName,
  type AccountType,
  type AgentTool,
  type ControlArea,
  type FirstSetupGoal,
  type TeamSize
} from "@/lib/onboarding";

const BRAND_NAME = "BehalfID"; // pragma: allowlist secret

type Step = 1 | 2 | 3 | 4 | 5 | 6;

type SetupState = {
  accountType: AccountType | "";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  companyName: string;
  workspaceName: string;
  website: string;
  teamSize: TeamSize | "";
  agentTools: AgentTool[];
  agentToolsOther: string;
  controlAreas: ControlArea[];
  controlAreasOther: string;
  firstSetupGoal: FirstSetupGoal | "";
};

const STEP_COUNT = 6;

const ACCOUNT_SETUP_STEPS = [
  { label: "Workspace mode" },
  { label: "Operator" },
  { label: "Workspace" },
  { label: "Agent surfaces" },
  { label: "Controls" },
  { label: "Next step" }
] as const;

const ACCOUNT_TYPE_OPTIONS: Array<{
  type: AccountType;
  title: string;
  body: string;
}> = [
  {
    type: "individual",
    title: "Individual",
    body: "Single-operator workspace with direct approval authority."
  },
  {
    type: "business",
    title: "Team / company",
    body: "Shared workspace with delegated roles and organization audit."
  }
];

const TRACK_OPTIONS: Array<{
  goal: FirstSetupGoal;
  title: string;
  hint: string;
}> = [
  { goal: "create_agent", title: "Register first coding agent", hint: "Issue a scoped identity and API key." },
  { goal: "setup_deploy_approvals", title: "Set up deploy approvals", hint: "Gate production deploys behind approval." },
  { goal: "apply_permission_profile", title: "Apply permission profile", hint: "Start from a profile that limits risky actions." },
  { goal: "invite_team", title: "Invite team", hint: "Add members who share approval authority." },
  { goal: "explore_sandbox", title: "Explore sandbox", hint: "Exercise enforcement in a safe environment." }
];

const TRACK_DESTINATIONS: Record<FirstSetupGoal, string> = {
  create_agent: "Agent registration",
  setup_deploy_approvals: "Approval configuration",
  apply_permission_profile: "Profile library",
  invite_team: "Workspace members",
  explore_sandbox: "Enforcement sandbox"
};

const EMPTY_STATE: SetupState = {
  accountType: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  jobTitle: "",
  companyName: "",
  workspaceName: "",
  website: "",
  teamSize: "",
  agentTools: [],
  agentToolsOther: "",
  controlAreas: [],
  controlAreasOther: "",
  firstSetupGoal: ""
};

function SetupReview({ form }: { form: SetupState }) {
  const modeLabel = form.accountType === "individual"
    ? "Individual"
    : form.accountType === "business"
      ? "Team / company"
      : "—";
  const surfaces = form.agentTools.map((tool) => AGENT_TOOL_LABELS[tool]).join(", ") || "—";
  const boundaries = form.controlAreas.map((area) => CONTROL_AREA_LABELS[area]).join(", ") || "—";
  const destination = form.firstSetupGoal ? TRACK_DESTINATIONS[form.firstSetupGoal] : "—";

  return (
    <div className="setup-review" aria-label="Setup summary">
      <dl className="setup-review__list">
        <div className="setup-review__row">
          <dt>Mode</dt>
          <dd>{modeLabel}</dd>
        </div>
        <div className="setup-review__row">
          <dt>Surfaces</dt>
          <dd>{surfaces}</dd>
        </div>
        <div className="setup-review__row">
          <dt>Boundaries</dt>
          <dd>{boundaries}</dd>
        </div>
        <div className="setup-review__row">
          <dt>Destination</dt>
          <dd>{destination}</dd>
        </div>
      </dl>
    </div>
  );
}

export function AccountSetupClient({ emailVerified }: { emailVerified: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<SetupState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");

  const loadState = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/account-setup", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load setup.");
        return;
      }
      setForm({
        accountType: (data.account?.accountType as AccountType) ?? (data.account?.legacyAccountType as AccountType) ?? "",
        firstName: data.profile?.firstName ?? "",
        lastName: data.profile?.lastName ?? "",
        email: data.profile?.email ?? "",
        phone: data.profile?.phone ?? "",
        jobTitle: data.profile?.jobTitle ?? "",
        companyName: data.account?.companyName ?? "",
        workspaceName: data.account?.workspaceName ?? "",
        website: data.account?.website ?? "",
        teamSize: (data.account?.teamSize as TeamSize) ?? "",
        agentTools: (data.account?.onboarding?.agentTools as AgentTool[]) ?? [],
        agentToolsOther: data.account?.onboarding?.agentToolsOther ?? "",
        controlAreas: (data.account?.onboarding?.controlAreas as ControlArea[]) ?? [],
        controlAreasOther: data.account?.onboarding?.controlAreasOther ?? "",
        firstSetupGoal: (data.account?.onboarding?.firstSetupGoal as FirstSetupGoal) ?? ""
      });
    } catch {
      setError("Failed to load setup.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The loader owns the initial loading and draft hydration state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadState();
  }, [loadState]);

  const patchPayload = useMemo(() => {
    const payload: Record<string, unknown> = {};
    if (form.accountType) payload.accountType = form.accountType;
    if (form.firstName) payload.firstName = form.firstName;
    if (form.lastName) payload.lastName = form.lastName;
    if (form.phone) payload.phone = form.phone;
    if (form.jobTitle) payload.jobTitle = form.jobTitle;
    if (form.companyName) payload.companyName = form.companyName;
    if (form.workspaceName) payload.workspaceName = form.workspaceName;
    if (form.website) payload.website = form.website;
    if (form.teamSize) payload.teamSize = form.teamSize;
    if (form.agentTools.length) payload.agentTools = form.agentTools;
    if (form.agentToolsOther) payload.agentToolsOther = form.agentToolsOther;
    if (form.controlAreas.length) payload.controlAreas = form.controlAreas;
    if (form.controlAreasOther) payload.controlAreasOther = form.controlAreasOther;
    if (form.firstSetupGoal) payload.firstSetupGoal = form.firstSetupGoal;
    return payload;
  }, [form]);

  const saveProgress = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/account-setup", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save progress.");
        return false;
      }
      return true;
    } catch {
      setError("Failed to save progress.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof SetupState>(key: K, value: SetupState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "accountType") {
        const nextType = value as AccountType;
        if (nextType === "business" && prev.teamSize === "1") {
          next.teamSize = "";
        }
      }
      if (key === "accountType" || key === "firstName" || key === "lastName" || key === "companyName") {
        if (!prev.workspaceName || prev.workspaceName === defaultWorkspaceName({
          accountType: prev.accountType || undefined,
          firstName: prev.firstName,
          lastName: prev.lastName,
          companyName: prev.companyName
        })) {
          next.workspaceName = defaultWorkspaceName({
            accountType: (key === "accountType" ? (value as AccountType) : prev.accountType) || undefined,
            firstName: key === "firstName" ? (value as string) : prev.firstName,
            lastName: key === "lastName" ? (value as string) : prev.lastName,
            companyName: key === "companyName" ? (value as string) : prev.companyName
          });
        }
      }
      return next;
    });
  };

  const toggleMulti = <T extends string>(key: "agentTools" | "controlAreas", value: T) => {
    setForm((prev) => {
      const current = prev[key] as T[];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  };

  const validateStep = (current: Step): string | null => {
    if (current === 1 && !form.accountType) return "Select a workspace mode.";
    if (current === 2) {
      if (!form.firstName.trim()) return "First name is required.";
      if (!form.lastName.trim()) return "Last name is required.";
    }
    if (current === 3) {
      if (form.accountType === "business" && !form.companyName.trim()) return "Company name is required.";
      if (!form.workspaceName.trim()) return "Workspace name is required.";
    }
    if (current === 4) {
      if (!form.agentTools.length) return "Register at least one agent surface.";
      if (form.agentTools.includes("other") && !form.agentToolsOther.trim()) return "Describe the unlisted agent surface.";
    }
    if (current === 5) {
      if (!form.controlAreas.length) return "Define at least one control boundary.";
      if (form.controlAreas.includes("other") && !form.controlAreasOther.trim()) return "Describe the additional control boundary.";
    }
    if (current === 6 && !form.firstSetupGoal) return "Select an implementation track.";
    return null;
  };

  const goNext = async () => {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    const saved = await saveProgress();
    if (!saved) return;
    setStep((prev) => Math.min(STEP_COUNT, prev + 1) as Step);
    setError("");
  };

  const goBack = () => {
    setError("");
    setStep((prev) => Math.max(1, prev - 1) as Step);
  };

  const finish = async () => {
    const validationError = validateStep(6);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFinishing(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/account-setup/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to complete setup.");
        return;
      }
      router.push(data.nextRoute ?? "/dashboard");
    } catch {
      setError("Failed to complete setup.");
    } finally {
      setFinishing(false);
    }
  };

  const stepHeading = step === 1
    ? "Select workspace mode"
    : step === 2
      ? "Identify the operator"
      : step === 3
        ? "Name the workspace"
        : step === 4
          ? "Select agent surfaces"
          : step === 5
            ? "Define initial control boundaries"
            : "Choose implementation track";

  const stepHelper = step === 1
    ? "Determines membership, approval ownership, and audit scope."
    : step === 2
      ? "Recorded against approvals, policy changes, and recovery operations."
      : step === 3
        ? form.accountType === "business"
          ? "The shared workspace for agents, approvals, and audit history."
          : "Your control plane for agents, permissions, and decisions."
        : step === 4
          ? `Every surface ${BRAND_NAME} should sit in front of.`
          : step === 5
            ? "Operations to gate, block, or audit from day one."
            : "Where the console routes you when setup completes.";

  if (loading) {
    return (
      <OnboardingShell currentStep={1} label="Account setup" steps={ACCOUNT_SETUP_STEPS}>
        <PageLoadingState label="Loading your saved account setup" variant="form" />
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell currentStep={step} label="Account setup" steps={ACCOUNT_SETUP_STEPS}>
        {!emailVerified ? (
          <FormAlert tone="notice">
            <strong>Email not verified.</strong> Setup can be completed now; agent creation and API tokens remain locked until verification. <Link href="/verify-email">Verify email</Link>
          </FormAlert>
        ) : null}

        {error ? <FormAlert>{error}</FormAlert> : null}

        <OnboardingIntro eyebrow={`Account setup · Step ${step}`} title={stepHeading} description={stepHelper} />

        {step === 1 ? (
          <div className="setup-choices">
            {ACCOUNT_TYPE_OPTIONS.map(({ type, title, body }) => (
              <button
                className={`setup-choice${form.accountType === type ? " setup-choice--active" : ""}`}
                key={type}
                onClick={() => update("accountType", type)}
                type="button"
                aria-pressed={form.accountType === type}
              >
                <span className="setup-choice__mark" aria-hidden="true">
                  {form.accountType === type ? "✓" : ""}
                </span>
                <span className="setup-choice__body">
                  <strong>{title}</strong>
                  <span>{body}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="setup-form">
            <div className="setup-form__row">
              <label>
                <span>First name</span>
                <Input autoComplete="given-name" onChange={(e) => update("firstName", e.target.value)} required value={form.firstName} />
              </label>
              <label>
                <span>Last name</span>
                <Input autoComplete="family-name" onChange={(e) => update("lastName", e.target.value)} required value={form.lastName} />
              </label>
            </div>
            <label>
              <span>Email</span>
              <Input disabled readOnly value={form.email} />
            </label>
            <div className="setup-form__row">
              <label>
                <span>Job title <small>(optional)</small></span>
                <Input autoComplete="organization-title" onChange={(e) => update("jobTitle", e.target.value)} value={form.jobTitle} />
              </label>
              <label>
                <span>Phone <small>(optional)</small></span>
                <Input autoComplete="tel" inputMode="tel" onChange={(e) => update("phone", e.target.value)} value={form.phone} />
              </label>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="setup-form">
            {form.accountType === "business" ? (
              <>
                <div className="setup-form__row">
                  <label>
                    <span>Company name</span>
                    <Input onChange={(e) => update("companyName", e.target.value)} required value={form.companyName} />
                  </label>
                  <label>
                    <span>Workspace name</span>
                    <Input onChange={(e) => update("workspaceName", e.target.value)} required value={form.workspaceName} />
                  </label>
                </div>
                <div className="setup-form__row">
                  <label>
                    <span>Website <small>(optional)</small></span>
                    <Input onChange={(e) => update("website", e.target.value)} placeholder="example.com" value={form.website} />
                  </label>
                  <label>
                    <span>Team size <small>(optional)</small></span>
                    <Select onChange={(e) => update("teamSize", e.target.value as TeamSize | "")} value={form.teamSize}>
                      <option value="">Select team size</option>
                      {TEAM_SIZES.map((size) => (
                        <option key={size} value={size}>{TEAM_SIZE_LABELS[size]}</option>
                      ))}
                    </Select>
                  </label>
                </div>
              </>
            ) : (
              <label>
                <span>Workspace name</span>
                <Input onChange={(e) => update("workspaceName", e.target.value)} required value={form.workspaceName} />
              </label>
            )}
          </div>
        ) : null}

        {step === 4 ? (
          <>
            <div className="setup-choices setup-choices--grid">
              {AGENT_TOOLS.map((tool) => {
                const active = form.agentTools.includes(tool);
                return (
                  <label className={`setup-choice setup-choice--check${active ? " setup-choice--active" : ""}`} key={tool}>
                    <span className="setup-choice__mark" aria-hidden="true">{active ? "✓" : ""}</span>
                    <input
                      checked={active}
                      onChange={() => toggleMulti("agentTools", tool)}
                      type="checkbox"
                    />
                    <span className="setup-choice__body">
                      <strong>{AGENT_TOOL_LABELS[tool]}</strong>
                    </span>
                  </label>
                );
              })}
            </div>
            {form.agentTools.includes("other") ? (
              <div className="setup-form setup-form--follow">
                <label>
                  <span>Unlisted surface</span>
                  <Input onChange={(e) => update("agentToolsOther", e.target.value)} placeholder="Describe the agent or toolchain" value={form.agentToolsOther} />
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 5 ? (
          <>
            <div className="setup-choices">
              {CONTROL_AREAS.map((area) => {
                const active = form.controlAreas.includes(area);
                return (
                  <label className={`setup-choice setup-choice--check${active ? " setup-choice--active" : ""}`} key={area}>
                    <span className="setup-choice__mark" aria-hidden="true">{active ? "✓" : ""}</span>
                    <input
                      checked={active}
                      onChange={() => toggleMulti("controlAreas", area)}
                      type="checkbox"
                    />
                    <span className="setup-choice__body">
                      <strong>{CONTROL_AREA_LABELS[area]}</strong>
                    </span>
                    <span className="setup-choice__hint">{CONTROL_POLICY_HINTS[area]}</span>
                  </label>
                );
              })}
            </div>
            {form.controlAreas.includes("other") ? (
              <div className="setup-form setup-form--follow">
                <label>
                  <span>Additional boundary</span>
                  <Input onChange={(e) => update("controlAreasOther", e.target.value)} placeholder="Describe what needs governing" value={form.controlAreasOther} />
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 6 ? (
          <>
            <div className="setup-choices">
              {TRACK_OPTIONS.map(({ goal, title, hint }) => (
                <button
                  className={`setup-choice${form.firstSetupGoal === goal ? " setup-choice--active" : ""}`}
                  key={goal}
                  onClick={() => update("firstSetupGoal", goal)}
                  type="button"
                  aria-pressed={form.firstSetupGoal === goal}
                >
                  <span className="setup-choice__mark setup-choice__mark--radio" aria-hidden="true">
                    {form.firstSetupGoal === goal ? "✓" : ""}
                  </span>
                  <span className="setup-choice__body">
                    <strong>{title}</strong>
                    <span>{hint}</span>
                  </span>
                </button>
              ))}
            </div>
            {form.firstSetupGoal ? <SetupReview form={form} /> : null}
          </>
        ) : null}

        <StepActions
          backDisabled={saving || finishing}
          continueDisabled={saving || finishing}
          continueLabel={step < STEP_COUNT
            ? saving ? "Saving…" : "Continue"
            : finishing ? "Provisioning…" : "Complete setup"}
          loading={saving || finishing}
          onBack={step > 1 ? goBack : undefined}
          onContinue={step < STEP_COUNT ? () => void goNext() : () => void finish()}
        />
    </OnboardingShell>
  );
}
