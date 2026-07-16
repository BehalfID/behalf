"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/AuthShell";
import { OnboardingIntro, OnboardingShell, StepActions } from "@/components/onboarding/OnboardingShell";
import { useDashboardPaths } from "@/components/workspace/WorkspaceProvider";

const STEP_LABELS = [
  { label: "Surface" },
  { label: "Identity" },
  { label: "Control profile" },
  { label: "Approval gates" },
  { label: "Credential" },
  { label: "Integration" },
  { label: "Test decision" },
  { label: "Audit logs" }
] as const;

const SetupNavigationContext = createContext<{
  onBack?: () => void;
  backDisabled?: boolean;
  step: number;
}>({ step: 1 });

export function FirstAgentSetupShell({
  step,
  children,
  onBack,
  backDisabled
}: {
  step: number;
  children: ReactNode;
  onBack?: () => void;
  backDisabled?: boolean;
}) {
  const { href } = useDashboardPaths();

  return (
    <SetupNavigationContext.Provider value={{ onBack, backDisabled, step }}>
      <OnboardingShell
        currentStep={step}
        embedded
        exitHref={href("/dashboard")}
        exitLabel="Exit setup"
        homeHref={href("/dashboard")}
        label="First agent setup"
        steps={STEP_LABELS}
      >
        {children}
      </OnboardingShell>
    </SetupNavigationContext.Provider>
  );
}

export function SetupStepIntro({
  title,
  helper,
  children
}: {
  title: string;
  helper?: string;
  children: ReactNode;
}) {
  const { step } = useContext(SetupNavigationContext);
  return (
    <>
      <OnboardingIntro
        eyebrow={`Agent setup · ${STEP_LABELS[step - 1]?.label ?? "Setup"}`}
        title={title}
        description={helper ?? "Complete this step to continue."}
      />
      {children}
    </>
  );
}

export function SetupChoiceGrid({
  children,
  columns = 2
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
}) {
  return (
    <div className={`setup-choices setup-choices--grid${columns === 1 ? " setup-choices--single" : columns === 3 ? " setup-choices--triple" : ""}`}>
      {children}
    </div>
  );
}

export function SetupChoiceButton({
  active,
  onClick,
  title,
  body,
  hint
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  body: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      className={`setup-choice${active ? " setup-choice--active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="setup-choice__mark setup-choice__mark--radio" aria-hidden="true">
        {active ? "✓" : ""}
      </span>
      <span className="setup-choice__body">
        <strong>{title}</strong>
        <span>{body}</span>
        {hint ? <span className="setup-choice__hint">{hint}</span> : null}
      </span>
    </button>
  );
}

export function SetupGateChoice({
  checked,
  onChange,
  title,
  body
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  body: string;
}) {
  return (
    <label className={`setup-choice setup-choice--check${checked ? " setup-choice--active" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="setup-choice__mark" aria-hidden="true">{checked ? "✓" : ""}</span>
      <span className="setup-choice__body">
        <strong>{title}</strong>
        <span>{body}</span>
      </span>
    </label>
  );
}

export function SetupContinueRow({
  onContinue,
  continueLabel = "Continue",
  disabled,
  loading,
  error
}: {
  onContinue: () => void;
  continueLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
}) {
  const { onBack, backDisabled } = useContext(SetupNavigationContext);
  return (
    <>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <StepActions
        backDisabled={backDisabled}
        continueDisabled={disabled}
        continueLabel={continueLabel}
        loading={loading}
        onBack={onBack}
        onContinue={onContinue}
      />
    </>
  );
}

export function VerificationLockBanner({ emailVerified }: { emailVerified: boolean }) {
  if (emailVerified) return null;
  return (
    <FormAlert tone="notice">
      <strong>Email verification required.</strong> You can review this setup path, but agent creation and tokens stay locked until verification is complete.{" "}
      <Link href="/verify-email">Verify now</Link>
    </FormAlert>
  );
}
