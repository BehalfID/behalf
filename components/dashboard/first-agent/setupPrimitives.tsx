"use client";

import Link from "next/link";
import type { ReactNode } from "react";

const STEP_LABELS = [
  "Surface",
  "Identity",
  "Profile",
  "Gates",
  "Token",
  "Integrate",
  "Test",
  "Logs"
] as const;

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
  const progress = Math.round((step / STEP_LABELS.length) * 100);

  return (
    <div className="setup-flow first-agent-setup">
      <header className="setup-flow__bar">
        <Link href="/dashboard" className="site-logo" aria-label="BehalfID dashboard"> {/* pragma: allowlist secret */}
          <strong>BehalfID</strong> {/* pragma: allowlist secret */}
          <small>First agent setup</small>
        </Link>
        <div className="setup-flow__progress" aria-label={`Step ${step} of ${STEP_LABELS.length}`}>
          <span className="setup-flow__step-label">
            Step {step} · {STEP_LABELS[step - 1] ?? "Setup"}
          </span>
          <div className="setup-flow__track" aria-hidden="true">
            <div className="setup-flow__fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <main className="setup-flow__main">{children}</main>

      {onBack ? (
        <div className="setup-actions setup-actions--floating">
          <button type="button" className="ui-button ui-button--ghost" onClick={onBack} disabled={backDisabled}>
            Back
          </button>
        </div>
      ) : null}
    </div>
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
  return (
    <>
      <h1 className="setup-heading setup-flow__question">{title}</h1>
      {helper ? <p className="setup-flow__helper">{helper}</p> : null}
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
      className={`setup-choice${active ? " setup-choice--active" : ""}${hint ? "" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="setup-choice__mark setup-choice__mark--radio" aria-hidden="true" />
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
      <span className="setup-choice__mark" aria-hidden="true" />
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
  error
}: {
  onContinue: () => void;
  continueLabel?: string;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div className="setup-actions">
      <span aria-hidden="true" />
      <div className="setup-actions__right">
        {error ? <p className="form-error setup-error" role="alert">{error}</p> : null}
        <button type="button" className="ui-button ui-button--primary" onClick={onContinue} disabled={disabled}>
          {continueLabel}
        </button>
      </div>
    </div>
  );
}

export function VerificationLockBanner({ emailVerified }: { emailVerified: boolean }) {
  if (emailVerified) return null;
  return (
    <div className="setup-banner" role="status">
      <strong>Email verification required.</strong> You can review this setup path, but agent creation and tokens stay locked until verification is complete.{" "}
      <Link href="/verify-email">Verify now</Link>
    </div>
  );
}
