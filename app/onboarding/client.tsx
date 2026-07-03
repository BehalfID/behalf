"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IndividualSetupIcon, TeamSetupIcon } from "@/components/onboarding/SetupIcons";
import { Button, Logo } from "@/components/ui";
import {
  ACCOUNT_TYPES,
  AGENT_TOOL_LABELS,
  AGENT_TOOLS,
  CONTROL_AREA_LABELS,
  CONTROL_AREAS,
  FIRST_SETUP_GOAL_LABELS,
  FIRST_SETUP_GOALS,
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

const STEP_LABELS = [
  "Setup",
  "You",
  "Workspace",
  "Agents",
  "Controls",
  "First move"
] as const;

const STEP_KICKERS = [
  "Step 1 of 6",
  "Step 2 of 6",
  "Step 3 of 6",
  "Step 4 of 6",
  "Step 5 of 6",
  "Step 6 of 6"
] as const;

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

const ACCOUNT_TYPE_OPTIONS: Array<{
  type: AccountType;
  title: string;
  body: string;
  Icon: typeof IndividualSetupIcon;
}> = [
  {
    type: "individual",
    title: "Just me",
    body: "A personal control plane for your own coding agents and approvals.",
    Icon: IndividualSetupIcon
  },
  {
    type: "business",
    title: "My team / company",
    body: "A shared workspace with delegated approvals, members, and audit trails.",
    Icon: TeamSetupIcon
  }
];

const FIRST_MOVE_OPTIONS: Array<{
  goal: FirstSetupGoal;
  hint: string;
}> = [
  { goal: "create_agent", hint: "Register your first agent and store its API key." },
  { goal: "setup_deploy_approvals", hint: "Gate production deploys behind human approval." },
  { goal: "apply_permission_profile", hint: "Start from a profile that limits risky repo actions." },
  { goal: "invite_team", hint: "Bring in leads and engineers who can approve on your behalf." },
  { goal: "explore_sandbox", hint: "Try enforcement in a safe environment before going live." }
];

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
    if (current === 1 && !form.accountType) return "Choose who this setup is for.";
    if (current === 2) {
      if (!form.firstName.trim()) return "First name is required.";
      if (!form.lastName.trim()) return "Last name is required.";
    }
    if (current === 3) {
      if (form.accountType === "business" && !form.companyName.trim()) return "Company name is required.";
      if (!form.workspaceName.trim()) return "Workspace name is required.";
    }
    if (current === 4) {
      if (!form.agentTools.length) return "Select at least one agent entering your workflow.";
      if (form.agentTools.includes("other") && !form.agentToolsOther.trim()) return "Tell us about the other agent.";
    }
    if (current === 5) {
      if (!form.controlAreas.length) return `Select at least one area for ${BRAND_NAME} to control.`;
      if (form.controlAreas.includes("other") && !form.controlAreasOther.trim()) return "Describe the other control area.";
    }
    if (current === 6 && !form.firstSetupGoal) return "Choose your first move.";
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
    setStep((prev) => Math.min(6, prev + 1) as Step);
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

  if (loading) {
    return (
      <main className="ob-page setup-page">
        <div className="setup-shell">
          <p className="ob-kicker">Account setup</p>
          <p className="setup-loading">Loading your setup…</p>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="ob-page setup-page" tabIndex={-1}>
      <div className="setup-shell">
        <header className="setup-header">
          <Logo />
          <p className="ob-kicker">{BRAND_NAME} setup</p>
          <div className="setup-progress" aria-label={`Step ${step} of 6`}>
            {STEP_LABELS.map((label, index) => {
              const stepNum = (index + 1) as Step;
              const active = stepNum === step;
              const done = stepNum < step;
              return (
                <div
                  className={`setup-progress__item${active ? " setup-progress__item--active" : ""}${done ? " setup-progress__item--done" : ""}`}
                  key={label}
                >
                  <span className="setup-progress__dot">{done ? "✓" : stepNum}</span>
                  <span className="setup-progress__label">{label}</span>
                </div>
              );
            })}
          </div>
          <div className="setup-progress-bar" aria-hidden="true">
            <span className="setup-progress-bar__fill" style={{ width: `${(step / 6) * 100}%` }} />
          </div>
        </header>

        {!emailVerified ? (
          <div className="setup-banner" role="status">
            <strong>Verify your email when you can.</strong> You can finish setup now, but agent creation and API tokens stay locked until your email is verified.{" "}
            <Link href="/verify-email">Verify email</Link>
          </div>
        ) : null}

        {error ? <p className="form-error setup-error" role="alert">{error}</p> : null}

        {step === 1 ? (
          <section className="setup-step setup-step--enter">
            <p className="ob-kicker">{STEP_KICKERS[0]}</p>
            <h1 className="ob-heading">Who are we setting this up for?</h1>
            <p className="ob-sub">Choose the workspace that fits how you will govern coding agents.</p>
            <div className="ob-choices ob-choices--icons">
              {ACCOUNT_TYPE_OPTIONS.map(({ type, title, body, Icon }) => (
                <button
                  className={`ob-choice ob-choice--icon${form.accountType === type ? " ob-choice--active" : ""}`}
                  key={type}
                  onClick={() => update("accountType", type)}
                  type="button"
                >
                  <span className="ob-choice__icon-wrap">
                    <Icon className="ob-choice__icon" />
                  </span>
                  <span className="ob-choice__copy">
                    <strong>{title}</strong>
                    <span>{body}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="setup-step setup-step--enter">
            <p className="ob-kicker">{STEP_KICKERS[1]}</p>
            <h1 className="ob-heading">Who are you?</h1>
            <p className="ob-sub">We will use this to personalize your control plane and recovery options.</p>
            <div className="setup-form">
              <div className="setup-form__row">
                <label>
                  <span>First name</span>
                  <input autoComplete="given-name" onChange={(e) => update("firstName", e.target.value)} required value={form.firstName} />
                </label>
                <label>
                  <span>Last name</span>
                  <input autoComplete="family-name" onChange={(e) => update("lastName", e.target.value)} required value={form.lastName} />
                </label>
              </div>
              <label>
                <span>Email</span>
                <input disabled readOnly value={form.email} />
              </label>
              <label>
                <span>Job title <small>(optional)</small></span>
                <input autoComplete="organization-title" onChange={(e) => update("jobTitle", e.target.value)} value={form.jobTitle} />
              </label>
              <label>
                <span>Phone <small>(optional)</small></span>
                <input autoComplete="tel" inputMode="tel" onChange={(e) => update("phone", e.target.value)} value={form.phone} />
                <small className="field-help">Optional. Used only for account recovery, urgent security alerts, or support.</small>
              </label>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="setup-step setup-step--enter">
            <p className="ob-kicker">{STEP_KICKERS[2]}</p>
            <h1 className="ob-heading">
              {form.accountType === "business" ? "Name your company workspace" : "Name your workspace"}
            </h1>
            <p className="ob-sub">
              {form.accountType === "business"
                ? "This is where your team will manage agents, approvals, and audit logs."
                : "Your personal control plane for agents, permissions, and decisions."}
            </p>
            <div className="setup-form">
              {form.accountType === "business" ? (
                <>
                  <label>
                    <span>Company name</span>
                    <input onChange={(e) => update("companyName", e.target.value)} required value={form.companyName} />
                  </label>
                  <label>
                    <span>Workspace name</span>
                    <input onChange={(e) => update("workspaceName", e.target.value)} required value={form.workspaceName} />
                  </label>
                  <label>
                    <span>Website <small>(optional)</small></span>
                    <input onChange={(e) => update("website", e.target.value)} placeholder="example.com" value={form.website} />
                  </label>
                  <label>
                    <span>Team size <small>(optional)</small></span>
                    <select onChange={(e) => update("teamSize", e.target.value as TeamSize | "")} value={form.teamSize}>
                      <option value="">Select…</option>
                      {TEAM_SIZES.map((size) => (
                        <option key={size} value={size}>{TEAM_SIZE_LABELS[size]}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <label>
                  <span>Workspace name</span>
                  <input onChange={(e) => update("workspaceName", e.target.value)} required value={form.workspaceName} />
                </label>
              )}
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="setup-step setup-step--enter">
            <p className="ob-kicker">{STEP_KICKERS[3]}</p>
            <h1 className="ob-heading">Which agents are entering your workflow?</h1>
            <p className="ob-sub">Select every coding agent or automation surface you want {BRAND_NAME} in front of.</p>
            <div className="setup-checkgrid setup-checkgrid--cards">
              {AGENT_TOOLS.map((tool) => (
                <label className={`setup-check setup-check--card${form.agentTools.includes(tool) ? " setup-check--card-active" : ""}`} key={tool}>
                  <input
                    checked={form.agentTools.includes(tool)}
                    onChange={() => toggleMulti("agentTools", tool)}
                    type="checkbox"
                  />
                  <span>{AGENT_TOOL_LABELS[tool]}</span>
                </label>
              ))}
            </div>
            {form.agentTools.includes("other") ? (
              <label className="setup-form">
                <span>Other agent</span>
                <input onChange={(e) => update("agentToolsOther", e.target.value)} placeholder="Describe the agent or toolchain" value={form.agentToolsOther} />
              </label>
            ) : null}
          </section>
        ) : null}

        {step === 5 ? (
          <section className="setup-step setup-step--enter">
            <p className="ob-kicker">{STEP_KICKERS[4]}</p>
            <h1 className="ob-heading">What should {BRAND_NAME} control first?</h1>
            <p className="ob-sub">Pick the risky surfaces you want gated, blocked, or audited from day one.</p>
            <div className="setup-checkgrid setup-checkgrid--cards">
              {CONTROL_AREAS.map((area) => (
                <label className={`setup-check setup-check--card${form.controlAreas.includes(area) ? " setup-check--card-active" : ""}`} key={area}>
                  <input
                    checked={form.controlAreas.includes(area)}
                    onChange={() => toggleMulti("controlAreas", area)}
                    type="checkbox"
                  />
                  <span>{CONTROL_AREA_LABELS[area]}</span>
                </label>
              ))}
            </div>
            {form.controlAreas.includes("other") ? (
              <label className="setup-form">
                <span>Other control area</span>
                <input onChange={(e) => update("controlAreasOther", e.target.value)} placeholder="Describe what you need governed" value={form.controlAreasOther} />
              </label>
            ) : null}
          </section>
        ) : null}

        {step === 6 ? (
          <section className="setup-step setup-step--enter">
            <p className="ob-kicker">{STEP_KICKERS[5]}</p>
            <h1 className="ob-heading">What is your first move?</h1>
            <p className="ob-sub">We will take you straight there when setup finishes.</p>
            <div className="ob-choices">
              {FIRST_MOVE_OPTIONS.map(({ goal, hint }) => (
                <button
                  className={`ob-choice${form.firstSetupGoal === goal ? " ob-choice--active" : ""}`}
                  key={goal}
                  onClick={() => update("firstSetupGoal", goal)}
                  type="button"
                >
                  <strong>{FIRST_SETUP_GOAL_LABELS[goal]}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="setup-actions">
          {step > 1 ? (
            <Button disabled={saving || finishing} onClick={goBack} type="button" variant="ghost">
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < 6 ? (
            <Button disabled={saving || finishing} onClick={() => void goNext()} type="button" variant="primary">
              {saving ? "Saving…" : "Continue"}
            </Button>
          ) : (
            <Button disabled={finishing} onClick={() => void finish()} type="button" variant="primary">
              {finishing ? "Finishing…" : "Finish setup"}
            </Button>
          )}
        </footer>
      </div>
    </main>
  );
}
