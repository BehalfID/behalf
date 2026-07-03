"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IndividualSetupIcon, TeamSetupIcon } from "@/components/onboarding/SetupIcons";
import { Button, Logo } from "@/components/ui";
import {
  AGENT_TOOL_LABELS,
  AGENT_TOOLS,
  CONTROL_AREA_LABELS,
  CONTROL_AREAS,
  FIRST_SETUP_GOAL_LABELS,
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
    title: "Individual",
    body: "Personal workspace for your own agents and approvals.",
    Icon: IndividualSetupIcon
  },
  {
    type: "business",
    title: "Team / company",
    body: "Shared workspace with members, delegated approvals, and audit trails.",
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

function SetupSummary({ form, step }: { form: SetupState; step: Step }) {
  const accountLabel = form.accountType === "individual"
    ? "Individual"
    : form.accountType === "business"
      ? "Team / company"
      : null;
  const nameLabel = [form.firstName, form.lastName].filter(Boolean).join(" ") || null;
  const workspaceLabel = form.workspaceName || null;
  const agentsLabel = form.agentTools.length
    ? `${form.agentTools.length} selected`
    : null;
  const controlsLabel = form.controlAreas.length
    ? `${form.controlAreas.length} selected`
    : null;
  const firstMoveLabel = form.firstSetupGoal
    ? FIRST_SETUP_GOAL_LABELS[form.firstSetupGoal]
    : null;

  const items = [
    { label: "Workspace mode", value: accountLabel, done: step > 1 },
    { label: "Profile", value: nameLabel, done: step > 2 },
    { label: "Workspace", value: workspaceLabel, done: step > 3 },
    { label: "Agents", value: agentsLabel, done: step > 4 },
    { label: "Controls", value: controlsLabel, done: step > 5 },
    { label: "First move", value: firstMoveLabel, done: step > 6 }
  ];

  return (
    <aside className="setup-summary" aria-label="Configuration summary">
      <p className="setup-summary__title">Configuration</p>
      <dl className="setup-summary__list">
        {items.map(({ label, value, done }) => (
          <div className={`setup-summary__item${done ? " setup-summary__item--done" : ""}`} key={label}>
            <dt>{label}</dt>
            <dd>{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </aside>
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
    if (current === 1 && !form.accountType) return "Choose a workspace mode.";
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
          <p className="setup-meta">Account setup</p>
          <p className="setup-loading">Loading your setup…</p>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="ob-page setup-page" tabIndex={-1}>
      <div className="setup-shell">
        <header className="setup-header">
          <div className="setup-header__brand">
            <Logo />
            <p className="setup-meta">{BRAND_NAME} · Account setup</p>
          </div>
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
                  <span className="setup-progress__indicator" aria-hidden="true" />
                  <span className="setup-progress__label">{label}</span>
                </div>
              );
            })}
          </div>
        </header>

        <div className="setup-layout">
          <div className="setup-main">
            {!emailVerified ? (
              <div className="setup-banner" role="status">
                <strong>Verify your email when you can.</strong> You can finish setup now, but agent creation and API tokens stay locked until your email is verified.{" "}
                <Link href="/verify-email">Verify email</Link>
              </div>
            ) : null}

            {error ? <p className="form-error setup-error" role="alert">{error}</p> : null}

            {step === 1 ? (
              <section className="setup-step setup-step--enter">
                <div className="setup-step__header">
                  <p className="setup-meta">Step 1 of 6 · Workspace mode</p>
                  <h1 className="setup-heading">Select workspace mode</h1>
                  <p className="setup-lede">Choose how this control plane will be organized and governed.</p>
                </div>
                <div className="setup-panel">
                  <div className="setup-mode-list">
                    {ACCOUNT_TYPE_OPTIONS.map(({ type, title, body, Icon }) => (
                      <button
                        className={`setup-mode${form.accountType === type ? " setup-mode--active" : ""}`}
                        key={type}
                        onClick={() => update("accountType", type)}
                        type="button"
                      >
                        <span className="setup-mode__icon">
                          <Icon size={24} />
                        </span>
                        <span className="setup-mode__copy">
                          <strong>{title}</strong>
                          <span>{body}</span>
                        </span>
                        <span className="setup-mode__check" aria-hidden="true">{form.accountType === type ? "✓" : ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {step === 2 ? (
              <section className="setup-step setup-step--enter">
                <div className="setup-step__header">
                  <p className="setup-meta">Step 2 of 6 · Profile</p>
                  <h1 className="setup-heading">Your profile</h1>
                  <p className="setup-lede">Used for account recovery, audit attribution, and workspace personalization.</p>
                </div>
                <div className="setup-panel">
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
                      <small className="field-help">Used only for account recovery, urgent security alerts, or support.</small>
                    </label>
                  </div>
                </div>
              </section>
            ) : null}

            {step === 3 ? (
              <section className="setup-step setup-step--enter">
                <div className="setup-step__header">
                  <p className="setup-meta">Step 3 of 6 · Workspace</p>
                  <h1 className="setup-heading">
                    {form.accountType === "business" ? "Company workspace" : "Workspace identity"}
                  </h1>
                  <p className="setup-lede">
                    {form.accountType === "business"
                      ? "Define the shared workspace where your team manages agents, approvals, and audit logs."
                      : "Name your personal control plane for agents, permissions, and decisions."}
                  </p>
                </div>
                <div className="setup-panel">
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
                </div>
              </section>
            ) : null}

            {step === 4 ? (
              <section className="setup-step setup-step--enter">
                <div className="setup-step__header">
                  <p className="setup-meta">Step 4 of 6 · Agents</p>
                  <h1 className="setup-heading">Agent surfaces</h1>
                  <p className="setup-lede">Select every coding agent or automation surface {BRAND_NAME} should govern.</p>
                </div>
                <div className="setup-panel">
                  <div className="setup-option-list">
                    {AGENT_TOOLS.map((tool) => (
                      <label className={`setup-option${form.agentTools.includes(tool) ? " setup-option--active" : ""}`} key={tool}>
                        <input
                          checked={form.agentTools.includes(tool)}
                          onChange={() => toggleMulti("agentTools", tool)}
                          type="checkbox"
                        />
                        <span className="setup-option__label">{AGENT_TOOL_LABELS[tool]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {form.agentTools.includes("other") ? (
                  <div className="setup-panel setup-panel--nested">
                    <label className="setup-form">
                      <span>Other agent</span>
                      <input onChange={(e) => update("agentToolsOther", e.target.value)} placeholder="Describe the agent or toolchain" value={form.agentToolsOther} />
                    </label>
                  </div>
                ) : null}
              </section>
            ) : null}

            {step === 5 ? (
              <section className="setup-step setup-step--enter">
                <div className="setup-step__header">
                  <p className="setup-meta">Step 5 of 6 · Controls</p>
                  <h1 className="setup-heading">Control surfaces</h1>
                  <p className="setup-lede">Select the risky operations to gate, block, or audit from day one.</p>
                </div>
                <div className="setup-panel">
                  <div className="setup-option-list">
                    {CONTROL_AREAS.map((area) => (
                      <label className={`setup-option${form.controlAreas.includes(area) ? " setup-option--active" : ""}`} key={area}>
                        <input
                          checked={form.controlAreas.includes(area)}
                          onChange={() => toggleMulti("controlAreas", area)}
                          type="checkbox"
                        />
                        <span className="setup-option__label">{CONTROL_AREA_LABELS[area]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {form.controlAreas.includes("other") ? (
                  <div className="setup-panel setup-panel--nested">
                    <label className="setup-form">
                      <span>Other control area</span>
                      <input onChange={(e) => update("controlAreasOther", e.target.value)} placeholder="Describe what you need governed" value={form.controlAreasOther} />
                    </label>
                  </div>
                ) : null}
              </section>
            ) : null}

            {step === 6 ? (
              <section className="setup-step setup-step--enter">
                <div className="setup-step__header">
                  <p className="setup-meta">Step 6 of 6 · First move</p>
                  <h1 className="setup-heading">Initial action</h1>
                  <p className="setup-lede">We will route you directly to this task when setup completes.</p>
                </div>
                <div className="setup-panel">
                  <div className="setup-choice-list">
                    {FIRST_MOVE_OPTIONS.map(({ goal, hint }) => (
                      <button
                        className={`setup-choice${form.firstSetupGoal === goal ? " setup-choice--active" : ""}`}
                        key={goal}
                        onClick={() => update("firstSetupGoal", goal)}
                        type="button"
                      >
                        <span className="setup-choice__copy">
                          <strong>{FIRST_SETUP_GOAL_LABELS[goal]}</strong>
                          <span>{hint}</span>
                        </span>
                        <span className="setup-choice__check" aria-hidden="true">{form.firstSetupGoal === goal ? "✓" : ""}</span>
                      </button>
                    ))}
                  </div>
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
                  {finishing ? "Finishing…" : "Complete setup"}
                </Button>
              )}
            </footer>
          </div>

          <SetupSummary form={form} step={step} />
        </div>
      </div>
    </main>
  );
}
